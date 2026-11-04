// Cargador computation.
//
// Normative definition: docs/cargador-contract.md
//
// A cargador for one draw is the three-digit Pick 3 result for that draw,
// spoken the way it is in Cuba: the full number and, optionally, its charada
// name taken from the LAST TWO digits.
//
//   464  -> "el 464"  or  "el 4 con Muerto grande"   (64 = Muerto grande)
//   701  -> "el 701"  or  "el 7 con Caballo"         (01 = Caballo -> 1)
//   045  -> "el 45"                                  (no prefix: leading zero)
//
// It is NOT a per-digit breakdown: 570 is never Caballo/Caracol/cero.

/**
 * Compute the cargador for one draw from its Pick 3 winning digits.
 *
 * @param {number[]} base3 Pick 3 winning digits, in winning order (3 digits).
 * @returns {{fijo:number, pick3:string, prefijo:number, dosUltimos:number}}
 *   `fijo` is the full three-digit number in 0..999.
 *   `prefijo` is its hundreds digit (0 when the draw is under 100).
 *   `dosUltimos` is the charada lookup number in 0..99.
 */
export function computeCargador(base3) {
  if (!Array.isArray(base3) || base3.length !== 3) {
    throw new Error('base3 must be an array of 3 digits');
  }
  for (const d of base3) {
    if (!Number.isInteger(d) || d < 0 || d > 9) {
      throw new Error(`Invalid digit: ${d}`);
    }
  }

  const fijo = base3[0] * 100 + base3[1] * 10 + base3[2];
  return {
    fijo,
    pick3: base3.join(''),
    prefijo: Math.floor(fijo / 100),
    dosUltimos: fijo % 100,
  };
}

/**
 * Render a cargador as it is spoken: `NNN`.
 *
 * Always three digits, zero padded, because a Pick 3 result of 045 is drawn and
 * announced as 045, not as 45.
 */
export function formatCargador(fijo) {
  if (!Number.isInteger(fijo) || fijo < 0 || fijo > 999) {
    throw new Error(`Invalid fijo: ${fijo}`);
  }
  return String(fijo).padStart(3, '0');
}

/**
 * Resolve the charada name for a cargador.
 *
 * Returns `significado: null` when the last two digits are 00: the charada table
 * has no entry 0, and this is the only case where a valid draw has no name.
 * Callers decide presentation; the value is never dropped silently.
 */
export function describeCargador(cargador, significados) {
  const { fijo, dosUltimos, prefijo } = cargador;
  const significado = significados.get(dosUltimos) ?? null;

  // Spoken form: under 100 the number is said alone ("el 45"); otherwise
  // "el <prefijo> con <significado>".
  let dicho;
  if (significado === null) dicho = `el ${formatCargador(fijo)}`;
  else if (fijo < 100) dicho = `el ${dosUltimos}`;
  else dicho = `el ${prefijo} con ${significado}`;

  return {
    fijo,
    formato: formatCargador(fijo),
    numeroCharada: dosUltimos,
    significado,
    dicho,
  };
}

/**
 * The three charada numbers a draw pays on.
 *
 * Confirmed against real draws and the user's own examples:
 *   2026-11-03 MIDDAY  Pick3 464, Pick4 6734 -> 64, 67, 34
 *   2026-11-03 EVENING Pick3 701, Pick4 5363 -> 01, 53, 63
 *
 * `charada` is the last two digits of the Pick 3 (what is spoken as the name);
 * `corrido1` and `corrido2` are the two halves of the Pick 4.
 *
 * @param {number[]} base3 Pick 3 winning digits (3).
 * @param {number[]} base4 Pick 4 winning digits (4).
 * @returns {{charada:number, corrido1:number, corrido2:number}}
 */
export function computeCharadaNumbers(base3, base4) {
  if (!Array.isArray(base4) || base4.length !== 4) {
    throw new Error('base4 must be an array of 4 digits');
  }
  const { dosUltimos } = computeCargador(base3);
  return {
    charada: dosUltimos,
    corrido1: base4[0] * 10 + base4[1],
    corrido2: base4[2] * 10 + base4[3],
  };
}

/** The three two-number combinations a parlé can be played on. */
export function computeParles({ charada, corrido1, corrido2 }) {
  return [
    { top: charada, bottom: corrido1 },
    { top: charada, bottom: corrido2 },
    { top: corrido1, bottom: corrido2 },
  ];
}

/** The candado: the three numbers joined as XX.XX.XX. */
export function formatCandado({ charada, corrido1, corrido2 }) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(charada)}.${pad(corrido1)}.${pad(corrido2)}`;
}
