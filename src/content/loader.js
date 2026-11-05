// Carga de los artículos de «Historia y cultura».
//
// Cada artículo es un archivo Markdown en ./cultura/, nombrado `NN-id.md`: el
// prefijo numérico fija el orden del índice y el resto es el id estable.
//
// El encabezado (frontmatter) es deliberadamente más pequeño que YAML: una
// línea `clave: valor`, la primera coma separa, y las comillas envolventes son
// opcionales. Lo que necesite más estructura va en el cuerpo Markdown, no aquí.

import { readdir, readFile } from 'node:fs/promises';

const DIR = new URL('./cultura/', import.meta.url);
const FILE_RE = /^\d{2}-([a-z0-9-]+)\.md$/;

/** @type {null | Array<Article>} */
let cached = null;

/**
 * @typedef {object} Article
 * @property {string} id          stable slug, from frontmatter or filename
 * @property {string} title
 * @property {string} kicker      section label shown on the tile
 * @property {number|null} readMinutes
 * @property {string} pull        one-line teaser for the index
 * @property {string} image       per-article artwork, empty until there is one
 * @property {string} body        Markdown source
 */

/**
 * Split a Markdown file into its flat frontmatter and its body.
 *
 * Throws on a malformed header: a silently ignored typo would hide the title
 * from the index with no other symptom.
 *
 * @param {string} source
 * @returns {{data: Record<string, string>, body: string}}
 */
export function parseFrontmatter(source) {
  const text = String(source).replace(/^\uFEFF/, '');
  if (!text.startsWith('---\n')) return { data: {}, body: text };

  const end = text.indexOf('\n---', 3);
  if (end === -1) throw new Error('frontmatter without a closing delimiter');

  const data = {};
  for (const raw of text.slice(4, end).split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const at = line.indexOf(':');
    if (at === -1) throw new Error(`invalid frontmatter line: ${line}`);
    data[line.slice(0, at).trim()] = unquote(line.slice(at + 1).trim());
  }

  const body = text.slice(end + 4).replace(/^\n+/, '');
  return { data, body };
}

/** Strip one layer of wrapping quotes, if present. */
function unquote(value) {
  const v = value;
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1).replace(/\\"/g, '"');
  }
  return v;
}

/** Read every article once; later calls reuse the parsed list. */
async function load() {
  if (cached) return cached;

  const names = (await readdir(DIR)).filter((name) => FILE_RE.test(name)).sort();
  /** @type {Article[]} */
  const out = [];

  for (const name of names) {
    const source = await readFile(new URL(name, DIR), 'utf8');
    const { data, body } = parseFrontmatter(source);
    const filenameId = FILE_RE.exec(name)[1];
    out.push({
      id: data.id || filenameId,
      title: data.title ?? '',
      kicker: data.kicker ?? '',
      readMinutes: data.readMinutes ? Number(data.readMinutes) : null,
      pull: data.pull ?? '',
      image: data.image ?? '',
      body,
    });
  }

  cached = out;
  return cached;
}

/**
 * Index entries in filename order, without the body.
 * @returns {Promise<Array<Omit<Article, 'body'>>>}
 */
export async function listArticles() {
  const articles = await load();
  return articles.map(({ body, ...meta }) => { void body; return meta; });
}

/**
 * One article by id, or null.
 * @param {string} id
 * @returns {Promise<Article|null>}
 */
export async function getArticle(id) {
  const articles = await load();
  return articles.find((a) => a.id === id) ?? null;
}

/** Test seam: forget the cache so a fixture directory can be re-read. */
export function __resetCache() {
  cached = null;
}
