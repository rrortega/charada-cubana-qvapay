// Digit roll-up and border flash.
//
// Two effects, both disabled under `prefers-reduced-motion`:
//
//   rollDigits(element, text, opts)
//     Locks one digit at a time, left to right. The current digit spins through
//     0..9 and settles on its value while the digits already resolved stay
//     still and the ones after it remain blank. Sequential, not simultaneous:
//     watching three dials stop together reads as noise.
//
//   pulseBorder(element, opts)
//     A single breathing flash: a shadow that fades as the surface expands and
//     intensifies as it contracts back.
//
// Both return a promise so callers can sequence: roll, then flash.

const prefersReducedMotion = (win = globalThis) =>
  win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

/**
 * Resolve `element`'s text one digit at a time, from left to right.
 *
 * @param {HTMLElement} element
 * @param {string|number} text final value; zero-padded by the caller when the
 *   width must be preserved (a candado group of "01" must not render as "1")
 * @param {object} [opts]
 * @param {number} [opts.digitDuration] ms each digit spends spinning
 * @param {number} [opts.step] how often the spinning digit changes, ms
 * @returns {Promise<void>} resolves when the last digit locks
 */
export function rollDigits(element, text, { digitDuration = 420, step = 55, win = globalThis } = {}) {
  if (!element) return Promise.resolve();

  const finalText = String(text);

  if (prefersReducedMotion(win)) {
    element.textContent = finalText;
    return Promise.resolve();
  }

  const digits = finalText.split('');
  const resolved = new Array(digits.length).fill(null);
  // Everything not yet reached stays blank so the reveal has a direction.
  const render = () => element.textContent = resolved.map((d) => (d === null ? '' : d)).join('');

  render();

  // Each digit spins, then locks. The next one only starts once the previous
  // has settled, which is the whole point of the effect.
  return digits.reduce((chain, target, i) => chain.then(() => new Promise((resolve) => {
    const started = win.performance?.now?.() ?? Date.now();
    let lastTick = 0;

    const tick = (now) => {
      const elapsed = (now ?? Date.now()) - started;

      if (elapsed >= digitDuration) {
        resolved[i] = target;
        render();
        resolve();
        return;
      }

      if (elapsed - lastTick >= step) {
        lastTick = elapsed;
        // Slow the flicker as this digit nears its lock.
        const progress = elapsed / digitDuration;
        if (progress < 0.72) {
          resolved[i] = String(Math.floor(Math.random() * 10));
          render();
        }
      }

      win.requestAnimationFrame(tick);
    };

    win.requestAnimationFrame(tick);
  })), Promise.resolve());
}

/**
 * Flash the surface once with a breathing shadow.
 *
 * The class drives a single CSS animation: the element expands slightly with a
 * soft, diffuse shadow, then contracts with a tighter, brighter one. One pass
 * only — repeating it read as noise rather than feedback.
 *
 * @returns {Promise<void>} resolves when the flash ends
 */
export function pulseBorder(element, { duration = 620, win = globalThis } = {}) {
  if (!element) return Promise.resolve();
  if (prefersReducedMotion(win)) return Promise.resolve();

  return new Promise((resolve) => {
    element.classList.add('is-pulsing');
    setTimeout(() => {
      element.classList.remove('is-pulsing');
      resolve();
    }, duration);
  });
}

/**
 * Roll several elements, each with its own target, then pulse their containers.
 *
 * @param {Array<{element: HTMLElement, target: number|string}>} items
 * @param {object} [opts]
 */
export async function rollAndPulse(items, { digitDuration = 420, pulseTargets = [], win = globalThis } = {}) {
  await Promise.all(items.map(({ element, text }) => rollDigits(element, text, { digitDuration, win })));
  await Promise.all(pulseTargets.map((node) => pulseBorder(node, { win })));
}
