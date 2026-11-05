// Custom bottom-sheet calendar.
//
// Deliberately not `<input type="date">`: the native picker is inconsistent
// across platforms and cannot be themed to match the host.
//
// Interaction model, following current mobile apps:
//   * a grab handle at the top, no Cancel button — dragging down dismisses
//   * drag anywhere on the sheet to follow the finger; the handle grows and
//     saturates as the drag passes the dismissal threshold
//   * swipe left/right on the calendar grid to change month
//   * a short drag springs back; a long one animates out and closes
//
// Motion is disabled wholesale under `prefers-reduced-motion`, where dragging
// still works but every transition is instant.

import { lockScroll } from './scrollLock.js';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Fraction of the sheet height that must be dragged to dismiss. */
const DISMISS_RATIO = 0.25;
/** Minimum drag in px, so tall screens do not demand a long swipe. */
const DISMISS_MIN_PX = 90;
/** Movement after which a horizontal pan is treated as a month swipe. */
const SWIPE_THRESHOLD = 46;

const pad2 = (n) => String(n).padStart(2, '0');
const toIso = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const parseIso = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: m - 1, d };
};

/**
 * Open the calendar sheet.
 *
 * @param {object} opts
 * @param {string} opts.value  currently selected ISO date
 * @param {string} [opts.min]  earliest selectable ISO date
 * @param {string} [opts.max]  latest selectable ISO date
 * @param {(iso:string)=>void} opts.onSelect
 * @param {() => void} [opts.onClose] called once, however the sheet is dismissed
 * @returns {() => void} close
 */
