// Markdown renderer, dependency-free.
//
// The articles are authored in this repository, so the danger is not a hostile
// author but an accidental one: a `<` in the prose must never become a tag. The
// renderer therefore escapes the whole source first and only then emits its own
// tags, which makes the output safe by construction rather than by filtering.
//
// Supported: headings (#..####), paragraphs, **bold**, *italic*, `code`,
// [links](https://…), unordered and ordered lists, > blockquotes, horizontal
// rules, fenced code blocks and block-level images. That is the subset the
// culture articles need; anything else stays literal text.

const TOKEN = /\u0000(\d+)\u0000/g;

const RE = {
  heading: /^(#{1,4})\s+(.+)$/,
  rule: /^(?:-{3,}|\*{3,})$/,
  bullet: /^[-*+]\s+(.+)$/,
  ordered: /^\d+[.)]\s+(.+)$/,
  quote: /^>\s?(.*)$/,
  fence: /^```([\w-]*)\s*$/,
  image: /^!\[([^\]]*)\]\(([^)\s]+)\)$/,
};

/**
 * Escape the five characters that can change the meaning of HTML.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Only https, http and root-relative targets are rendered as links.
 * Everything else (`javascript:`, `data:`, protocol-relative) keeps its text
 * and loses the link.
 * @param {string} url
 * @returns {boolean}
 */
function isSafeUrl(url) {
  return /^https?:\/\/[^\s]+$/i.test(url) || /^\/[^\s]*$/.test(url);
}

/**
 * Render the inline span syntax of one line or paragraph.
 *
 * Tokens are pulled out first (code, links) so that emphasis markers inside
 * them are not interpreted, then pasted back at the end.
 *
 * Escaping happens here, before any tag is emitted, so the source can never
 * contribute markup: the block pass runs on raw text to detect its markers.
 *
 * @param {string} text raw source text
 * @returns {string}
 */
function renderInline(text) {
  /** @type {string[]} */
  const tokens = [];
  const keep = (html) => `\u0000${tokens.push(html) - 1}\u0000`;

  let out = escapeHtml(text);

  // Inline code first: its content is literal.
  out = out.replace(/`([^`]+)`/g, (_, code) => keep(`<code>${code}</code>`));

  // Links: [label](target). An unsafe target keeps the label as plain text.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const target = url.replace(/&amp;/g, '&');
    if (!isSafeUrl(target)) return label;
    return keep(`<a href="${url}" data-external="1" rel="noreferrer">${label}</a>`);
  });

  out = out
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');

  return out.replace(TOKEN, (_, i) => tokens[Number(i)] ?? '');
}

/**
 * Render a Markdown document to an HTML string.
 * @param {string} source
 * @returns {string}
 */
export function renderMarkdown(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  /** @type {string[]} */
  const out = [];
  let i = 0;

  /** Collect consecutive lines that satisfy `test`, returning their matches. */
  const takeWhile = (test) => {
    const got = [];
    while (i < lines.length) {
      const m = test(lines[i]);
      if (!m) break;
      got.push(m);
      i += 1;
    }
    return got;
  };

  while (i < lines.length) {
    const line = lines[i].trim();

    if (line === '') { i += 1; continue; }

    const fence = RE.fence.exec(line);
    if (fence) {
      i += 1;
      const body = [];
      while (i < lines.length && !RE.fence.test(lines[i].trim())) { body.push(lines[i]); i += 1; }
      i += 1; // closing fence
      const lang = fence[1] ? ` class="language-${fence[1]}"` : '';
      out.push(`<pre><code${lang}>${escapeHtml(body.join('\n'))}\n</code></pre>`);
      continue;
    }

    if (RE.rule.test(line)) { out.push('<hr>'); i += 1; continue; }

    const heading = RE.heading.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    const image = RE.image.exec(line);
    if (image) {
      // An unsafe target is kept as literal text, never as a tag.
      if (isSafeUrl(image[2].replace(/&amp;/g, '&'))) {
        out.push(`<figure><img src="${image[2]}" alt="${image[1]}" loading="lazy"></figure>`);
      } else {
        out.push(`<p>${renderInline(line)}</p>`);
      }
      i += 1;
      continue;
    }

    if (RE.quote.test(line)) {
      const quoted = takeWhile((l) => RE.quote.exec(l.trim()));
      out.push(`<blockquote><p>${renderInline(quoted.map((q) => q[1]).join(' '))}</p></blockquote>`);
      continue;
    }

    if (RE.bullet.test(line) || RE.ordered.test(line)) {
      const ordered = !RE.bullet.test(line);
      const pattern = ordered ? RE.ordered : RE.bullet;
      const items = takeWhile((l) => pattern.exec(l.trim()));
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((m) => `<li>${renderInline(m[1])}</li>`).join('')}</${tag}>`);
      continue;
    }

    // Paragraph: consecutive plain lines, joined with a single space.
    const para = [];
    while (i < lines.length) {
      const l = lines[i].trim();
      if (l === '' || RE.heading.test(l) || RE.rule.test(l) || RE.fence.test(l)
        || RE.quote.test(l) || RE.bullet.test(l) || RE.ordered.test(l) || RE.image.test(l)) break;
      para.push(l);
      i += 1;
    }
    out.push(`<p>${renderInline(para.join(' '))}</p>`);
  }

  return out.join('\n');
}
