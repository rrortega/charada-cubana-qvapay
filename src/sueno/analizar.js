// The dream analyser: prompt, validation of the model's answer and retries.
//
// The user writes a dream (S1) and it is stored under their own account (S9).
// What comes back has to be machine-usable, so the model is asked for strict
// JSON: a list of concrete signals, each with a weight and the numbers of the
// charada its symbols point at. Nothing here predicts a result — the numbers
// are a reading of symbols (S5), and a dream is not a forecast (S6).
//
// The vocabulary is the delivered charada table, numbered, because a meaning is
// what points at a number: "caballo" alone does not say 1.

import { principalMeanings } from '../content/charada.js';
import { canonicoDe, jergaPara } from '../content/jerga-cubana.js';

/** Bumped whenever the wording changes, so a stored analysis can be explained. */
export const PROMPT_VERSION = 1;

const MIN_SENALES = 3;
const MAX_SENALES = 12;
const MAX_NUMEROS = 4;
const MIN_PESO = 0.05;
const MAX_PESO = 1;

/** @type {Promise<Map<number, string>>|null} */
let vocabulary = null;

/** The numbered meanings, read once per process. */
function meanings() {
  if (!vocabulary) vocabulary = principalMeanings();
  return vocabulary;
}

function systemPrompt(material) {
  return `Eres un lector de sueños de la charada cubana.

Recibes el texto de un sueño. Extraes sus señales —personas, animales, objetos,
acciones y lugares concretos que aparecen en él— y asocias cada señal con los
números de la charada que sus símbolos evocan.

Reglas:
- Entre ${MIN_SENALES} y ${MAX_SENALES} señales. Cada una es un sustantivo o una
  acción concreta del sueño, no una interpretación: "agua", "caballo", "cuchillo",
  "caminar descalzo". Nada de frases largas ni de estados de ánimo abstractos.
- El nombre va en minúsculas, sin tildes, de 2 a 40 caracteres.
- El sueño está escrito en parlé cubano. Léelo en cubano: si dice "jeva", es la
  pareja; si dice "yuma", es el extranjero o emigrar; si dice "jama", es la
  comida. La señal que extraigas va en español llano, no en la jerga.
- El peso va de 0,05 a 1: cuánto pesa esa señal en el sueño.
- Los números salen del vocabulario de abajo, del 1 al 100. Nunca inventes un
  número mayor que 100 ni uno que no esté en la lista. Como máximo cuatro por
  señal.
- Además del JSON de señales escribes "resumen": una lectura de tres o cuatro
  frases, de 400 caracteres como máximo, que diga qué evoca el sueño y a qué
  símbolos de la charada está vinculado (nombra los símbolos, no las cifras).
  Se lee como una interpretación, nunca como un pronóstico.
- Es una lectura de símbolos, no un pronóstico. Nunca predices un resultado,
  nunca dices que un número "va a salir" ni que ayuda a ganar.
- Respondes SOLO con el objeto JSON, sin markdown, sin bloque de código, sin
  texto antes ni después.

Forma exacta de la respuesta:
{"resumen":"El sueño se mueve entre el agua y el camino: ...","senales":[{"nombre":"agua","peso":0.8,"numeros":[9,33]}]}

Vocabulario de la charada (número: significado):
${material}`;
}

/**
 * The two messages the model sees.
 *
 * @param {object} input
 * @param {string} input.sueno  the dream as the user wrote it
 * @returns {Promise<{ system: string, user: string }>}
 */
export async function buildPrompt({ sueno }) {
  const table = await meanings();
  const material = [...table.entries()].map(([n, name]) => `${n}: ${name}`).join(', ');

  const jerga = jergaPara(sueno);
  const glosario = jerga.length
    ? `\n\nPalabras del sueño, en cubano:\n${jerga
      .map((entry) => `- ${entry.termino}: ${entry.significado} (${entry.contexto})`)
      .join('\n')}`
    : '';

  return {
    system: systemPrompt(material),
    user: `Sueño: ${String(sueno ?? '').trim()}${glosario}

Devuelve el JSON con el resumen y sus señales.`,
  };
}

function invalid(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** Lowercase, accent-free, single-spaced: the stored form of a signal name. */
function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function clampPeso(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return MAX_PESO;
  return Math.min(MAX_PESO, Math.max(MIN_PESO, n));
}

/** Keep numbers the charada can answer for: integers 1..100, no repeats. */
function filterNumbers(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const value of raw) {
    const numeric = typeof value === 'number'
      ? value
      : (typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : NaN);
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > 100) continue;
    if (out.includes(numeric)) continue;
    out.push(numeric);
    if (out.length === MAX_NUMEROS) break;
  }
  return out;
}

