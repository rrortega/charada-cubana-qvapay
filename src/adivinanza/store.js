// The adivinanza of the day: one row per date, generated once and then read.
//
// Two rules drive the shape of this module:
//   * the text is persisted, so a date always answers the same thing and the
//     history can be walked back (S2, S4);
//   * generation is idempotent under concurrency. Two requests for a date that
//     has no row must not spend two model calls, and two processes must not
//     produce two different texts: the insert is `on conflict do nothing` and
//     the loser of that race reads the winner's row.

import { createLlm } from '../llm/openai.js';
import {
  buildPrompt,
  normaliseAdivinanza,
  leakedMeanings,
  leakRejection,
  banInstruction,
  PROMPT_VERSION,
} from '../content/adivinanza.js';
import { drawsForDate } from '../http/draws.js';
import { principalMeanings } from '../content/charada.js';

const COLUMNS = 'date, texto, fijo, generated_at';

/** Rows carry JS Dates; the client only ever needs a calendar date. */
function toView(row) {
  return {
    date: typeof row.date === 'string' ? row.date.slice(0, 10) : isoDate(row.date),
    texto: row.texto,
    fijo: row.fijo ?? null,
    generatedAt: row.generated_at instanceof Date ? row.generated_at.toISOString() : row.generated_at ?? null,
  };
}

function isoDate(value) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The stored text for one date, or null. */
export async function findForDate(pool, date) {
  const { rows } = await pool.query(`select ${COLUMNS} from adivinanzas where date = $1`, [date]);
  return rows[0] ? toView(rows[0]) : null;
}

/** The most recent texts, newest first, for the history list (S4). */
export async function listRecent(pool, { limit = 30 } = {}) {
  const capped = Math.min(Math.max(1, Number(limit) || 30), 90);
  const { rows } = await pool.query(
    `select ${COLUMNS} from adivinanzas order by date desc limit $1`,
    [capped],
  );
  return rows.map(toView);
}

/**
 * Pick the cargador the text is built from.
 *
 * The evening draw is the one people play, so it wins; the midday is the
 * fallback while the night is still unpublished. Nothing published at all is a
 * real state, not an error: the screen has to say "todavía no hay tiro".
 */
function pickCargador(out) {
  if (out?.evening?.complete) return out.evening;
  if (out?.midday?.complete) return out.midday;
  return null;
}

/**
 * Build the service the routes use.
 *
 * @param {object} options
 * @param {import('pg').Pool} options.pool
 * @param {ReturnType<typeof createLlm>} [options.llm]  provider, injectable for tests
 * @param {(date: string) => Promise<object>} [options.loadDraws]
 * @param {(n: number) => Promise<string|null>} [options.meaningOf]
 * @param {Console} [options.log]
 */
export function createAdivinanzaService({
  pool,
  llm = createLlm(),
  loadDraws = (date) => drawsForDate(pool, date),
  meaningOf = async (n) => (await principalMeanings()).get(n) ?? null,
  log = console,
} = {}) {
  /** @type {Map<string, Promise<object>>} */
  const inFlight = new Map();

  /**
   * Ask the model, with one retry.
   *
   * A reasoning model occasionally answers with no text at all, or writes a
   * text that the quality filter rejects; both are variance, not a broken
   * configuration, and one more attempt usually fixes them. A bad key or a bad
   * model name is a 4xx and never retried.
   */
  async function askModel(prompt, date, meaningNames) {
    let lastError;
    let ban = '';

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const text = normaliseAdivinanza(await llm.complete({ ...prompt, user: prompt.user + ban }));

        // S9: a meaning that appears by name is the failure the whole design is
        // guarding against, so it buys one more attempt with the words banned.
        const leaked = leakedMeanings(text, meaningNames);
        if (leaked.length === 0) return text;

        lastError = leakRejection(leaked);
        ban = banInstruction(leaked);
        log.warn?.(`adivinanza ${date}: nombra ${leaked.join(', ')}, reintento`);
      } catch (err) {
        lastError = err;
        const retryable = !/^llm_(not_configured|http_4)/.test(String(err?.code ?? ''));
        if (!retryable || attempt === 2) throw err;
        log.warn?.(`adivinanza ${date}: ${err.code}, reintento`);
      }
    }

    throw lastError;
  }

  async function generate(date) {
    const out = await loadDraws(date);
    const cargador = pickCargador(out);
    if (!cargador) return { status: 'sin_tiro' };

    // Resolve the day's meanings once, then hand the generator a sync lookup.
    const digits = cargador.fijo?.digits ?? [];
    const numbers = [...new Set([
      digits[0],
      cargador.charada?.value,
      ...(cargador.corridos ?? []).map((row) => row.value),
    ])].filter((n) => Number.isInteger(n) && n > 0);
    const meanings = new Map();
    for (const n of numbers) meanings.set(n, await meaningOf(n));

    const texto = await askModel(buildPrompt({
      date,
      cargador,
      meaningFor: (n) => meanings.get(n) ?? null,
    }), date, [...meanings.values()].filter(Boolean));

    // The cargador row is the provenance: which draw produced this text.
    const { rows } = await pool.query(
      `insert into adivinanzas (date, texto, fijo, source_cargador_id)
       values ($1, $2, $3, (select id from cargadores where date = $1 order by computed_at desc limit 1))
       on conflict (date) do nothing
       returning ${COLUMNS}`,
      [date, texto, cargador.fijo?.value ?? null],
    );

    // Another process stored a text for this date first: theirs is the truth.
    if (rows[0]) return { status: 'generated', adivinanza: toView(rows[0]) };
    const stored = await findForDate(pool, date);
    return stored ? { status: 'stored', adivinanza: stored } : { status: 'sin_tiro' };
  }

  /**
   * Answer for a date, generating it when it is not stored yet.
   *
   * Never throws for a provider problem: a screen that cannot be filled must be
   * able to say why (S7). Database errors do propagate — those are ours.
   */
  async function ensure(date) {
    const stored = await findForDate(pool, date);
    if (stored) return { status: 'stored', adivinanza: stored };
    if (!llm.configured) return { status: 'unconfigured' };

    const pending = inFlight.get(date);
    if (pending) return pending;

    const run = (async () => {
      try {
        return await generate(date);
      } catch (err) {
        if (typeof err?.code === 'string' && err.code.startsWith('llm_')) {
          log.warn?.(`adivinanza ${date}: ${err.code}`);
          return { status: 'error', code: err.code };
        }
        if (typeof err?.code === 'string' && err.code.startsWith('adivinanza_')) {
          log.warn?.(`adivinanza ${date}: ${err.code} (${err.message})`);
          return { status: 'rejected', code: err.code };
        }
        throw err;
      } finally {
        inFlight.delete(date);
      }
    })();

    inFlight.set(date, run);
    return run;
  }

  return {
    ensure,
    find: (date) => findForDate(pool, date),
    recent: (options) => listRecent(pool, options),
    configured: llm.configured,
    model: llm.model,
    promptVersion: PROMPT_VERSION,
  };
}
