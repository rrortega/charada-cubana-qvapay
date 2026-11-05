// Draw queries for the mini-app UI.
//
// Two screens share this module:
//   * "Tiros"     — one date, chosen with quick options or a calendar.
//   * "Historial" — a 365-day list in the shape of the same card.
//
// The charada meanings come from the delivered table in public/significados, not
// from Postgres: one source for the cargador and for the Significados section.

import { principalMeanings } from '../content/charada.js';
//
// A draw view carries everything a card needs:
//   fijo       three digits, the leading one shown in the accent colour
//   corridos   the two halves of Pick 4
//   parles     the three two-number combinations
//   candado    the three numbers as XX.XX.XX
//
// Derivation rules are pinned in docs/cargador-contract.md and proven in
// tests/cargador.test.js and tests/draws.test.js against real draws.

import { computeCargador, computeCharadaNumbers, computeParles, formatCandado } from '../domain/cargador.js';

/**
 * Postgres returns DATE as a JS Date at local midnight; JSON would serialise it
 * as a full timestamp. Emit a plain YYYY-MM-DD so clients never have to guess
 * about time zones for a calendar date.
 */
export function toIsoDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Build the view model for one stored draw row. */
export function toDrawView(row, meanings) {
  const { base3, base4, drawDate, drawType, date } = row;
  const cargador = computeCargador(base3);
  const pad2 = (n) => String(n).padStart(2, '0');

  // The Pick 4 may not be published yet. In that case the cargador still exists
  // (it only needs Pick 3), but corridos, parles and candado are unknown.
  const complete = Array.isArray(base4) && base4.length === 4;

  if (!complete) {
    return {
      date: toIsoDate(date ?? drawDate),
      drawType,
      complete: false,
      fijo: {
        value: cargador.fijo,
        formatted: String(cargador.fijo).padStart(3, '0'),
        digits: base3,
        significado: meanings.get(cargador.fijo % 100) ?? null,
      },
      corridos: [],
      parles: [],
      candado: { raw: null, formatted: '' },
      charada: {
        value: cargador.fijo % 100,
        formatted: pad2(cargador.fijo % 100),
        significado: meanings.get(cargador.fijo % 100) ?? null,
      },
    };
  }

  const numbers = computeCharadaNumbers(base3, base4);

  return {
    complete: true,
    date: toIsoDate(date ?? drawDate),
    drawType,
    fijo: {
      value: cargador.fijo,
      formatted: String(cargador.fijo).padStart(3, '0'),
      digits: base3,
      significado: meanings.get(numbers.charada) ?? null,
    },
    corridos: [
      { value: numbers.corrido1, formatted: pad2(numbers.corrido1),
        significado: meanings.get(numbers.corrido1) ?? null },
      { value: numbers.corrido2, formatted: pad2(numbers.corrido2),
        significado: meanings.get(numbers.corrido2) ?? null },
    ],
    parles: computeParles(numbers).map((p) => ({
      top: { value: p.top, formatted: pad2(p.top), significado: meanings.get(p.top) ?? null },
      bottom: { value: p.bottom, formatted: pad2(p.bottom), significado: meanings.get(p.bottom) ?? null },
    })),
    candado: {
      raw: numbers,
      formatted: formatCandado(numbers),
    },
    charada: {
      value: numbers.charada,
      formatted: pad2(numbers.charada),
      significado: meanings.get(numbers.charada) ?? null,
    },
  };
}

async function loadMeanings() {
  // The meanings come from the delivered charada table, not from Postgres: the
  // same source the Significados section reads, so one number cannot say one
  // thing here and another in its ficha.
  return principalMeanings();
}

const DRAW_SELECT = `
  SELECT c.date, c.draw_type AS "drawType",
         d3.base_digits AS base3,
         d4.base_digits AS base4
  FROM cargadores c
  JOIN draws d3 ON d3.id = c.draw_id
  -- LEFT JOIN: a Pick 3 can be published before its Pick 4 partner. Demanding
  -- both made a fresh draw vanish entirely until the second arrived.
  LEFT JOIN draws d4 ON d4.game_id = 108
                    AND d4.draw_date = c.date
                    AND d4.draw_type = c.draw_type`;

/** Latest date that has at least one stored draw. */
export async function latestDate(pool) {
  const { rows } = await pool.query('SELECT max(date) AS d FROM cargadores');
  return toIsoDate(rows[0]?.d);
}

/**
 * Both draws for one date.
 * Returns nulls per turn when that turn is missing, never a partial card.
 */
export async function drawsForDate(pool, isoDate, meanings = null) {
  const table = meanings ?? (await loadMeanings());
  const { rows } = await pool.query(
    `${DRAW_SELECT} WHERE c.date = $1::date ORDER BY c.draw_type`,
    [isoDate],
  );
  const byType = new Map(rows.map((r) => [r.drawType, toDrawView(r, table)]));
  return {
    date: isoDate,
    midday: byType.get('MIDDAY') ?? null,
    evening: byType.get('EVENING') ?? null,
    available: rows.length > 0,
  };
}

/**
 * Up to `limit` days ending at `endDate` (default: the latest stored date),
 * newest first. Each entry groups both turns of that day.
 */
export async function dayList(pool, { endDate = null, limit = 365 } = {}) {
  const meanings = await loadMeanings();
  const end = endDate ?? (await latestDate(pool));
  if (!end) return { endDate: null, days: [] };

  const { rows } = await pool.query(
    `${DRAW_SELECT}
     WHERE c.date <= $1::date
       AND c.date > $1::date - $2::int
     ORDER BY c.date DESC, c.draw_type`,
    [end, limit],
  );

  const byDate = new Map();
  for (const row of rows) {
    const iso = toIsoDate(row.date);
    if (!byDate.has(iso)) byDate.set(iso, { date: iso, midday: null, evening: null });
    byDate.get(iso)[row.drawType === 'MIDDAY' ? 'midday' : 'evening'] = toDrawView(row, meanings);
  }

  return { endDate: end, days: [...byDate.values()] };
}

/**
 * Earliest and latest dates that have data, so the calendar can bound itself.
 */
export async function availableRange(pool) {
  const { rows } = await pool.query('SELECT min(date) AS a, max(date) AS b FROM cargadores');
  return { from: toIsoDate(rows[0]?.a), to: toIsoDate(rows[0]?.b) };
}

/**
 * Chronological lookup-number history, for the analyser.
 * A draw's lookup number is the last two digits of its fijo.
 */
export async function historyForAnalysis(pool) {
  const { rows } = await pool.query(`
    SELECT to_char(c.date,'YYYY-MM-DD') AS date, c.draw_type AS "drawType", c.dos_ultimos AS lookup
    FROM cargadores c
    ORDER BY c.date, c.draw_type`);
  return rows.map((r) => ({ date: r.date, drawType: r.drawType, lookup: Number(r.lookup) }));
}

/** Charada meaning for one number, or null when the table has no entry. */
export async function meaningOf(number) {
  const meanings = await principalMeanings();
  return meanings.get(Number(number)) ?? null;
}

/**
 * Countdown to the next draw window, in America/New_York.
 *
 * The user's rule: while it is before 8pm in Miami the next draw is flagged.
 */
export function nextDrawInfo(now = new Date(), cutoffHour = 20) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const second = Number(parts.second);

  const secondsIntoDay = hour * 3600 + minute * 60 + second;
  const cutoff = cutoffHour * 3600;
  const remaining = cutoff - secondsIntoDay;

  if (remaining <= 0) {
    return { active: false, secondsRemaining: 0, cutoffHour };
  }
  return { active: true, secondsRemaining: remaining, cutoffHour };
}
