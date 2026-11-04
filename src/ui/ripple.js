// Material-style ripple for interactive surfaces.
//
// Delegated from the document so dynamically rendered tabs and rows get the
// effect without wiring each element. Respects `prefers-reduced-motion` and
// never blocks the click: the wave is purely decorative and is removed when the
// animation ends.

const REDUCED_MOTION = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

/** Radius that always covers the element from the touch point. */
function waveGeometry(rect, x, y) {
  const dx = Math.max(x, rect.width - x);
  const dy = Math.max(y, rect.height - y);
  const radius = Math.hypot(dx, dy);
  return { size: radius * 2, left: x - radius, top: y - radius };
}

/**
 * Paint one ripple inside `surface` at viewport coordinates (x, y).
 * Exported for tests and for programmatic triggering.
 */
export function paintRipple(surface, x, y, { doc = globalThis.document, reduced = REDUCED_MOTION() } = {}) {
  if (!surface || reduced) return null;

  const rect = surface.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;

  const { size, left, top } = waveGeometry(rect, x - rect.left, y - rect.top);

  const wave = doc.createElement('span');
  wave.className = 'ripple__wave';
  wave.style.width = `${size}px`;
  wave.style.height = `${size}px`;
  wave.style.left = `${left}px`;
  wave.style.top = `${top}px`;

  // Remove on animation end so the DOM never accumulates dead nodes.
  const cleanup = () => wave.remove();
  wave.addEventListener('animationend', cleanup, { once: true });
  // Safety net in case the event never fires (element hidden mid-animation).
  setTimeout(cleanup, 900);

  surface.append(wave);
  return wave;
}

/**
 * Enable ripples for every `.ripple` element, present or future.
 *
 * @returns {() => void} teardown
 */
export function attachRipples(root = globalThis.document) {
  const onPointerDown = (evt) => {
    const surface = evt.target.closest?.('.ripple');
    if (!surface || surface.hasAttribute('disabled')) return;
    paintRipple(surface, evt.clientX, evt.clientY, { doc: root });
  };

  // Keyboard activation has no pointer coordinates: ripple from the centre.
  const onKeyDown = (evt) => {
    if (evt.key !== 'Enter' && evt.key !== ' ') return;
    const surface = evt.target.closest?.('.ripple');
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    paintRipple(surface, rect.left + rect.width / 2, rect.top + rect.height / 2, { doc: root });
  };

  root.addEventListener('pointerdown', onPointerDown, { passive: true });
  root.addEventListener('keydown', onKeyDown);

  return () => {
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('keydown', onKeyDown);
  };
}
