// Inline SVG icons.
//
// Kept as markup strings (not emoji) so they inherit `currentColor`, stay crisp
// at any scale, and can be pixel-tuned. Drawn on a 24×24 grid with a 2-unit
// stroke and round caps/joins so they sit optically level with the labels.

const SVG_ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
  + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';

/** Sun: circle plus eight evenly spaced rays. Used for Mediodía. */
export const SUN_SVG = `<svg ${SVG_ATTRS} class="ico ico--sun">
  <circle cx="12" cy="12" r="4.25"/>
  <path d="M12 2.5v2.2M12 19.3v2.2M4.28 4.28l1.56 1.56M18.16 18.16l1.56 1.56M2.5 12h2.2M19.3 12h2.2M4.28 19.72l1.56-1.56M18.16 5.84l1.56-1.56"/>
</svg>`;

/** Crescent moon: one arc with a single clean inner curve. Used for Noche. */
export const MOON_SVG = `<svg ${SVG_ATTRS} class="ico ico--moon">
  <path d="M20.5 14.36A8.6 8.6 0 0 1 9.64 3.5a8.6 8.6 0 1 0 10.86 10.86Z"/>
</svg>`;

/**
 * Build an icon element from one of the strings above.
 * @param {'sun'|'moon'} kind
 */
export function iconElement(kind, doc = globalThis.document) {
  const span = doc.createElement('span');
  span.className = 'ico-wrap';
  span.innerHTML = kind === 'sun' ? SUN_SVG : MOON_SVG;
  return span;
}
