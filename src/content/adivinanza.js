// The daily adivinanza: how the prompt is built and how the answer is cleaned.
//
// The spec (S10) wants a dicharacho "casi sin sentido", built one-to-one with the
// day's cargador, that evokes combinations through the meanings of its numbers.
// "High probability of combinations" is literary licence over the text, never a
// promise about the draw, so the prompt forbids any claim of a hit and the
// cleaning step rejects one that slips through anyway.
//
// S9 is the hard part: a meaning never appears by name. Each one enters as a
// clue — a trait, a refrán or a custom that only fits that one concept — and a
// text that names any of them is thrown away and asked again.

/** Bumped whenever the wording changes, so a stored text can be explained. */
export const PROMPT_VERSION = 3;

const SYSTEM = `Eres un decimista cubano que escribe adivinanzas de charada.

Recibes los significados de los números de un cargador del día y escribes UN
dicharacho: dos a cuatro versos, en un solo párrafo, casi sin sentido, con doble
sentido, que aluda a esos significados SIN NOMBRARLOS.

La regla que manda es la pista. Cada significado entra como un rodeo: un rasgo,
un refrán o una costumbre que solo encaje con él, y que el cubano tenga que
descifrar.
- Elefante: "el orejón que nunca se olvida de nada".
- Muerto: "el que ya no respira y de sus maldades se acuerda".
- Jicotea: "la que carga su casa y no paga alquiler".
- Galgo: "el flaco que se gasta las patas antes que el dueño".
- Soga: "la que ahorca sin tener manos".
- Piedra fina: "la que vale más mientras menos se ve".

Reglas:
- Nunca escribas el nombre del significado, ni su diminutivo, ni su plural.
- Encadena las pistas en una escena con acciones: unas hacen cosas y otras
  responden. No las enumeres en lista ni cierres con moraleja.
- Español de Cuba, popular y limpio, sin groserías.
- No menciones números, ni la charada, ni el cargador, ni la fecha.
- No prometas que nada va a salir ni sugieras que ayuda a ganar: es un juego de
  palabras, no un pronóstico.
- Entre 25 y 60 palabras. Sin título, sin comillas, sin markdown.`;

/** Particles and fillers that never identify a meaning on their own. */
const STOPWORDS = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'y', 'un', 'una', 'lo', 'su']);

/** Lowercase, accent-free form, so "Jicotea" matches "jicotea". */
function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Words of a meaning that would give it away: four letters or more. */
function identifyingWords(name) {
  return fold(name)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));
}

/**
 * Names the text spelled out, when it should have used a clue instead (S9).
 *
 * Judged by the words of each meaning, not by the whole phrase: "piedra fina"
 * leaks with "piedra" alone. Case and accents do not matter.
 *
 * @param {string} texto
 * @param {string[]} meaningNames
 * @returns {string[]} the meanings that appear by name
 */
export function leakedMeanings(texto, meaningNames) {
  const haystack = fold(texto);
  const leaked = [];

  for (const name of meaningNames) {
    const words = identifyingWords(name);
    if (words.some((word) => new RegExp(`\\b${word}\\b`).test(haystack))) leaked.push(name);
  }

  return leaked;
}

/**
 * Turn one draw into the two messages the model sees.
 *
 * @param {object} input
 * @param {string} input.date        ISO date of the draw
 * @param {object} input.cargador    the draw view built by draws.js
 * @param {{ (n: number): (string|null) }} input.meaningFor
 * @returns {{ system: string, user: string }}
 */
export function buildPrompt({ date, cargador, meaningFor }) {
  const digits = cargador?.fijo?.digits ?? [];
  const prefijo = digits.length === 3 ? digits[0] : null;
  const charada = cargador?.charada?.value ?? null;
  const corridos = (cargador?.corridos ?? []).map((row) => row.value);

  // The canon of the card: prefix, charada (last two digits) and the two halves
  // of Pick 4. The fijo repeats the charada, so it is not listed twice.
  const numbers = [...new Set([prefijo, charada, ...corridos])]
    .filter((n) => Number.isInteger(n) && n > 0);

  const material = numbers
    .map((n) => ({ n, meaning: meaningFor?.(n) ?? null }))
    .map(({ n, meaning }) => (meaning ? `- ${meaning}` : `- (número sin significado: ${n})`))
    .join('\n');

  const turn = cargador?.drawType === 'EVENING' ? 'de la noche' : 'del mediodía';

  return {
    system: SYSTEM,
    user: `Cargador ${turn} del ${date}.

Significados de sus números:
${material}

Escribe el dicharacho de hoy. Cada significado va como pista, nunca por su
nombre: un rasgo, un refrán o una costumbre que solo encaje con él.`,
  };
}

const PROMISE_PATTERNS = [
  /garantiza/i,
  /vas a ganar/i,
  /ganar[aá]s/i,
  /seguro que sale/i,
  /saldr[aá] fijo/i,
  /acertar[aá]s/i,
];

function invalid(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Clean the model's answer into the text we store, or reject it.
 *
 * Throws with `code` set: `adivinanza_vacia`, `adivinanza_corta`,
 * `adivinanza_larga`, `adivinanza_promesa`.
 */
export function normaliseAdivinanza(raw) {
  let text = String(raw ?? '').trim();

  // Models like to wrap the answer in a fence or in quotes despite being asked
  // not to; that is formatting, not content.
  text = text.replace(/^```[a-z]*\s*/i, '').replace(/```$/, '').trim();
  text = text.replace(/^["'«“]+|["'»”]+$/g, '').trim();
  text = text.replace(/^(adivinanza|dicharacho)\s*:\s*/i, '').trim();
  text = text.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1');
  text = text.replace(/\s+/g, ' ');

  if (text.length === 0) throw invalid('adivinanza_vacia', 'el modelo no devolvió texto');
  if (text.length < 40) throw invalid('adivinanza_corta', `solo ${text.length} caracteres`);
  if (text.length > 600) throw invalid('adivinanza_larga', `${text.length} caracteres`);

  const promise = PROMISE_PATTERNS.find((pattern) => pattern.test(text));
  if (promise) throw invalid('adivinanza_promesa', `promete un acierto: ${promise}`);

  return text;
}

/** The rejection thrown when the model names a meaning instead of hinting it (S9). */
export function leakRejection(leaked) {
  return invalid('adivinanza_filtrada', `nombra: ${leaked.join(', ')}`);
}

/** Instruction appended to the prompt when the first attempt leaked (S9). */
export function banInstruction(leaked) {
  return `\n\nNo escribas estas palabras ni sus sinónimos directos: ${leaked.join(', ')}. `
    + 'Cambia cada una por una pista, como en los ejemplos.';
}
