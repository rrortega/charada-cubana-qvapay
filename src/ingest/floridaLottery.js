// Florida Lottery results client.
//
// Upstream endpoints live on an Azure API Gateway fronting an AEM site and are
// undocumented. Verified behaviour (2026-11):
//   * Every request needs header `x-partner: web`; otherwise 401 "Missing header".
//   * Dates use the format `D-MMM-YYYY`, uppercase month, e.g. `3-NOV-2026`.
//   * Game ids: PICK 3 = 104, PICK 4 = 108.
//   * Responses come back in NON-deterministic order. Callers must sort and
//     deduplicate by (drawDate, drawType) before trusting them.

const BASE_URL = 'https://apim-website-prod-eastus.azure-api.net';
const PARTNER_HEADER = 'x-partner';
const PARTNER_VALUE = 'web';

export const GAME_IDS = Object.freeze({ pick3: 104, pick4: 108 });

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Format a Date as the `D-MMM-YYYY` string the upstream API expects. */
export function formatUpstreamDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${date}`);
  return `${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

/**
 * Parse the upstream draw date `MM/DD/YYYY hh:mm:ss AM` into a `YYYY-MM-DD` string.
 * Returns null when the value does not match, so callers can skip rather than
 * store a corrupted date.
 */
export function parseUpstreamDrawDate(value) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s/.exec(String(value ?? ''));
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Split upstream DrawNumbers into base digits and the Fireball.
 *
 * The Fireball (`NumberType === 'fb'`) is an extra prize number and is NOT part
 * of the winning pick. Conflating them corrupts the cargador.
 *
 * Position matters: `wn1`, `wn2`, `wn3` (and `wn4`) are the digits in order, so
 * the base array is returned sorted by its winning position, never by value.
 */
export function splitDrawNumbers(drawNumbers) {
  const positioned = [];
  let fireball = null;
  for (const n of drawNumbers ?? []) {
    const type = String(n?.NumberType ?? '').toLowerCase();
    const value = n?.NumberPick;
    if (!Number.isInteger(value)) continue;
    if (type === 'fb') {
      fireball = value;
    } else if (/^wn\d+$/.test(type)) {
      positioned.push({ index: Number(type.slice(2)), value });
    }
  }
  positioned.sort((a, b) => a.index - b.index);
  const base = positioned.map((p) => p.value);
  return { base, fireball };
}
async function getJson(path, { fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(`${BASE_URL}${path}`, {
    headers: { [PARTNER_HEADER]: PARTNER_VALUE },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Upstream ${path} failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Latest draw for every game, in one request. */
export async function fetchLatestDraws(opts) {
  return getJson('/drawgamesapp/getLatestDrawGames', opts);
}

/** Historical draws for one game within an inclusive date range. */
export async function fetchDrawHistory(gameId, startDate, endDate, opts) {
  const q = new URLSearchParams({
    id: String(gameId),
    startDate: formatUpstreamDate(startDate),
    endDate: formatUpstreamDate(endDate),
  });
  return getJson(`/drawgamesapp/searchgames?${q}`, opts);
}

/**
 * Normalise a raw upstream record into the shape the ingest stores.
 * Returns null when the record is unusable, so one bad row never aborts a run.
 */
export function normaliseDraw(record, { expectedGameId, winningDigits }) {
  if (!record || Number(record.Id) !== Number(expectedGameId)) return null;
  const drawDate = parseUpstreamDrawDate(record.DrawDate);
  if (!drawDate) return null;
  const drawType = String(record.DrawType ?? '').toUpperCase();
  if (drawType !== 'MIDDAY' && drawType !== 'EVENING') return null;

  const { base, fireball } = splitDrawNumbers(record.DrawNumbers);
  if (base.length !== winningDigits) return null;

  return {
    gameId: Number(record.Id),
    drawDate,
    drawType,
    baseDigits: base,
    fireball,
    totalWinners: Number.isInteger(record.TotalWinners) ? record.TotalWinners : null,
    totalPayouts: record.TotalPayouts ?? null,
    rawPayload: record,
  };
}

/**
 * Normalise a batch, de-duplicating by (drawDate, drawType).
 *
 * The upstream order is not deterministic and a record can repeat, so this is
 * required, not defensive.
 */
export function normaliseBatch(records, opts) {
  const byKey = new Map();
  for (const record of records ?? []) {
    const draw = normaliseDraw(record, opts);
    if (!draw) continue;
    const key = `${draw.drawDate}|${draw.drawType}`;
    if (!byKey.has(key)) byKey.set(key, draw);
  }
  return [...byKey.values()].sort(
    (a, b) => a.drawDate.localeCompare(b.drawDate) || a.drawType.localeCompare(b.drawType),
  );
}