/** The JSON the model wrote, with a markdown fence or stray prose removed. */
function parseJson(raw) {
  let text = String(raw ?? '').trim();
  text = text.replace(/^```[a-z]*\s*/i, '').replace(/```$/, '').trim();

  const attempt = (candidate) => {
    try {
      return JSON.parse(candidate);
    } catch {
      return undefined;
    }
  };

  let payload = attempt(text);
  if (payload === undefined) {
    // Some models wrap the object in a sentence; the braces are the answer.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) payload = attempt(text.slice(start, end + 1));
  }
  if (payload === undefined) throw invalid('sueno_json', 'la respuesta no era JSON');
  return payload;
}

/**
 * Validate the model's answer into the signals we store.
 *
 * Throws with `code` set: `sueno_json` when the text is not JSON,
 * `sueno_sin_senales` when nothing usable survives.
 *
 * @param {string} raw
 * @returns {{ senales: Array<{nombre: string, peso: number, numeros: number[]}> }}
 */
/** The narrative reading: one paragraph, no markdown, at most 400 characters. */
export const MAX_RESUMEN = 400;

/** Clean the reading the model wrote, cutting on a word when it runs long. */
export function cleanResumen(value) {
  let text = String(value ?? '').trim();
  text = text.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1').replace(/\s+/g, ' ').trim();
  if (text.length <= MAX_RESUMEN) return text;

  // A sentence chopped mid-word reads as a bug, so the cut lands on a space.
  const cut = text.slice(0, MAX_RESUMEN);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > MAX_RESUMEN * 0.7 ? space : MAX_RESUMEN).trimEnd()}…`;
}

export function parseAnalysis(raw) {
  const payload = parseJson(raw);
  const list = Array.isArray(payload?.senales) ? payload.senales : [];

  /** @type {Map<string, {nombre: string, peso: number, numeros: number[]}>} */
  const byName = new Map();
  for (const item of list) {
    const nombre = fold(item?.nombre);
    if (nombre.length < 2 || nombre.length > 40) continue;

    const peso = clampPeso(item?.peso);
    const existing = byName.get(nombre);
    // The same signal twice is one signal: the heaviest mention wins.
    if (existing) {
      existing.peso = Math.max(existing.peso, peso);
      continue;
    }
    byName.set(nombre, {
      nombre,
      // The shared concept, so "jeva" and "novia" meet in the same counter (S13).
      canonico: canonicoDe(nombre),
      peso,
      numeros: filterNumbers(item?.numeros),
    });
  }

  // The cap keeps the signals that weigh most; ties keep the model's order.
  const senales = [...byName.values()]
    .sort((a, b) => b.peso - a.peso)
    .slice(0, MAX_SENALES);

  if (senales.length === 0) throw invalid('sueno_sin_senales', 'no quedó ninguna señal válida');
  return { resumen: cleanResumen(payload?.resumen), senales };
}

/**
 * The codes worth one more ask.
 *
 * Variance, not configuration: a model that wrote prose instead of JSON, or
 * answered empty or late, usually gets it right the second time. A bad key or a
 * bad model name is a 4xx and never improves by asking again.
 */
function retryable(code) {
  const value = String(code ?? '');
  if (value === 'sueno_json' || value === 'sueno_sin_senales') return true;
  if (value === 'llm_empty' || value === 'llm_timeout') return true;
  return /^llm_http_5\d\d$/.test(value);
}

/**
 * Analyse one dream. Composes the prompt with the validation, with one retry.
 *
 * @param {object} input
 * @param {string} input.sueno
 * @param {{ complete: Function }} input.llm
 * @returns {Promise<{ senales: Array<{nombre: string, peso: number, numeros: number[]}> }>}
 */
export async function analizarSueno({ sueno, llm }) {
  const prompt = await buildPrompt({ sueno });

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      // Low temperature: this is extraction, not writing.
      const raw = await llm.complete({ ...prompt, temperature: 0.2 });
      return parseAnalysis(raw);
    } catch (err) {
      lastError = err;
      if (attempt === 2 || !retryable(err?.code)) throw err;
    }
  }

  throw lastError;
}
