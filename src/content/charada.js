// The charada table, as delivered in public/significados/charada-cubana.json.
//
// Two sources, each authoritative for one thing:
//
//   * the JSON says what every ficha *means*: names, roles, descriptions,
//     context, tradition and related numbers;
//   * the folder tree says which artwork *exists*, because every file is named
//     after the meaning it illustrates (`01/caballo.png`).
//
// Reading the folders instead of trusting the JSON's `png` field means a new
// drawing is picked up as soon as it is dropped in, with no JSON edit and no
// stale `null` to maintain.

import { readdir, readFile } from 'node:fs/promises';

const SOURCE = new URL('../../public/significados/charada-cubana.json', import.meta.url);
const ARTWORK = new URL('../../public/significados/', import.meta.url);
const ART_RE = /^(\d{2,3})\/(.+)\.png$/;

/**
 * Compare ids and filenames without letting a tilde, a space or a case
 * difference hide a drawing: "sartén" and "sarten.png" are the same thing.
 * @param {string} value
 */
const normalise = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, '-');

/** @type {any} */
let cached = null;
/** @type {Map<number, Map<string, string>>|null} */
let artwork = null;

/** Load and cache the whole table. */
export async function loadCharada() {
  if (cached) return cached;
  cached = JSON.parse(await readFile(SOURCE, 'utf8'));
  return cached;
}

/**
 * Scan the artwork folders once: number -> meaning id -> public path.
 *
 * One recursive read of the directory, so a hundred folders cost one call.
 *
 * @returns {Promise<Map<number, Map<string, string>>>}
 */
async function scanArtwork() {
  if (artwork) return artwork;

  /** @type {Map<number, Map<string, string>>} */
  const found = new Map();
  /** @type {string[]} */
  let names = [];
  try {
    names = /** @type {string[]} */ (await readdir(ARTWORK, { recursive: true }));
  } catch {
    // No artwork yet is not an error: the list renders without it.
    names = [];
  }

  for (const raw of names) {
    const name = String(raw).replace(/\\/g, '/');
    const match = ART_RE.exec(name);
    if (!match) continue;
    const [, folder, file] = match;
    const number = Number(folder);
    if (!found.has(number)) found.set(number, new Map());
    found.get(number).set(normalise(file), `/significados/${folder}/${file}.png`);
  }

  artwork = found;
  return artwork;
}

/** Fichas in numeric order. */
function sortedFichas(data) {
  return Object.values(data.numeros).sort((a, b) => a.numero - b.numero);
}

// Words that stay lowercase inside a title: "Año del Cuero", not "Año Del Cuero".
const PARTICLES = new Set(['de', 'del', 'la', 'el', 'las', 'los', 'y', 'en', 'con', 'para', 'por', 'a', 'al']);

/**
 * The table stores meaning names in lower case ("gato grande"); the interface
 * shows them as titles. Formatting lives here so every surface agrees and the
 * stored data is never rewritten.
 *
 * @param {string} raw
 * @returns {string}
 */
export function displayName(raw) {
  const words = String(raw ?? '').trim().split(/\s+/).filter(Boolean);
  return words
    .map((word, i) => {
      const lower = word.toLocaleLowerCase('es');
      if (i > 0 && PARTICLES.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1);
    })
    .join(' ');
}

/** Icons of one ficha, in the order of its meanings. */
function iconsOf(art, ficha) {
  const byNumber = art.get(ficha.numero);
  if (!byNumber) return ficha.significados.map(() => null);

  return ficha.significados.map((s) => {
    // The id is the contract; the display name is the safety net for a file
    // named after what the drawing shows.
    return byNumber.get(normalise(s.id))
      ?? byNumber.get(normalise(s.nombre))
      ?? null;
  });
}

/** Files that no meaning of their number claims, so nothing hides silently. */
function orphansOf(art, fichas, idsByNumber) {
  const out = [];
  for (const [number, files] of art) {
    const claimed = idsByNumber.get(number) ?? new Set();
    for (const [key, path] of files) {
      if (!claimed.has(key)) out.push(path);
    }
  }
  void fichas;
  return out.sort();
}

/**
 * Compact row per number: what the list needs to render and to filter, and
 * nothing else. The 693 meaning names travel here so the search can be instant
 * and local instead of a request per keystroke.
 *
 * @returns {Promise<Array<{number: number, principal: string, icon: string|null,
 *   significados: number, conArte: number, nombres: string[]}>>}
 */
export async function compactList() {
  const data = await loadCharada();
  const art = await scanArtwork();

  return sortedFichas(data).map((ficha) => {
    const icons = iconsOf(art, ficha);
    const principalAt = ficha.significados.findIndex((s) => s.rol === 'principal');

    return {
      number: ficha.numero,
      principal: ficha.principal,
      // Deliberately no fallback to another meaning's art: showing an
      // alternative symbol as the number's symbol would be a wrong claim.
      icon: principalAt === -1 ? null : icons[principalAt],
      significados: ficha.significados.length,
      conArte: icons.filter(Boolean).length,
      nombres: ficha.significados.map((s) => displayName(s.nombre)),
    };
  });
}

/** Keep only the tradition values that exist, as numbers when they are numbers. */
function normaliseTradicion(raw = {}) {
  /** @type {{peon?: number, companero?: number, cuadrilla?: string}} */
  const out = {};
  if (raw.peon) out.peon = Number(raw.peon);
  if (raw.companero) out.companero = Number(raw.companero);
  if (raw.cuadrilla) out.cuadrilla = raw.cuadrilla;
  return out;
}

/**
 * One ficha, shaped for the detail screen: meanings with the artwork that
 * exists for them, tradition links and related numbers, all as data.
 *
 * @param {number} number 1..100
 */
export async function getFicha(number) {
  const data = await loadCharada();
  const ficha = data.numeros[String(number).padStart(2, '0')];
  if (!ficha) return null;

  const art = await scanArtwork();
  const icons = iconsOf(art, ficha);
  const principalAt = ficha.significados.findIndex((s) => s.rol === 'principal');

  return {
    number: ficha.numero,
    principal: ficha.principal,
    icon: principalAt === -1 ? null : icons[principalAt],
    descripcion: ficha.descripcion ?? '',
    contexto: ficha.contexto ?? '',
    fuente: ficha.fuente ?? '',
    tradicion: normaliseTradicion(ficha.tradicion),
    relacionadas: (ficha.fichas_relacionadas ?? []).map(Number),
    significados: ficha.significados.map((s, i) => ({
      id: s.id,
      nombre: displayName(s.nombre),
      rol: s.rol,
      descripcion: s.descripcion ?? '',
      icon: icons[i],
    })),
  };
}

/**
 * Counts as they are now, not as the JSON declared them when it was written:
 * artwork can be added without touching the file.
 */
export async function totals() {
  const data = await loadCharada();
  const art = await scanArtwork();

  // Every id a meaning claims, per number, used to spot unclaimed files.
  const idsByNumber = new Map();
  for (const ficha of sortedFichas(data)) {
    idsByNumber.set(ficha.numero, new Set(ficha.significados.map((s) => normalise(s.id))));
  }

  const rows = await compactList();
  const significados = rows.reduce((acc, row) => acc + row.significados, 0);
  const png = rows.reduce((acc, row) => acc + row.conArte, 0);

  return {
    fichas: rows.length,
    significados,
    png,
    pendientes: significados - png,
    huerfanos: orphansOf(art, sortedFichas(data), idsByNumber),
  };
}

/** Test seam: forget both caches so the files are read again. */
export function __resetCharadaForTests() {
  cached = null;
  artwork = null;
}