export function openCalendar({ value, min, max, onSelect, onClose, doc = globalThis.document, win = globalThis }) {
  const start = parseIso(value || max || toIso(new Date().getFullYear(), new Date().getMonth(), 1));
  let cursorY = start.y;
  let cursorM = start.m;

  const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

  const overlay = doc.createElement('div');
  overlay.className = 'sheet-overlay';

  const sheet = doc.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Elegir fecha');

  // Grab handle. Its size/opacity is driven by the drag progress.
  const handleWrap = doc.createElement('div');
  handleWrap.className = 'sheet__grab';
  const handle = doc.createElement('span');
  handle.className = 'sheet__handle';
  handleWrap.append(handle);

  const stage = doc.createElement('div');
  stage.className = 'sheet__stage';

  const header = doc.createElement('div');
  header.className = 'sheet__head';

  const prev = doc.createElement('button');
  prev.className = 'sheet__nav';
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Mes anterior');
  prev.textContent = '‹';

  const title = doc.createElement('span');
  title.className = 'sheet__month';

  const next = doc.createElement('button');
  next.className = 'sheet__nav';
  next.type = 'button';
  next.setAttribute('aria-label', 'Mes siguiente');
  next.textContent = '›';

  header.append(prev, title, next);

  const grid = doc.createElement('div');
  grid.className = 'cal';

  stage.append(header, grid);
  sheet.append(handleWrap, stage);
  overlay.append(sheet);
  doc.body.append(overlay);
  doc.addEventListener('keydown', onKey);

  let closed = false;
  const unlock = lockScroll(doc);

  function finishClose() {
    unlock();
    overlay.classList.remove('is-open');
    setTimeout(() => overlay.remove(), reducedMotion ? 0 : 260);
  }

  function close() {
    if (closed) return;
    closed = true;
    onClose?.();
    doc.removeEventListener('keydown', onKey);
    detachDrag();
    if (overlay.classList.contains('is-dragging')) {
      // Let the closing animation play before tearing down.
      overlay.classList.remove('is-dragging');
      overlay.style.setProperty('--drag-y', '0px');
      sheet.style.transition = 'transform 240ms cubic-bezier(0.4, 0, 1, 1)';
      sheet.style.transform = 'translateY(100%)';
      setTimeout(finishClose, reducedMotion ? 0 : 240);
    } else {
      finishClose();
    }
  }

  function onKey(evt) {
    if (evt.key === 'Escape') close();
  }

  overlay.addEventListener('click', (evt) => {
    if (evt.target === overlay) close();
  });

  const monthIndex = (y, m) => y * 12 + m;
  const minIdx = min ? monthIndex(parseIso(min).y, parseIso(min).m) : -Infinity;
  const maxIdx = max ? monthIndex(parseIso(max).y, parseIso(max).m) : Infinity;

  let direction = 0;

  function render() {
    title.textContent = `${MONTHS[cursorM]} ${cursorY}`;
    prev.disabled = monthIndex(cursorY, cursorM) <= minIdx;
    next.disabled = monthIndex(cursorY, cursorM) >= maxIdx;

    grid.replaceChildren();

    for (const w of WEEKDAYS) {
      const cell = doc.createElement('span');
      cell.className = 'cal__weekday';
      cell.textContent = w;
      grid.append(cell);
    }

    // Monday-first offset.
    const first = new Date(cursorY, cursorM, 1);
    const offset = (first.getDay() + 6) % 7;
    for (let i = 0; i < offset; i += 1) grid.append(doc.createElement('span'));

    const daysInMonth = new Date(cursorY, cursorM + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d += 1) {
      const iso = toIso(cursorY, cursorM, d);
      const outOfRange = (min && iso < min) || (max && iso > max);

      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'cal__day ripple';
      btn.textContent = String(d);
      btn.dataset.date = iso;
      if (iso === value) btn.classList.add('is-selected');
      if (outOfRange) {
        btn.disabled = true;
        btn.classList.add('is-disabled');
      }
      btn.addEventListener('click', () => {
        onSelect(iso);
        close();
      });
      grid.append(btn);
    }

    if (direction !== 0 && !reducedMotion) {
      grid.classList.remove('slide-in-left', 'slide-in-right');
      // Force a reflow so the class re-triggers the animation.
      void grid.offsetWidth;
      grid.classList.add(direction > 0 ? 'slide-in-left' : 'slide-in-right');
    }
    direction = 0;
  }

  function step(delta) {
    const targetM = cursorM + delta;
    let y = cursorY;
    let m = targetM;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    if (monthIndex(y, m) < minIdx || monthIndex(y, m) > maxIdx) return false;
    cursorY = y;
    cursorM = m;
    direction = delta;
    render();
    return true;
  }

  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));

  // ---------- Drag to dismiss / swipe to change month ----------

  let dragging = false;
  let axis = null;
  let startX = 0;
  let startY = 0;
  let dragY = 0;

  function dismissThreshold() {
    return Math.max(DISMISS_MIN_PX, sheet.offsetHeight * DISMISS_RATIO);
  }

  function paintDrag(dy) {
    // Subtle resistance past the threshold so the sheet feels elastic.
    const limit = dismissThreshold() * 1.6;
    const eased = dy <= limit ? dy : limit + (dy - limit) * 0.35;
    overlay.style.setProperty('--drag-y', `${eased}px`);
    const progress = Math.min(1, Math.max(0, dy / dismissThreshold()));
    overlay.style.setProperty('--drag-progress', String(progress));
  }

  function onPointerDown(evt) {
    if (closed) return;
    // Ignore the month arrows: they are buttons, not drag surfaces.
    if (evt.target.closest('.sheet__nav')) return;
    dragging = true;
    axis = null;
    startX = evt.clientX;
    startY = evt.clientY;
    dragY = 0;
    sheet.style.transition = 'none';
  }

  function onPointerMove(evt) {
    if (!dragging) return;
    const dx = evt.clientX - startX;
    const dy = evt.clientY - startY;

    if (axis === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (axis === 'y') overlay.classList.add('is-dragging');
    }
    if (axis !== 'y') return;

    // Only downward dragging moves the sheet; upward is ignored.
    dragY = Math.max(0, dy);
    paintDrag(dragY);
    evt.preventDefault?.();
  }

  function onPointerUp(evt) {
    if (!dragging) return;
    dragging = false;

    if (axis === 'x') {
      const dx = evt.clientX - startX;
      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        // Drag left -> next month, drag right -> previous month.
        step(dx < 0 ? 1 : -1);
      }
      axis = null;
      return;
    }

    if (axis !== 'y') return;
    axis = null;
    overlay.classList.remove('is-dragging');

    const threshold = dismissThreshold();
    if (dragY >= threshold) {
      // Enough: animate the rest of the way out.
      sheet.style.transition = 'transform 240ms cubic-bezier(0.4, 0, 1, 1)';
      sheet.style.transform = 'translateY(100%)';
      overlay.style.setProperty('--drag-y', '0px');
      overlay.style.setProperty('--drag-progress', '0');
      closed = true;
      doc.removeEventListener('keydown', onKey);
      detachDrag();
      setTimeout(finishClose, reducedMotion ? 0 : 240);
      return;
    }

    // Not enough: spring back to rest.
    sheet.style.transition = 'transform 300ms cubic-bezier(0.22, 1.4, 0.36, 1)';
    sheet.style.transform = '';
    overlay.style.setProperty('--drag-y', '0px');
    overlay.style.setProperty('--drag-progress', '0');
  }

  sheet.addEventListener('pointerdown', onPointerDown);
  win.addEventListener?.('pointermove', onPointerMove, { passive: false });
  win.addEventListener?.('pointerup', onPointerUp);
  win.addEventListener?.('pointercancel', onPointerUp);

  function detachDrag() {
    sheet.removeEventListener('pointerdown', onPointerDown);
    win.removeEventListener?.('pointermove', onPointerMove);
    win.removeEventListener?.('pointerup', onPointerUp);
    win.removeEventListener?.('pointercancel', onPointerUp);
  }

  render();
  requestAnimationFrame(() => overlay.classList.add('is-open'));

  const firstSelected = sheet.querySelector('.cal__day.is-selected:not(.is-disabled)');
  (firstSelected ?? sheet.querySelector('.sheet__nav:not([disabled])'))?.focus?.();

  return close;
}
