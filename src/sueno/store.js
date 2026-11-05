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

/** Calendar date of a stored timestamp: row dates carry no time of day. */
function toIsoDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
export async function guardarSueno(
  pool,
  { senales, texto = null, resumen = null, numeros = [], userId = null, modelo = null } = {},
) {
  if (!Array.isArray(senales) || senales.length === 0) {
    throw invalid('sueno_sin_senales', 'no hay señales que guardar');
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows } = await client.query(
      `insert into suenos (user_id, modelo, prompt_version, texto, resumen, numeros)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [userId, modelo, PROMPT_VERSION, texto, resumen, numeros],
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
 * The week's weight per number: the material the playable combinations come from.
 *
 * A signal carries candidate numbers; a number weighs as much as the signals
 * that named it, summed over the week. Signal weight is what the analyser
 * assigned, so a strong symbol counts more than a passing one.
 *
 * @param {import('pg').Pool} pool
 * @param {{ dias?: number, limite?: number }} [options]
 * @returns {Promise<Array<{numero: number, peso: number}>>}
 */
export async function contarNumeros(pool, { dias = 7, limite = 24 } = {}) {
  const window = clampInt(dias, 7, 1, 90);
  const limit = clampInt(limite, 24, 1, 100);

  const { rows } = await pool.query(
    `select n.numero::int as numero, sum(s.peso)::float as peso
       from suenos d
       join sueno_senales s on s.sueno_id = d.id
       cross join lateral unnest(s.numeros) as n(numero)
      where d.created_at >= now() - make_interval(days => $1)
      group by n.numero
      order by peso desc, numero asc
      limit $2`,
    [window, limit],
  );

  return rows.map((row) => ({ numero: Number(row.numero), peso: Number(row.peso) }));
}

/**
 * Other people's dreams of the window that share at least `minimo` signals.
 *
 * Two rules shape this read. A dream never matches its own author: comparing
 * someone with themselves is not a coincidence, it is a mirror. And the count
 * is of PEOPLE, not of dreams: five dreams by one person are one person who
 * dreamt five times.
 *
 * What travels back is that person's public profile — the QvaPay nickname and
 * avatar this app already holds — plus a number. Another dream's signals are
 * never named, so nothing of one user's dream can be read through another
 * user's answer.
 *
 * @param {import('pg').Pool} pool
 * @param {{ suenoId: string, senales: string[], usuarioId?: number|null, dias?: number, minimo?: number }} input
 * @returns {Promise<{ total: number, muestra: Array<{nombre: string, avatar: string|null, compartidas: number}> }>}
 */
export async function suenosParecidos(
  pool,
  { suenoId, senales = [], usuarioId = null, dias = 7, minimo = 2 } = {},
) {
  const names = [...new Set(senales)];
  if (names.length === 0) return { total: 0, muestra: [] };

  const window = clampInt(dias, 7, 1, 90);
  const floor = clampInt(minimo, 2, 1, 100);

  // `count(*) over ()` runs after the group by, so the total counts people and
  // the five examples come from the same round trip.
  const { rows } = await pool.query(
    `select u.username as nombre,
            u.avatar,
            max(sh.compartidas)::int as compartidas,
            count(*) over ()::int as total
       from (
         select d.id, d.user_id, count(distinct s.senal)::int as compartidas
           from suenos d
           join sueno_senales s on s.sueno_id = d.id
          where d.id <> $1
            and d.user_id is not null
            and ($5::bigint is null or d.user_id <> $5::bigint)
            and d.created_at >= now() - make_interval(days => $3)
            and s.senal = any($2::text[])
          group by d.id, d.user_id
         having count(distinct s.senal) >= $4
       ) sh
       join users u on u.id = sh.user_id
      group by u.id, u.username, u.avatar
      order by compartidas desc
      limit 5`,
    [suenoId, names, window, floor, usuarioId],
  );

  const muestra = rows.map((row) => ({
    nombre: row.nombre,
    avatar: row.avatar ?? null,
    compartidas: Number(row.compartidas),
  }));

  return { total: rows.length === 0 ? 0 : Number(rows[0].total), muestra };
}

/**
 * The author's own dreams, newest first.
 *
 * Scoped by `user_id`: the history of one account never crosses into another's.
 * The list carries a short reading and the numbers, which is what a row shows.
 *
 * @param {import('pg').Pool} pool
 * @param {{ usuarioId: number, limite?: number }} options
 * @returns {Promise<Array<{ id: string, fecha: string, resumen: string|null, numeros: number[] }>>}
 */
export async function historialDeSuenos(pool, { usuarioId, limite = 30 } = {}) {
  if (!usuarioId) return [];

  const limit = clampInt(limite, 30, 1, 100);
  const { rows } = await pool.query(
    `select id, created_at, resumen, numeros
       from suenos
      where user_id = $1
      order by created_at desc
      limit $2`,
    [usuarioId, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    fecha: toIsoDate(row.created_at),
    resumen: row.resumen ?? null,
    numeros: (row.numeros ?? []).map(Number),
  }));
}

/**
 * One stored dream of one author, with its reading and signals.
 *
 * Null when the id belongs to someone else or does not exist: the answer must
 * not tell the difference, or the ids become guessable.
 *
 * @param {import('pg').Pool} pool
 * @param {{ id: string, usuarioId: number }} options
 */
export async function suenoDe(pool, { id, usuarioId } = {}) {
  if (!id || !usuarioId) return null;

  const { rows } = await pool.query(
    `select id, created_at, texto, resumen, numeros
       from suenos
      where id = $1 and user_id = $2`,
    [id, usuarioId],
  );
  if (!rows[0]) return null;

  const senales = await pool.query(
    `select senal as nombre, numeros, peso
       from sueno_senales
      where sueno_id = $1
      order by peso desc, senal asc`,
    [id],
  );

  const row = rows[0];
  return {
    id: row.id,
    fecha: toIsoDate(row.created_at),
    texto: row.texto ?? '',
    resumen: row.resumen ?? null,
    numeros: (row.numeros ?? []).map(Number),
    senales: senales.rows.map((senal) => ({
      nombre: senal.nombre,
      peso: Number(senal.peso),
      numeros: (senal.numeros ?? []).map(Number),
    })),
  };
}
