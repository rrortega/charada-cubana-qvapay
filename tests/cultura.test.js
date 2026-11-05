// Tests for src/content/loader.js
//
// The articles are Markdown files with a flat header. These tests pin the
// parser, the index order and the payload shape the API hands to the client.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';

import { parseFrontmatter, listArticles, getArticle } from '../src/content/loader.js';

const DIR = new URL('../src/content/cultura/', import.meta.url);

// --- Parser -----------------------------------------------------------------

test('splits the header from the body', () => {
  const { data, body } = parseFrontmatter('---\nid: origen\ntitle: De la charada\n---\n\nTexto.\n');
  assert.equal(data.id, 'origen');
  assert.equal(data.title, 'De la charada');
  assert.equal(body, 'Texto.\n');
});

test('only the first colon splits: a colon inside the value survives', () => {
  const { data } = parseFrontmatter('---\npull: no es lotería: es un sistema\n---\n');
  assert.equal(data.pull, 'no es lotería: es un sistema');
});

test('one layer of wrapping quotes is removed', () => {
  const { data } = parseFrontmatter('---\npull: "nació en la calle: la cábala"\n---\n');
  assert.equal(data.pull, 'nació en la calle: la cábala');
});

test('blank lines and comments in the header are ignored', () => {
  const { data } = parseFrontmatter('---\n# un comentario\n\nid: hoy\n---\n');
  assert.deepEqual(data, { id: 'hoy' });
});

test('an empty value stays empty instead of becoming undefined', () => {
  const { data } = parseFrontmatter('---\nimage: \n---\n');
  assert.equal(data.image, '');
});

test('a header without a closing delimiter is an error', () => {
  assert.throws(() => parseFrontmatter('---\nid: origen\n'), /closing delimiter/);
});

test('a header line without a colon is an error', () => {
  assert.throws(() => parseFrontmatter('---\nsolo texto\n---\n'), /invalid frontmatter line/);
});

test('a file without a header is all body', () => {
  const { data, body } = parseFrontmatter('Solo cuerpo.\n');
  assert.deepEqual(data, {});
  assert.equal(body, 'Solo cuerpo.\n');
});

// --- Content on disk --------------------------------------------------------

test('the index follows the numeric prefix of the filenames', async () => {
  const names = (await readdir(DIR)).filter((n) => n.endsWith('.md')).sort();
  const expected = names.map((n) => n.replace(/^\d{2}-/, '').replace(/\.md$/, ''));
  const articles = await listArticles();
  assert.deepEqual(articles.map((a) => a.id), expected);
});

test('the index carries the tile fields and never the body', async () => {
  for (const article of await listArticles()) {
    assert.equal(typeof article.id, 'string');
    assert.ok(article.title.length > 0, `${article.id}: title`);
    assert.ok(article.kicker.length > 0, `${article.id}: kicker`);
    assert.equal(article.readMinutes === null || typeof article.readMinutes === 'number', true);
    assert.equal('body' in article, false, `${article.id}: body must not leak into the index`);
  }
});

test('reading one article returns its Markdown body with the section headings', async () => {
  const article = await getArticle('origen');
  assert.equal(article.id, 'origen');
  assert.match(article.body, /^La palabra «charada»/);
  assert.match(article.body, /^## Los 36 bichos$/m);
});

test('an unknown id resolves to null', async () => {
  assert.equal(await getArticle('no-existe'), null);
});
