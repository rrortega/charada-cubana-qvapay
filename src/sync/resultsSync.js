// Result synchronisation.
//
// The app must have today's draw the moment it is published, because that is
// when people look. Two mechanisms cooperate:
//
//   1. On-demand: a read that finds the newest draw older than expected kicks a
//      refresh off in the background. The request returns immediately with what
//      is stored, never blocked by the network.
//   2. Scheduled: a timer refreshes on a short interval around draw times, so
//      the data is warm even with no visitors.
//
// Both funnel through `refresh()`, which is single-flight: concurrent callers
// share one in-flight fetch instead of hammering the upstream API. A cooldown
// prevents a burst of reads from triggering repeated upstream calls.
//
// When a refresh actually inserts new draws it emits them, which is the signal
// the corazonada matcher will hook into.

import { fetchLatestDraws, fetchDrawHistory, normaliseBatch, GAME_IDS } from '../ingest/floridaLottery.js';
import { computeCargador } from '../domain/cargador.js';

const STATUS_LIMIT_BASE = 'https://apim-website-prod-eastus.azure-api.net';
const DEFAULT_COOLDOWN_MS = 60_000;

/** @typedef {{onNewDraws?: (draws: object[]) => void}} RefreshHooks */

export function createSync({ pool, cooldownMs = DEFAULT_COOLDOWN_MS, now = () => Date.now(), log = console } = {}) {
  let inFlight = null;
  let lastRunAt = 0;
  /** @type {RefreshHooks} */
  let hooks = {};

  function onNewDraws(fn) {
    hooks = { ...hooks, onNewDraws: fn };
    return () => { hooks = { ...hooks, onNewDraws: undefined }; };
  }

  /** Newest stored draw date as YYYY-MM-DD, or null. */
  async function newestStoredDate() {
    const { rows } = await pool.query('SELECT max(draw_date) AS d FROM draws WHERE game_id = $1', [GAME_IDS.pick3]);
    const d = rows[0]?.d;
    if (!d) return null;
    return typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
  }

  /** Newest date the upstream API is publishing, as YYYY-MM-DD. */
  function newestPublishedDate(rawDraws) {
    let newest = null;
    for (const r of rawDraws) {
      if (Number(r.Id) !== GAME_IDS.pick3) continue;
      const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(r.DrawDate ?? ''));
      if (!m) continue;
      const iso = `${m[3]}-${m[1]}-${m[2]}`;
      if (!newest || iso > newest) newest = iso;
    }
    return newest;
  }

  /**
   * Persist a normalised Pick 4 draw.
   *
   * Pick 4 carries no cargador of its own: it supplies the corridos, parlé and
   * candado numbers that the read path joins in by (date, draw_type). Without
   * it those panels have nothing to show, which is why a fresh day used to
   * render empty.
   */
  async function storePick4(draw) {
    const res = await pool.query(
      `INSERT INTO draws (game_id, draw_date, draw_type, base_digits, fireball, total_winners, total_payouts, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (game_id, draw_date, draw_type) DO NOTHING`,
      [GAME_IDS.pick4, draw.drawDate, draw.drawType, draw.baseDigits, draw.fireball,
        draw.totalWinners, draw.totalPayouts, JSON.stringify(draw.rawPayload)],
    );
    return res.rowCount > 0;
  }

  /** Persist a normalised draw and its cargador. Returns true when inserted. */
  async function store(draw) {
    const ins = await pool.query(
      `INSERT INTO draws (game_id, draw_date, draw_type, base_digits, fireball, total_winners, total_payouts, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (game_id, draw_date, draw_type) DO NOTHING
       RETURNING id`,
      [GAME_IDS.pick3, draw.drawDate, draw.drawType, draw.baseDigits, draw.fireball,
        draw.totalWinners, draw.totalPayouts, JSON.stringify(draw.rawPayload)],
    );

    let drawId = ins.rows[0]?.id;
    const inserted = Boolean(drawId);
    if (!inserted) {
      const found = await pool.query(
        'SELECT id FROM draws WHERE game_id=$1 AND draw_date=$2 AND draw_type=$3',
        [GAME_IDS.pick3, draw.drawDate, draw.drawType],
      );
      drawId = found.rows[0]?.id;
    }
    if (!drawId) return false;

    const c = computeCargador(draw.baseDigits);
    await pool.query(
      `INSERT INTO cargadores (draw_id, date, draw_type, fijo, prefijo, dos_ultimos)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (draw_id) DO NOTHING`,
      [drawId, draw.drawDate, draw.drawType, c.fijo, c.prefijo, c.dosUltimos],
    );

    return inserted;
  }

  /**
   * Fetch the latest results and store anything new.
   *
   * @param {{force?: boolean}} [opts] force ignores the cooldown
   * @returns {Promise<{skipped: boolean, inserted: number, newest: string|null}>}
   */
  async function refresh({ force = false } = {}) {
    if (inFlight) return inFlight;
    if (!force && now() - lastRunAt < cooldownMs) {
      return { skipped: true, inserted: 0, newest: await newestStoredDate() };
    }

    inFlight = (async () => {
      try {
        const raw = await fetchLatestDraws();
        const pick3 = normaliseBatch(raw, { expectedGameId: GAME_IDS.pick3, winningDigits: 3 });
        const pick4 = normaliseBatch(raw, { expectedGameId: GAME_IDS.pick4, winningDigits: 4 });

        const fresh = [];
        for (const draw of pick3) {
          // eslint-disable-next-line no-await-in-loop
          if (await store(draw)) fresh.push(draw);
        }
        // Pick 4 completes the cargador: ingest it too, or corridos/parlé/candado
        // stay empty for every newly published draw.
        for (const draw of pick4) {
          // eslint-disable-next-line no-await-in-loop
          if (await storePick4(draw)) fresh.push(draw);
        }

        lastRunAt = now();
        if (fresh.length > 0) {
          log.info?.(`sync: ${fresh.length} new draw(s):`, fresh.map((d) => `${d.drawDate}/${d.drawType}`).join(', '));
          try {
            hooks.onNewDraws?.(fresh);
          } catch (err) {
            log.error?.('sync: onNewDraws hook failed:', err.message);
          }
        }
        return { skipped: false, inserted: fresh.length, newest: newestPublishedDate(raw) };
      } catch (err) {
        // Never let a sync failure surface to a user-facing request.
        log.error?.('sync: refresh failed:', err.message);
        return { skipped: false, inserted: 0, error: err.message };
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  }

  /**
   * Backfill a date range. Used once at setup and by the manual script.
   */
  async function backfill(days) {
    const end = new Date();
    const start = new Date(end.getTime() - days * 86_400_000);
    const raw = await fetchDrawHistory(GAME_IDS.pick3, start, end);
    const p3 = normaliseBatch(raw, { expectedGameId: GAME_IDS.pick3, winningDigits: 3 });
    const p4 = normaliseBatch(raw, { expectedGameId: GAME_IDS.pick4, winningDigits: 4 });

    let inserted = 0;
    for (const draw of p3) {
      // eslint-disable-next-line no-await-in-loop
      if (await store(draw)) inserted += 1;
    }
    for (const draw of p4) {
      // eslint-disable-next-line no-await-in-loop
      if (await storePick4(draw)) inserted += 1;
    }
    return { total: p3.length + p4.length, inserted };
  }

  return { refresh, onNewDraws, newestStoredDate, backfill };
}

/**
 * Start the periodic refresh.
 *
 * The interval is short (5 minutes) but sampling is cheap: `refresh()` is
 * single-flight and honours a 60 s cooldown, so the upstream is hit at most once
 * a minute no matter how often the timer fires.
 *
 * @returns {() => void} stop
 */
export function startScheduler(sync, { everyMs = 5 * 60_000, log = console } = {}) {
  const timer = setInterval(() => { sync.refresh(); }, everyMs);
  timer.unref?.();
  log.info?.(`sync: scheduler every ${Math.round(everyMs / 1000)}s`);
  return () => clearInterval(timer);
}
