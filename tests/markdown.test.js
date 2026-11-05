// Tests for src/markdown/markdown.js
//
// The renderer is the only place where article prose becomes HTML, so these
// tests pin both the formatting contract and the safety contract: source HTML
// never reaches the page as markup, and unsafe URLs never become hrefs.

import test from 'node:test';
import assert from 'node:assert/strict';

import { renderMarkdown, escapeHtml } from '../src/markdown/markdown.js';

// --- Blocks -----------------------------------------------------------------

test('a single line becomes a paragraph', () => {
  assert.equal(renderMarkdown('Hola charada.'), '<p>Hola charada.</p>');
});

test('a blank line separates two paragraphs', () => {
  assert.equal(
    renderMarkdown('Uno.\n\nDos.'),
    '<p>Uno.</p>\n<p>Dos.</p>',
  );
});

test('consecutive lines of one paragraph are joined with a space', () => {
  assert.equal(renderMarkdown('Uno\ny dos.'), '<p>Uno y dos.</p>');
});

test('headings one to four are rendered at their own level', () => {
  assert.equal(renderMarkdown('# Uno'), '<h1>Uno</h1>');
  assert.equal(renderMarkdown('#### Cuatro'), '<h4>Cuatro</h4>');
});

test('six hashes are not a heading', () => {
  assert.equal(renderMarkdown('###### Seis'), '<p>###### Seis</p>');
});

test('a horizontal rule is a rule', () => {
  assert.equal(renderMarkdown('---'), '<hr>');
});

test('unordered lists collect their items', () => {
  assert.equal(renderMarkdown('- uno\n- dos'), '<ul><li>uno</li><li>dos</li></ul>');
});

test('ordered lists collect their items', () => {
  assert.equal(renderMarkdown('1. uno\n2. dos'), '<ol><li>uno</li><li>dos</li></ol>');
});

test('a blockquote keeps its text', () => {
  assert.equal(renderMarkdown('> la bolita'), '<blockquote><p>la bolita</p></blockquote>');
});

test('a fenced block keeps its content literal and names its language', () => {
  const html = renderMarkdown('```js\nconst a = 1 * 2;\n```');
  assert.equal(html, '<pre><code class="language-js">const a = 1 * 2;\n</code></pre>');
});

// --- Inline -----------------------------------------------------------------

test('bold and italic are rendered', () => {
  assert.equal(renderMarkdown('un **fijo** y un *corrido*'), '<p>un <strong>fijo</strong> y un <em>corrido</em></p>');
});

test('underscores also italicise', () => {
  assert.equal(renderMarkdown('la _cábala_ manda'), '<p>la <em>cábala</em> manda</p>');
});

test('inline code is literal and keeps its markers out of the text', () => {
  assert.equal(renderMarkdown('usa `a * b` siempre'), '<p>usa <code>a * b</code> siempre</p>');
});

test('a markdown link becomes an anchor marked as external', () => {
  assert.equal(
    renderMarkdown('lee [la fuente](https://floridalottery.com/)'),
    '<p>lee <a href="https://floridalottery.com/" data-external="1" rel="noreferrer">la fuente</a></p>',
  );
});

test('a root-relative link is allowed', () => {
  assert.match(renderMarkdown('[aquí](/cultura)'), /href="\/cultura"/);
});

// --- Safety -----------------------------------------------------------------

test('source HTML is escaped, never emitted as markup', () => {
  assert.equal(
    renderMarkdown('<script>alert(1)</script>'),
    '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
  );
});

test('a javascript: link keeps its text and loses the href', () => {
  const html = renderMarkdown('[pulsa](javascript:alert(1))');
  assert.equal(html.includes('href'), false);
  assert.match(html, /pulsa/);
});

test('a data: image is not rendered as an image', () => {
  const html = renderMarkdown('![x](data:text/html;base64,PHNjcmlwdD4=)');
  assert.equal(html.includes('<img'), false);
});

test('a quote in a URL cannot break out of the attribute', () => {
  const html = renderMarkdown('[x](https://a.test/"><script>)');
  assert.equal(html.includes('"><script>'), false);
});

test('the escape helper covers the five significant characters', () => {
  assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
});
