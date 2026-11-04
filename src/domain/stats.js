// Historical statistics over stored cargadores.
//
// Everything here is DESCRIPTIVE. Florida Pick 3 draws are independent and the
// data confirms it (each digit position is uniform over 0..9 across 3536 draws).
// Nothing in this module predicts the next draw, and no output should be
// presented as doing so.
//
// Normative definition of the underlying data: docs/cargador-contract.md

/**
 * Frequency of each digit at each winning position.
 *
 * @param {number[][]} pick3Results array of 3-digit arrays, winning order.
 * @returns {{fijo: number[], corrido1: number[], corrido2: number[], total: number}}
 *   Three length-10 arrays indexed by digit.
 */
export function digitFrequencyByPosition(pick3Results) {
  const fijo = new Array(10).fill(0);
  const corrido1 = new Array(10).fill(0);
  const corrido2 = new Array(10).fill(0);

  for (const digits of pick3Results) {
    if (!Array.isArray(digits) || digits.length !== 3) continue;
    fijo[digits[0]] += 1;
    corrido1[digits[1]] += 1;
    corrido2[digits[2]] += 1;
  }

  return { fijo, corrido1, corrido2, total: pick3Results.length };
}

/**
 * Chi-square goodness of fit against a uniform distribution over 0..9.
 *
 * Reported so a reader can see the data is consistent with chance. It is not a
 * prediction tool and its result never justifies a betting recommendation.
 */
export function chiSquareUniform(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return { chiSquare: 0, degreesOfFreedom: 9, critical95: 16.919, uniform: true, expected: 0 };
  const expected = total / counts.length;
  let chiSquare = 0;
  for (const observed of counts) {
    chiSquare += ((observed - expected) ** 2) / expected;
  }
  const degreesOfFreedom = counts.length - 1;
  // 95% critical value for df=9.
  const critical95 = 16.919;
  return {
    chiSquare: Number(chiSquare.toFixed(3)),
    degreesOfFreedom,
    critical95,
    uniform: chiSquare < critical95,
    expected: Number(expected.toFixed(1)),
  };
}

/**
 * Classify the shape of a Pick 3 result.
 *
 * 'triple' when all three digits match (777), 'pareja' when exactly two match
 * (466), otherwise 'distintos'.
 */
export function classifyPattern(digits) {
  const unique = new Set(digits).size;
  if (unique === 1) return 'triple';
  if (unique === 2) return 'pareja';
  return 'distintos';
}

/** Count pattern shapes across results. */
export function patternDistribution(pick3Results) {
  const counts = { triple: 0, pareja: 0, distintos: 0 };
  for (const digits of pick3Results) {
    if (!Array.isArray(digits) || digits.length !== 3) continue;
    counts[classifyPattern(digits)] += 1;
  }
  return counts;
}

/**
 * Theoretical probabilities of each pattern, for honest comparison.
 *
 * triple   : 10/1000  = 1.0%
 * pareja   : 270/1000 = 27.0%
 * distintos: 720/1000 = 72.0%
 */
export const PATTERN_THEORY = Object.freeze({ triple: 0.01, pareja: 0.27, distintos: 0.72 });

/**
 * Frequency of exact three-digit results.
 *
 * With 1000 possible outcomes, repeats are expected by chance. Returns the list
 * sorted by count descending, ready for a "most repeated" table.
 */
export function exactResultFrequency(pick3Results) {
  const counts = new Map();
  for (const digits of pick3Results) {
    if (!Array.isArray(digits) || digits.length !== 3) continue;
    const key = digits.join('');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * How often the last two digits (the charada number) repeat across draws.
 *
 * Descriptive only: this does not make any number more likely next.
 */
export function charadaNumberFrequency(pick3Results) {
  const counts = new Array(100).fill(0);
  for (const digits of pick3Results) {
    if (!Array.isArray(digits) || digits.length !== 3) continue;
    counts[digits[1] * 10 + digits[2]] += 1;
  }
  return counts;
}

/**
 * Gaps between appearances of a charada number, in draw order.
 *
 * `maxGap` is how many consecutive draws passed without it. Reported so the UI
 * can say "no sale desde hace N sorteos" factually, without implying it is due.
 */
export function gapsForCharadaNumber(pick3Results, charadaNumber) {
  const gaps = [];
  let sinceLast = 0;
  let seen = false;
  for (const digits of pick3Results) {
    if (!Array.isArray(digits) || digits.length !== 3) continue;
    const n = digits[1] * 10 + digits[2];
    if (n === charadaNumber) {
      if (seen) gaps.push(sinceLast);
      seen = true;
      sinceLast = 0;
    } else {
      sinceLast += 1;
    }
  }
  return {
    appearances: seen ? gaps.length + 1 : 0,
    gaps,
    currentGap: seen ? sinceLast : null,
    longestGap: gaps.length ? Math.max(...gaps) : null,
  };
}

/**
 * Consecutive-draw repetition, the "de corrido" question a player asks.
 *
 * Compares the charada number (last two digits) of adjacent draws. Under
 * independence the expected count is already substantial, which is the point:
 * the output carries that expectation so the UI can show the comparison instead
 * of implying a pattern.
 */
export function consecutiveRepetition(pick3Results) {
  const numbers = [];
  for (const digits of pick3Results) {
    if (!Array.isArray(digits) || digits.length !== 3) continue;
    numbers.push(digits[1] * 10 + digits[2]);
  }
  if (numbers.length < 2) {
    return { pairs: 0, repeated: 0, expected: 0, observedRate: 0, expectedRate: 0 };
  }

  let repeated = 0;
  for (let i = 1; i < numbers.length; i += 1) {
    if (numbers[i] === numbers[i - 1]) repeated += 1;
  }

  // Expected rate under independence: a uniform draw repeats the previous value
  // with probability 1/100.
  const expectedRate = 1 / 100;
  return {
    pairs: numbers.length - 1,
    repeated,
    expected: Number((expectedRate * (numbers.length - 1)).toFixed(2)),
    observedRate: Number((repeated / (numbers.length - 1)).toFixed(4)),
    expectedRate,
  };
}
