// Persistence of dream signals (S2, S3).
//
// A dream is stored as an anonymous envelope plus one row per signal; the text
// the user wrote never reaches a column. The readers exist because of S3: what
// matters is that several people dreamt something similar in the same week, so
// the counter counts dreams per signal and the similarity read compares one
// dream against the others — and never hands back their signals.

import { PROMPT_VERSION } from './analizar.js';

function invalid(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Store one analysed dream.
 *
 * The envelope and its signals are one unit: a partial dream would count in the
 * weekly counter while missing the signals that explain it, so the whole insert
 * is a transaction.
 *
 * @param {import('pg').Pool} pool
 * @param {{ senales: Array<{nombre: string, peso: number, numeros: number[]}>,
 *           userId?: number|null, modelo?: string|null }} input
 * @returns {Promise<{ id: string }>}
 */
export async function guardarSueno(pool, { senales, userId = null, modelo = null }) {
  if (!Array.isArray(senales) || senales.length === 0) {
    throw invalid('sueno_sin_senales', 'no hay señales que guardar');
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows } = await client.query(
      `insert into suenos (user_id, modelo, prompt_version) values ($1, $2, $3) returning id`,
      [userId, modelo, PROMPT_VERSION],
    );
    const id = rows[0].id;

    for (const senal of senales) {
      await client.query(
        `insert into sueno_senales (sueno_id, senal, numeros, peso) values ($1, $2, $3, $4)`,
        [id, senal.nombre, senal.numeros ?? [], senal.peso ?? 1],
      );
    }

    await client.query('commit');
    return { id };
  } catch (err) {
    // The rollback itself can fail on a dead connection; the original error is
    // the one worth reporting.
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release?.();
  }
}

/**
 * The weekly counter: how many dreams carried each signal.
 *
 * Distinct dreams, not rows: the same signal repeated inside one dream is still
 * one person dreaming it.
 *
 * @param {import('pg').Pool} pool
 * @param {{ dias?: number, limite?: number }} [options]
 * @returns {Promise<Array<{senal: string, suenos: number}>>}
 */
export async function contarSenales(pool, { dias = 7, limite = 12 } = {}) {
  const window = clampInt(dias, 7, 1, 90);
  const limit = clampInt(limite, 12, 1, 100);

  const { rows } = await pool.query(
    `select s.senal, count(distinct s.sueno_id)::int as suenos
       from sueno_senales s
       join suenos d on d.id = s.sueno_id
      where d.created_at >= now() - make_interval(days => $1)
      group by s.senal
      order by suenos desc, s.senal asc
      limit $2`,
    [window, limit],
  );

  return rows.map((row) => ({ senal: row.senal, suenos: Number(row.suenos) }));
}

/**
 * Other dreams of the window that share at least `minimo` of these signals.
 *
 * The projection is the privacy rule (S4): another dream is an id and a count.
 * Its signals are never named, so nothing of one user's dream can be read
 * through another user's answer.
 *
 * @param {import('pg').Pool} pool
 * @param {{ suenoId: string, senales: string[], dias?: number, minimo?: number }} input
 * @returns {Promise<{ total: number, muestra: Array<{suenoId: string, compartidas: number}> }>}
 */
export async function suenosParecidos(pool, { suenoId, senales = [], dias = 7, minimo = 2 } = {}) {
  const names = [...new Set(senales)];
  if (names.length === 0) return { total: 0, muestra: [] };

  const window = clampInt(dias, 7, 1, 90);
  const floor = clampInt(minimo, 2, 1, 100);

  // `count(*) over ()` counts the matching dreams before the sample is cut, so
  // the total and the five examples come from one round trip.
  const { rows } = await pool.query(
    `select d.id as "suenoId", count(distinct s.senal)::int as compartidas,
            count(*) over ()::int as total
       from suenos d
       join sueno_senales s on s.sueno_id = d.id
      where d.id <> $1
        and d.created_at >= now() - make_interval(days => $3)
        and s.senal = any($2::text[])
      group by d.id, d.created_at
     having count(distinct s.senal) >= $4
      order by compartidas desc, d.created_at desc
      limit 5`,
    [suenoId, names, window, floor],
  );

  const muestra = rows.map((row) => ({
    suenoId: row.suenoId ?? row.sueno_id,
    compartidas: Number(row.compartidas),
  }));

  return { total: rows.length === 0 ? 0 : Number(rows[0].total), muestra };
}
