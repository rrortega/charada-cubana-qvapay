// Scroll lock for drawers and sheets.
//
// The page no longer scrolls by itself: `#scroller` is the scroll container, so
// the bottom bar is excluded from the scrollable area. Locking therefore targets
// that element and preserves its scrollTop, which `position: fixed` on the body
// would not do.
//
// References are counted so nested overlays cannot unlock each other.

let locks = 0;
let saved = null;

/** Find the element that actually scrolls the layout. */
function scrollContainer(doc) {
  return doc?.getElementById?.('scroller') ?? doc?.scrollingElement ?? doc?.documentElement ?? null;
}

/**
 * Freeze layout scrolling.
 * @returns {() => void} release, safe to call more than once
 */
export function lockScroll(doc = globalThis.document, win = globalThis) {
  locks += 1;

  if (locks === 1) {
    const target = scrollContainer(doc);
    saved = { target, top: target?.scrollTop ?? 0, left: target?.scrollLeft ?? 0 };

    if (target) {
      // Reserve the space the scrollbar occupied so nothing reflows sideways.
      const gap = win.innerWidth - doc.documentElement.clientWidth;
      if (gap > 0) target.style.paddingRight = `${gap}px`;
      target.style.overflow = 'hidden';
    }
    doc.body?.classList.add('is-scroll-locked');
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);

    if (locks === 0 && saved) {
      const { target, top, left } = saved;
      doc.body?.classList.remove('is-scroll-locked');
      if (target) {
        target.style.overflow = '';
        target.style.paddingRight = '';
        // Restore instantly: `scroll-behavior: smooth` would animate this and
        // land short of the original position.
        target.scrollTop = top;
        target.scrollLeft = left;
      }
      saved = null;
    }
  };
}

/** True while at least one overlay holds the lock. Used by tests. */
export function isScrollLocked() {
  return locks > 0;
}

/** Reset the internal counter. Test-only helper. */
export function __resetScrollLockForTests() {
  locks = 0;
  saved = null;
}
