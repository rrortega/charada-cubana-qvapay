// Per-number historical analysis.
//
// A number "sale" (comes out) when the charada lookup number of a draw equals
// it. For a fijo of 464 the lookup number is 64, so 64 counts as a hit.
//
// Everything here is DESCRIPTIVE. Florida Pick 3 draws are independent: across
// 3,536 draws each position is statistically uniform (see docs/analysis.md).
// Gap ("lleva N días sin salir") is a fact about the past, never a due date.
// The API always ships the expected value alongside so the UI can show the
// comparison instead of implying a pattern.

/** Number of draws that resolved to `target` (0..99). */
export function countHits(draws, target) {
  return draws.filter((d) => d.lookup === target).length;
}

/**
 * Days between hits: the average spacing expressed in draws.
 *
 * With 100 numbers and independent draws, the expected spacing is 100 draws.
 * The midpoint between consecutive hits is the usual gap.
 */
export function averageSpacing(draws, target) {
  const indexes = [];
  draws.forEach((d, i) => { if (d.lookup === target) indexes.push(i); });
  if (indexes.length < 2) return null;

  let sum = 0;
  for (let i = 1; i < indexes.length; i += 1) sum += indexes[i] - indexes[i - 1];
  return {
    draws: Number((sum / (indexes.length - 1)).toFixed(1)),
    hits: indexes.length,
  };
}

/**
 * Draws since the last hit, plus the historical maximum.
 *
 * `current` is null when the number never appeared.
 */
export function currentGap(draws, target) {
  let lastIndex = -1;
  let maxGap = 0;
  let running = 0;

  draws.forEach((d, i) => {
    if (d.lookup === target) {
      if (lastIndex >= 0) maxGap = Math.max(maxGap, i - lastIndex - 1);
      lastIndex = i;
    } else {
      running += 1;
    }
  });

  if (lastIndex < 0) return { current: null, max: null, neverSeen: true };
  return {
    current: draws.length - 1 - lastIndex,
    max: maxGap,
    neverSeen: false,
  };
}

const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Build a Date from an ISO calendar date, in local time, so the weekday is right. */
function localDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Hits split by weekday and by month.
 *
 * Denominator matters: a weekday or month only counts days that actually had
 * draws, otherwise Wednesdays would look artificially rare in short ranges.
 */
export function distribution(draws, target) {
  const byWeekday = WEEKDAY_NAMES.map((name) => ({ name, hits: 0, draws: 0 }));
  const byMonth = MONTH_NAMES.map((name) => ({ name, hits: 0, draws: 0 }));
  const byDrawType = { MIDDAY: { hits: 0, draws: 0 }, EVENING: { hits: 0, draws: 0 } };

  for (const d of draws) {
    const dt = localDate(d.date);
    const wd = byWeekday[dt.getDay()];
    const mo = byMonth[dt.getMonth()];
    wd.draws += 1;
    mo.draws += 1;
    if (byDrawType[d.drawType]) byDrawType[d.drawType].draws += 1;

    if (d.lookup === target) {
      wd.hits += 1;
      mo.hits += 1;
      if (byDrawType[d.drawType]) byDrawType[d.drawType].hits += 1;
    }
  }

  return { byWeekday, byMonth, byDrawType };
}

/**
 * Unlike every other metric, a "hot streak" is about consecutive draws, so its
 * expected value is 1/100 per pair. Reported with that expectation attached.
 */
export function streaks(draws, target) {
  let longest = 0;
  let current = 0;
  let pairs = 0;
  let repeats = 0;
  let previousWasHit = false;

  for (const d of draws) {
    const hit = d.lookup === target;
    if (hit) {
      current += 1;
      longest = Math.max(longest, current);
      if (previousWasHit) repeats += 1;
    } else {
      current = 0;
    }
    if (previousWasHit) pairs += 1;
    previousWasHit = hit;
  }

  return {
    longest,
    consecutiveRepeats: repeats,
    expectedRepeats: Number((pairs / 100).toFixed(2)),
  };
}

/**
 * Full analysis for one number.
 *
 * @param {Array<{date:string, drawType:string, lookup:number}>} draws chronological order
 * @param {number} target 0..99
 */
/**
 * Every headline metric, computed for one subset of draws.
 * Used to scope the whole result to a single turn (Mediodía / Noche).
 */
export function summarise(draws, target) {
  const total = draws.length;
  const hits = countHits(draws, target);
  return {
    draws: total,
    hits,
    share: total ? Number(((hits / total) * 100).toFixed(2)) : 0,
    averageSpacing: averageSpacing(draws, target),
    gap: currentGap(draws, target),
    streaks: streaks(draws, target),
  };
}

export function analyseNumber(draws, target) {
  const total = draws.length;
  const hits = countHits(draws, target);
  const spacing = averageSpacing(draws, target);
  const gap = currentGap(draws, target);
  const dist = distribution(draws, target);
  const streak = streaks(draws, target);

  const overall = {
    totalDraws: total,
    hits,
    // Share of draws whose lookup number is this one, as a percentage.
    share: total ? Number(((hits / total) * 100).toFixed(2)) : 0,
    // Expected share under independence: 1 in 100.
    expectedShare: 1,
    // Named explicitly: shorthand `averageSpacing` would resolve to the imported
    // function of the same name, not to the local `spacing` result.
    averageSpacing: spacing,
    gap,
    streaks: streak,
  };

  // The draw tabs scope every headline figure to one turn, so each tab needs its
  // own spacing and gap; `byDrawType` alone only carried hits and denominators.
  const perTurn = {
    MIDDAY: summarise(draws.filter((d) => d.drawType === 'MIDDAY'), target),
    EVENING: summarise(draws.filter((d) => d.drawType === 'EVENING'), target),
  };

  return {
    target,
    ...overall,
    ...dist,
    perTurn,
    range: { from: draws[0]?.date ?? null, to: draws[draws.length - 1]?.date ?? null },
  };
}
