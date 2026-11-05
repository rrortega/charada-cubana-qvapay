// Playable combinations from the week's signals.
//
// The dream is a story; the play is numbers. This module turns the week's
// accumulated symbols into the three shapes the charada is played in, using the
// same contract as the daily cargador (docs/cargador-contract.md):
//
//   fijo      three digits: a one-digit prefix in front of a two-digit charada
//   corridos  the two halves of a Pick 4, so two two-digit numbers
//   parles    the pairs between the strongest numbers
//
// The rule is deliberately plain and deterministic: a number weighs as much as
// the signals that point at it, and the heaviest ones win. Nothing here is a
// forecast; it is the week's own material, arranged the way it is played.

/** Pad to `width` digits, keeping the last `width` when the value is longer. */
function pad(value, width) {
  const text = String(Math.abs(Number(value) || 0));
  return text.length >= width ? text.slice(-width) : text.padStart(width, '0');
}

const two = (value) => pad(value, 2);
const three = (value) => pad(value, 3);

/**
 * Merge duplicate numbers and order them: heaviest first, then by number.
 *
 * @param {Array<{ numero: number, peso: number }>} rows
 */
function weigh(rows) {
  const totals = new Map();

  for (const row of rows ?? []) {
    const numero = Number(row?.numero);
    const peso = Number(row?.peso);
    if (!Number.isInteger(numero) || numero < 1 || numero > 100) continue;
    if (!Number.isFinite(peso) || peso <= 0) continue;
    totals.set(numero, (totals.get(numero) ?? 0) + peso);
  }

  return [...totals.entries()]
    .map(([numero, peso]) => ({ numero, peso }))
    .sort((a, b) => b.peso - a.peso || a.numero - b.numero);
}

/**
 * The week's playable combinations.
 *
 * @param {Array<{ numero: number, peso: number }>} rows  accumulated weights
 * @returns {{
 *   fijos: Array<{ valor: number, formatted: string, prefijo: number, charada: number }>,
 *   corridos: Array<{ valor: number, formatted: string }>,
 *   parles: Array<{ top: { valor: number, formatted: string }, bottom: { valor: number, formatted: string } }>
 * }}
 */
export function combinacionesDeLaSemana(rows) {
  const ranked = weigh(rows);

  // The prefix is a single digit, the charada the last two, exactly as a fijo
  // is read on the card.
  const prefijo = ranked.find((row) => row.numero <= 9) ?? null;
  const charada = ranked.find((row) => row.numero >= 10) ?? null;

  const fijos = prefijo && charada
    ? [{
      valor: prefijo.numero * 100 + (charada.numero % 100),
      formatted: three(prefijo.numero * 100 + (charada.numero % 100)),
      prefijo: prefijo.numero,
      charada: charada.numero % 100,
    }]
    : [];

  const corridos = ranked.slice(0, 2).map((row) => ({
    valor: row.numero,
    formatted: two(row.numero),
  }));

  // Pairs between the three strongest: the three parles a Pick 4 offers.
  const top = ranked.slice(0, 3);
  const parles = [];
  for (let i = 0; i < top.length; i += 1) {
    for (let j = i + 1; j < top.length; j += 1) {
      parles.push({
        top: { valor: top[i].numero, formatted: two(top[i].numero) },
        bottom: { valor: top[j].numero, formatted: two(top[j].numero) },
      });
    }
  }

  return { fijos, corridos, parles };
}
