// Which numbers a dream points at (S6).
//
// The rule is coherence of the whole set, not the loudest single signal: a
// number is worth the weight of the signals that point at it, and once a signal
// has carried one number, the same signal counts for much less on the next.
// That is what stops three signals from stacking into the same number and
// calling it the answer.
//
// The pick is greedy and deterministic: highest marginal score first, ties
// broken by the ascending number, so the same dream always yields the same set.

/** What a signal weighs when it already carried an earlier number. */
export const PESO_REPETIDO = 0.35;

/** Keep the reported score free of float noise. */
const round = (value) => Math.round(value * 1e6) / 1e6;

function pesoOf(signal) {
  const value = Number(signal?.peso);
  return Number.isFinite(value) ? value : 0;
}

function numbersOf(signal) {
  return Array.isArray(signal?.numeros) ? signal.numeros : [];
}

/** Sum of the weights of the signals whose numbers include `numero`. */
export function score(numero, senales = []) {
  return (senales ?? []).reduce(
    (total, signal) => (numbersOf(signal).includes(numero) ? total + pesoOf(signal) : total),
    0,
  );
}

/**
 * Choose the most coherent set of numbers.
 *
 * @param {Array<{nombre: string, peso: number, numeros: number[]}>} senales
 * @param {{ max?: number }} [options]
 * @returns {{ numeros: number[], soporte: Array<{numero: number, senales: string[]}>, puntaje: number }}
 */
export function elegirConjunto(senales = [], { max = 3 } = {}) {
  const valid = (senales ?? []).filter((signal) => numbersOf(signal).length > 0);

  const candidates = [...new Set(valid.flatMap(numbersOf))]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 100)
    .sort((a, b) => a - b);

  /** @type {Set<object>} signals already carried by a chosen number */
  const used = new Set();
  const numeros = [];
  const soporte = [];
  let puntaje = 0;

  for (let step = 0; step < max && numeros.length < candidates.length; step += 1) {
    /** @type {{numero: number, marginal: number, carrying: object[]}|null} */
    let best = null;

    for (const numero of candidates) {
      if (numeros.includes(numero)) continue;
      const carrying = valid.filter((signal) => numbersOf(signal).includes(numero));
      const marginal = round(carrying.reduce(
        (total, signal) => total + (used.has(signal) ? PESO_REPETIDO * pesoOf(signal) : pesoOf(signal)),
        0,
      ));
      // Strictly greater only: on a tie the ascending number, visited first, stays.
      if (best === null || marginal > best.marginal) best = { numero, marginal, carrying };
    }

    if (best === null || best.marginal <= 0) break;

    numeros.push(best.numero);
    soporte.push({ numero: best.numero, senales: best.carrying.map((signal) => signal.nombre) });
    puntaje = round(puntaje + best.marginal);
    for (const signal of best.carrying) used.add(signal);
  }

  return { numeros, soporte, puntaje };
}
