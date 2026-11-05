// Mini-app entry point.
//
// Two screens only, because the data shapes converge:
//   * Tiros     — one date (quick options or calendar) shown as a full card.
//   * Historial — 365 days, one row per day, expandable accordion.
//
// Runs inside the QvaPay WebView (or its simulator). Outside QvaPay
// `window.QvaPay` does not exist and the page still works.

import {
  whenReady, capabilities, applyTheme, configureHeader, getQvaPay,
  setHeader, setMainButton, setColors, haptic, toast, share, openLink, describeSdkError,
} from '/src/sdk/qvapay.js';
import { attachRipples } from '/src/ui/ripple.js';
import { openCalendar } from '/src/ui/calendar.js';
import { iconElement } from '/src/ui/icons.js';
import { rollDigits, pulseBorder } from '/src/ui/motion.js';
import { loadSession, getSession, linkAccount, restoreSession, isLinked, authHeaders } from '/src/ui/session.js';

const view = document.getElementById('view');
const tabbar = document.querySelector('.tabbar');

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const WEEKDAYS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Weekday name in uppercase for an ISO date.
 * parsed as local time so the calendar day never shifts by a time zone.
 */
function weekdayOf(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

/** Three digits with the leading one in the accent, matching the fijo panel. */
function digitsTwoTone(value, className) {
  const wrap = el('span', className);
  const text = String(value).padStart(3, '0');
  wrap.append(el('span', 'digit-lead', text[0]));
  wrap.append(el('span', 'digit-rest', text.slice(1)));
  return wrap;
}

/** "3 nov 2026" */
function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// ---------- Splash ----------
//
// The intro must never gate the app: it hides when the first view has painted,
// not when the network settles. A hard cap guarantees it cannot get stuck if a
// request hangs.

const SPLASH_MIN_MS = 700;
const SPLASH_MAX_MS = 2600;
const splashStartedAt = Date.now();
let splashTimer = null;

function hideSplash() {
  const splash = document.getElementById('splash');
  if (!splash || splash.classList.contains('is-done')) return;
  clearTimeout(splashTimer);
  const elapsed = Date.now() - splashStartedAt;
  // Let the ring complete at least one visible turn; no point flashing it.
  const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
  setTimeout(() => {
    splash.classList.add('is-done');
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    // Safety net: remove even if the transition never fires.
    setTimeout(() => splash.remove(), 700);
  }, wait);
}

function setState(message, isError = false) {
  view.replaceChildren(el('p', `state${isError ? ' state--error' : ''}`, message));
}

function renderSkeleton(rows = 4) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < rows; i += 1) {
    const box = el('div', 'skeleton');
    box.style.height = i === 0 ? '92px' : '76px';
    frag.append(box);
  }
  view.replaceChildren(frag);
}

// Every data request carries the session: the cookie when the browser keeps it,
// and the Bearer token when the WebView's third-party cookie policy drops it
// (R3-1). Sending only the cookie here made the token fallback dead code.
async function getJson(path) {
  const res = await fetch(path, {
    headers: authHeaders({ accept: 'application/json' }),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`No se pudo cargar (${res.status})`);
  return res.json();
}

// A write is the one request whose answer the screen has to read: a 4xx carries
// a machine code that becomes a sentence, so this one hands back the status
// instead of throwing on it. Same session as `getJson`, because the account is
// what the write is gated on (S7).
async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: authHeaders({ accept: 'application/json', 'content-type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(body ?? {}),
  });
  // An error page is still an answer: a missing body must not throw here.
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// Version of the content contract, sent in the URL.
//
// These endpoints changed shape while the app was being built, and a browser can
// still hold a stored copy of the previous payload. A different URL is a
// different cache entry, so a stale copy can never be mistaken for the current
// one — and when it does arrive, the shape check turns a TypeError in the middle
// of a render into a sentence the user can act on.
const CONTRACT = 'v=2';

async function getContent(path, isValid, message) {
  const data = await getJson(`${path}${path.includes('?') ? '&' : '?'}${CONTRACT}`);
  if (!isValid(data)) {
    // Name what arrived: the usual cause is a server still running the previous
    // route, and the keys it returns say so at a glance.
    const received = data && typeof data === 'object'
      ? Object.keys(data).slice(0, 4).join(', ')
      : typeof data;
    throw new Error(`${message} (recibido: ${received || 'vacío'})`);
  }
  return data;
}

// ---------- Charada artwork shared by the screens ----------
//
// One compact table (100 rows with their artwork) feeds the significados list,
// the flip card of the cargador and the symbol that appears while typing a number
// to analyse. It is fetched once and cached.

let charadaIndex = null;

async function ensureCharadaIndex() {
  if (!charadaIndex) {
    charadaIndex = await getContent('/api/significados',
      (data) => Array.isArray(data?.numbers),
      'La tabla de significados no llegó completa. Reinicia el servidor y recarga.');
  }
  return charadaIndex;
}

/** A fijo's charada number: "00" is the entry 100. */
const toEntry = (twoDigits) => (twoDigits === 0 ? 100 : twoDigits);

// ---------- Card pieces (shared by both screens) ----------

function panelFijo(draw) {
  const entry = toEntry(draw.charada?.value ?? 0);

  // The whole card turns over: one side is the number, the other its artwork.
  const card = el('section', 'flipcard');
  const inner = el('div', 'flipcard__inner');

  const front = el('div', 'flipcard__face flipcard__face--front');
  front.append(el('h2', 'panel__title', 'Fijo'));

  const row = el('div', 'fijo');
  // Each digit starts at 0 and rolls up; the targets are the real digits.
  const digits = [];
  draw.fijo.digits.forEach((digit, i) => {
    const node = el('span', `fijo__digit fijo__digit--${i === 0 ? 'lead' : 'rest'}`, '');
    digits.push({ element: node, text: String(digit) });
    row.append(node);
  });
  front.append(row);
  if (draw.fijo.significado) front.append(el('p', 'fijo__meaning', draw.fijo.significado));

  // The other side: the principal drawing big, the rest in a strip that never
  // wraps — it overflows sideways and moves with the finger.
  const back = el('div', 'flipcard__face flipcard__face--back');
  back.append(el('h2', 'panel__title', `Fijo · ${draw.fijo.formatted}`));
  const art = el('div', 'flipcard__art');
  back.append(art);
  inner.append(front, back);
  card.append(inner);

  card._digits = digits;
  card._art = art;
  card._entry = entry;

  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Fijo ${draw.fijo.formatted}. Toca para ver los símbolos del número.`);

  // A tap turns the card; a sideways drag belongs to the strip, not to the turn.
  let start = null;
  card.addEventListener('pointerdown', (event) => { start = { x: event.clientX, y: event.clientY }; });
  card.addEventListener('pointerup', (event) => {
    const dragged = start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12;
    start = null;
    if (!dragged) toggleFlipCard(card);
  });
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleFlipCard(card);
    }
  });

  return card;
}

/** Turn the card over, loading its artwork the first time that side is seen. */
function toggleFlipCard(card) {
  const open = !card.classList.contains('is-open');
  card.classList.toggle('is-open', open);

  if (open) {
    loadCardArt(card);
    return;
  }

  // The marquee only runs while its face can be seen.
  card._stopMarquee?.();
  card._stopMarquee = null;
}

/**
 * Slow marquee for the secondary drawings of the cargador.
 *
 * It always drifts on its own and reverses at both ends; there is no manual
 * dragging here, so nothing has to pause it. Honours prefers-reduced-motion.
 */
function startMarquee(strip, { speed = 0.35 } = {}) {
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};

  let direction = 1;
  let frame = 0;
  // The position lives outside scrollLeft: reading it back rounds, and with a
  // sub-pixel step the strip would never move.
  let position = strip.scrollLeft;

  const step = () => {
    const max = strip.scrollWidth - strip.clientWidth;
    if (max > 1) {
      position += direction * speed;
      if (position >= max) { position = max; direction = -1; }
      else if (position <= 0) { position = 0; direction = 1; }
      strip.scrollLeft = position;
    }
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);

  return () => cancelAnimationFrame(frame);
}

/**
 * The other drawings of one number, turning around the principal.
 *
 * The ring turns and every item turns back against it, so the drawings stay
 * upright while they travel. Each one is a way into the ficha of its number.
 */
function symbolOrbit(items, numero) {
  const orbit = el('div', 'orbit');
  orbit.setAttribute('role', 'list');

  const ring = el('div', 'orbit__ring');
  const step = 360 / items.length;

  items.forEach((significado, index) => {
    const slot = el('div', 'orbit__slot');
    slot.style.setProperty('--angle', `${step * index}deg`);

    const button = el('button', 'orbit__item ripple');
    button.type = 'button';
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-label', `${significado.nombre}: ver el significado`);

    const spin = el('span', 'orbit__spin');
    if (significado.icon) {
      const img = el('img', 'orbit__icon');
      img.src = significado.icon;
      img.alt = '';
      img.loading = 'lazy';
      spin.append(img);
    } else {
      spin.append(el('span', 'orbit__initial', (significado.nombre || '?').charAt(0).toUpperCase()));
    }
    button.append(spin);

    // The card flips on a tap: this tap is a ficha, so it must not reach the card.
    button.addEventListener('click', (evt) => {
      evt.stopPropagation();
      openFicha(numero);
    });

    slot.append(button);
    ring.append(slot);
  });

  orbit.append(ring);
  return orbit;
}

async function loadCardArt(card) {
  if (card.dataset.art) return;
  card.dataset.art = 'loading';

  try {
    const ficha = await getJson(`/api/significados?numero=${card._entry}`);
    const principal = ficha.significados.find((s) => s.rol === 'principal') ?? ficha.significados[0];
    const restantes = ficha.significados.filter((s) => s !== principal);

    card._art.replaceChildren();

    // The principal and its satellites share one stage: the orbit turns around
    // the drawing, not under it.
    const stage = el('div', 'flipcard__stage');

    if (principal?.icon) {
      // The principal sits on a white disc, like the ficha's hero.
      const disc = el('div', 'flipcard__disc');
      const hero = el('img', 'flipcard__hero');
      hero.src = principal.icon;
      hero.alt = '';
      disc.append(hero);
      stage.append(disc);
    }

    if (restantes.length > 0) stage.append(symbolOrbit(restantes, card._entry));

    card._art.append(stage);
    if (principal) card._art.append(el('span', 'flipcard__caption', principal.nombre));

    // The marquee is retired here: the other drawings now travel around the
    // principal instead of sliding beside it.
    card._stopMarquee?.();
    card._stopMarquee = null;
    card.dataset.art = 'ready';
  } catch {
    card._art.replaceChildren(el('p', 'state', 'No se pudo cargar el arte.'));
    delete card.dataset.art;
  }
}

/** Note shown when the partner draw (Pick 4) has not been published yet. */
function pendingNote(text) {
  const p = el('p', 'panel__pending', text);
  return p;
}

function panelCorridos(draw) {
  const panel = el('section', 'panel');
  panel.append(el('h2', 'panel__title', 'Corridos'));
  if (draw.complete === false) {
    panel.append(pendingNote('Pendiente del segundo sorteo'));
    return panel;
  }
  const pair = el('div', 'pair');
  const digits = [];
  draw.corridos.forEach((c, i) => {
    const node = el('span', `number2 number2--${i === 0 ? 'lead' : 'rest'}`, '');
    digits.push({ element: node, text: c.formatted });
    pair.append(node);
  });
  panel.append(pair);
  panel._digits = digits;
  return panel;
}

function panelParles(draw) {
  const panel = el('section', 'panel');
  panel.append(el('h2', 'panel__title', 'Parlé'));
  if (draw.complete === false) {
    panel.append(pendingNote('Pendiente del segundo sorteo'));
    return panel;
  }
  const grid = el('div', 'parles');
  const digits = [];
  for (const parle of draw.parles) {
    const col = el('div', 'parle');
    const top = el('span', 'parle__num parle__num--top', '');
    const bottom = el('span', 'parle__num parle__num--bottom', '');
    digits.push({ element: top, text: parle.top.formatted });
    digits.push({ element: bottom, text: parle.bottom.formatted });
    col.append(top, el('span', 'parle__div'), bottom);
    grid.append(col);
  }
  panel.append(grid);
  panel._digits = digits;
  return panel;
}

function panelCandado(draw) {
  const panel = el('section', 'panel');
  panel.append(el('h2', 'panel__title', 'Candado'));
  if (draw.complete === false) {
    panel.append(pendingNote('Pendiente del segundo sorteo'));
    return panel;
  }
  // The candado is "64.67.34": roll each two-digit group, keep the dots.
  const line = el('p', 'candado', '');
  const digits = [];
  draw.candado.formatted.split('.').forEach((group, i) => {
    if (i > 0) line.append(el('span', 'candado__dot', '.'));
    const node = el('span', 'candado__group', '');
    digits.push({ element: node, text: group });
    line.append(node);
  });
  panel.append(line);
  panel._digits = digits;
  return panel;
}

function renderFullCard(draw) {
  const frag = document.createDocumentFragment();
  const panels = [panelFijo(draw), panelCorridos(draw), panelParles(draw), panelCandado(draw)];
  for (const p of panels) frag.append(p);
  // Animate after the fragment is in the document (see animateCard).
  renderFullCard._pending = panels;
  return frag;
}

/**
 * Roll every digit in the card up from zero, then pulse each panel border.
 * Safe to call after the nodes are attached; a null argument is a no-op.
 */
function animateCard(panels = renderFullCard._pending) {
  if (!panels?.length) return Promise.resolve();
  const items = panels.flatMap((p) => p._digits ?? []);
  // Sequential per element too: each number resolves its digits left to right,
  // and the panels flash together once every number has landed.
  const promises = items.map(({ element, text }) => rollDigits(element, text));
  return Promise.all(promises).then(() => Promise.all(
    panels.map((p) => pulseBorder(p)),
  ));
}

// ---------- Countdown ----------

let countdownTimer = null;

function mountCountdown(node) {
  const tick = async () => {
    try {
      const info = await getJson('/api/proximo-tiro');
      if (!info.active) {
        node.replaceChildren();
        node.hidden = true;
        return;
      }
      node.hidden = false;
      const total = Math.max(0, info.secondsRemaining);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      node.replaceChildren(
        el('span', 'next-draw__label', 'Próximo tiro'),
        el('span', 'next-draw__countdown', `${pad2(h)}:${pad2(m)}:${pad2(s)}`),
      );
    } catch {
      node.hidden = true;
    }
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

function clearCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
}

// ---------- Tiros ----------

const QUICK = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'ayer', label: 'Ayer' },
  { key: 'hace-un-anio', label: 'Hace 1 año' },
];

let currentDate = null;

async function viewTiros() {
  renderSkeleton();
  const data = currentDate
    ? await getJson(`/api/tiro?fecha=${encodeURIComponent(currentDate)}`)
    : await getJson('/api/tiro');

  if (!data.available) {
    setState(`Sin sorteos para el ${formatDate(data.date)}.`);
    return;
  }

  // The fijo shows its drawing; the table must be in memory before painting.
  await ensureCharadaIndex().catch(() => null);

  const frag = document.createDocumentFragment();

  // Date + countdown
  const bar = el('div', 'daybar');
  const dateBox = el('span', 'daybar__box');
  dateBox.append(el('span', 'daybar__date', formatDate(data.date)));
  dateBox.append(el('span', 'daybar__weekday', weekdayOf(data.date)));
  bar.append(dateBox);
  const next = el('div', 'next-draw');
  next.hidden = true;
  bar.append(next);
  frag.append(bar);
  mountCountdown(next);

  // Quick options + calendar. Exactly one chip is active: a quick key while one
  // is selected, otherwise the "Fecha" chip showing the chosen date.
  const isQuick = !currentDate || QUICK.some((q) => q.key === currentDate);
  const quick = el('div', 'quick');
  quick.setAttribute('role', 'tablist');
  quick.setAttribute('aria-label', 'Fecha del tiro');

  for (const opt of QUICK) {
    const active = isQuick && (currentDate ?? 'hoy') === opt.key;
    const btn = el('button', `quick__chip ripple${active ? ' is-active' : ''}`, opt.label);
    btn.type = 'button';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(active));
    btn.addEventListener('click', () => {
      currentDate = opt.key;
      navigate('tiros');
    });
    quick.append(btn);
  }

  const calActive = !isQuick;
  const calBtn = el('button', `quick__chip quick__chip--icon ripple${calActive ? ' is-active' : ''}`, '');
  calBtn.type = 'button';
  calBtn.setAttribute('role', 'tab');
  calBtn.setAttribute('aria-selected', String(calActive));
  calBtn.setAttribute('aria-label', calActive ? `Fecha elegida: ${formatDate(data.date)}` : 'Elegir fecha');
  calBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2v2h10V2h2v2h2v18H3V4h2V2Zm12 8H5v10h14ZM5 6v2h14V6Z"/></svg>';
  calBtn.append(el('span', '', calActive ? formatDate(data.date) : 'Fecha'));
  calBtn.addEventListener('click', () => openDatePicker());
  quick.append(calBtn);

  frag.append(quick);

  // Mediodía / Noche
  const tabs = el('div', 'drawtabs');
  tabs.setAttribute('role', 'tablist');
  const body = el('div');

  const show = (key) => {
    for (const btn of tabs.children) btn.setAttribute('aria-selected', String(btn.dataset.draw === key));
    const draw = data[key];
    if (!draw) {
      body.replaceChildren(el('p', 'state', 'Sin sorteo de este turno.'));
      return;
    }
    body.replaceChildren(renderFullCard(draw));
    animateCard();
  };

  for (const [key, label, icon] of [['midday', 'Mediodía', 'sun'], ['evening', 'Noche', 'moon']]) {
    const btn = el('button', 'drawtabs__tab ripple', '');
    btn.append(iconElement(icon), el('span', '', label));
    btn.dataset.draw = key;
    btn.setAttribute('role', 'tab');
    btn.disabled = !data[key];
    btn.addEventListener('click', () => show(key));
    tabs.append(btn);
  }
  frag.append(tabs, body);
  view.replaceChildren(frag);

  const preferred = data.evening ? 'evening' : 'midday';
  show(preferred);
}

async function openDatePicker() {
  // Two taps on the header action used to stack two sheets and throw. While one
  // is open the action is hidden, and this guard covers the gap before the
  // header is repainted.
  if (calendarOpen) return;

  const range = await getJson('/api/rango').catch(() => null);
  if (!range?.to) return;
  const initial = /^\d{4}-\d{2}-\d{2}$/.test(currentDate ?? '') ? currentDate : range.to;

  calendarOpen = true;
  syncChrome('tiros');

  const closeCalendar = openCalendar({
    value: initial,
    min: range.from,
    max: range.to,
    onSelect: (iso) => {
      // Picking a day navigates: the sheet's entry is neutralised, not walked
      // back, or the back lands after the push and undoes it.
      settleOverlay('calendar');
      currentDate = iso;
      navigate('tiros');
    },
    onClose: () => {
      calendarOpen = false;
      syncChrome('tiros');
      // Closed by its own controls: take the entry back off with it.
      releaseOverlayEntry('calendar');
    },
  });

  openOverlay('calendar', closeCalendar);
}

// ---------- Historial (one row per day, accordion) ----------

let expandedDate = null;

function renderDayRow(day) {
  const isOpen = expandedDate === day.date;

  const item = el('div', `dayitem${isOpen ? ' is-open' : ''}`);

  const head = el('button', 'dayrow ripple');
  head.setAttribute('aria-expanded', String(isOpen));

  const left = el('span', 'dayrow__left');
  left.append(el('span', 'dayrow__date', formatDate(day.date)));
  left.append(el('span', 'dayrow__weekday', weekdayOf(day.date)));

  const cols = el('span', 'dayrow__cols');
  for (const [key, label, icon] of [['midday', 'MED', 'sun'], ['evening', 'NOCHE', 'moon']]) {
    const col = el('span', 'dayrow__col');
    const lab = el('span', 'dayrow__label', '');
    lab.append(iconElement(icon), el('span', '', label));
    col.append(lab);
    const draw = day[key];
    if (draw) col.append(digitsTwoTone(draw.fijo.formatted, 'dayrow__num'));
    else col.append(el('span', 'dayrow__num is-empty', '—'));
    cols.append(col);
  }
  head.append(left, cols);

  item.append(head);

  if (isOpen) {
    const detail = el('div', 'daydetail');
    const split = el('div', 'daysplit');

    for (const [key, label, icon] of [['midday', 'Mediodía', 'sun'], ['evening', 'Noche', 'moon']]) {
      const area = el('div', 'daysplit__area');
      const title = el('span', 'daysplit__title', '');
      title.append(iconElement(icon), el('span', '', label));
      area.append(title);
      const draw = day[key];
      if (!draw) {
        area.append(el('span', 'daysplit__empty', 'Sin sorteo'));
      } else {
        area.append(el('span', 'daysplit__label', 'Corridos'));
        area.append(el('span', 'daysplit__value', draw.corridos.map((c) => c.formatted).join('  ')));
        area.append(el('span', 'daysplit__label', 'Candado'));
        area.append(el('span', 'daysplit__value', draw.candado.formatted));
      }
      split.append(area);
    }
    detail.append(split);
    item.append(detail);
  }

  head.addEventListener('click', () => {
    // Accordion: opening one collapses any other.
    expandedDate = isOpen ? null : day.date;
    renderHistorialBody();
  });

  return item;
}

let historialDays = null;
let historialList = null;

function renderHistorialBody() {
  if (!historialList || !historialDays) return;
  historialList.replaceChildren(...historialDays.map(renderDayRow));
}

async function viewHistorial() {
  if (!historialList) renderSkeleton(6);

  const data = await getJson('/api/dias?limite=365');
  historialDays = data.days ?? [];

  const frag = document.createDocumentFragment();
  const head = el('div', 'histhead');
  head.append(el('h2', 'panel__title', 'Últimos 365 días'));
  frag.append(head);

  if (historialDays.length === 0) {
    frag.append(el('p', 'state', 'Sin sorteos.'));
    view.replaceChildren(frag);
    return;
  }

  historialList = el('div', 'daylist');
  renderHistorialBody();
  frag.append(historialList);
  view.replaceChildren(frag);
}


// ---------- Análisis ----------
//
// One persistent element drives the whole transition: the number itself. In the
// input state it is a huge centred field; on "Analizar" it shrinks into the
// header position while a skeleton fills the rest. Tapping it again reverses
// the motion and returns focus to the field.
//
// Keeping a single node (rather than swapping two screens) is what makes the
// motion continuous: CSS transitions need the element to survive the change.

let analysisNumber = null;
let analysisData = null;
/** The <img> under the input, updated as digits arrive. */
let analysisSymbolEl = null;

/** Show the symbol of the typed number, or hide it when it is not a valid entry. */
async function updateAnalysisSymbol() {
  const img = analysisSymbolEl;
  if (!img) return;
  if (!inAnalysisRange(analysisNumber)) { img.hidden = true; return; }

  const index = await ensureCharadaIndex().catch(() => null);
  const entry = index?.numbers.find((n) => n.number === analysisNumber);
  if (!entry?.icon) { img.hidden = true; return; }

  if (img.getAttribute('src') !== entry.icon) img.src = entry.icon;
  img.hidden = false;
}

/** The table goes from 1 to 100: 0 is not an entry, 100 is the last one. */
const inAnalysisRange = (n) => n !== null && n >= 1 && n <= 100;

/** The element that animates between "input" and "result" states. */
function buildNumberNode() {
  const wrap = el('div', 'ananum');

  const input = el('input', 'ananum__input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.maxLength = 3;
  input.placeholder = '0';
  input.setAttribute('aria-label', 'Número a analizar');
  if (analysisNumber !== null) input.value = String(analysisNumber);

  // Digits only: strip anything else as it is typed or pasted.
  input.addEventListener('input', () => {
    const clean = input.value.replace(/\D/g, '').slice(0, 3);
    if (clean !== input.value) input.value = clean;
    analysisNumber = clean === '' ? null : Number(clean);
    // The round action appears with the first digit and only enables in range.
    const go = document.getElementById('analyser-go');
    if (go) {
      go.hidden = analysisNumber === null;
      go.disabled = !inAnalysisRange(analysisNumber);
    }
    // The native main button mirrors the same enablement.
    if (currentView === 'analisis') syncChrome('analisis');
    updateAnalysisSymbol();
  });

  input.addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter' && analysisNumber !== null) runAnalysis();
  });

  // The text shown while in the result state.
  const label = el('span', 'ananum__value', analysisNumber === null ? '00' : String(analysisNumber).padStart(2, '0'));

  wrap.append(input, label);
  return { wrap, input, label };
}

let numberNode = null;
let numberEls = null;

function renderAnalysisInput({ focus = true } = {}) {
  numberEls = numberEls ?? buildNumberNode();
  const { wrap, input, label } = numberEls;

  label.textContent = analysisNumber === null ? '0' : String(analysisNumber).padStart(2, '0');
  input.value = analysisNumber === null ? '' : String(analysisNumber);

  const frag = document.createDocumentFragment();

  const hint = el('p', 'analyser__hint', 'Escribe un número del 1 al 100');
  const stage = el('div', 'analyser');
  stage.append(hint, wrap);

  // The symbol of what is being typed, above the action.
  const symbol = el('img', 'analyser__symbol');
  symbol.alt = '';
  symbol.hidden = true;
  analysisSymbolEl = symbol;
  stage.append(symbol);

  // The action lives under the number: no bar at the bottom, and it only shows
  // once there is a digit to analyse.
  const go = el('button', 'analysecircle ripple');
  go.type = 'button';
  go.id = 'analyser-go';
  go.setAttribute('aria-label', 'Analizar este número');
  go.append(iconElement('sparkle'));
  go.hidden = analysisNumber === null;
  go.disabled = !inAnalysisRange(analysisNumber);
  go.addEventListener('click', runAnalysis);
  stage.append(go);
  frag.append(stage);

  view.replaceChildren(frag);
  doc_body_class_toggle('is-analyser', true);
  document.body.classList.remove('is-analysing');
  if (focus) requestAnimationFrame(() => input.focus?.());
  updateAnalysisSymbol();
}

function doc_body_class_toggle(name, on) {
  document.body.classList.toggle(name, on);
}

async function runAnalysis() {
  if (!inAnalysisRange(analysisNumber)) return;

  // Phase 1: shrink the number into place and show a skeleton for the rest.
  // The number node is moved, not recreated, so the transition is continuous.
  const stage = document.querySelector('.analyser');
  const result = el('div', 'anaresult is-loading');
  result.append(el('div', 'anaskeleton'));
  for (const h of ['92px', '150px', '182px', '210px']) {
    const box = el('div', 'skeleton');
    box.style.height = h;
    result.querySelector('.anaskeleton').append(box);
  }

  if (numberEls) {
    result.prepend(numberEls.wrap);
    numberEls.wrap.classList.add('is-compact');
  }

  document.body.classList.add('is-analysing');
  doc_body_class_toggle('is-analyser', false);
  view.replaceChildren(result);
  stage?.remove();

  try {
    const data = await getJson(`/api/analisis?numero=${analysisNumber}`);
    const ficha = await getJson(`/api/significados?numero=${analysisNumber}`).catch(() => null);
    analysisData = data;
    renderAnalysisResult(data, ficha);
    // The result is a screen state the user walked into: it earns an entry, so
    // the native back button returns to the input instead of leaving the app.
    if (!history.state?.resultado) {
      history.pushState({ ...(history.state ?? {}), view: 'analisis', resultado: true }, '', location.href);
    }
    syncChrome('analisis');
  } catch (err) {
    setState(err.message, true);
  }
}

/** Return to the input state, animating the number back to the centre. */
function resetAnalysis() {
  numberEls?.wrap.classList.remove('is-compact');
  analysisData = null;
  renderAnalysisInput({ focus: true });
  syncChrome('analisis');

  // Same rule as a sheet: leaving the result takes its entry back off, so back
  // is not spent on a screen that is already gone.
  if (history.state?.resultado) {
    ignoringPop = true;
    history.back();
  }
}

/** Horizontal bar row used by the weekday/month breakdown. */
/** Bars grow one after another; this counts them within one render. */
let barSeq = 0;

function barRow(label, hits, total, { highlight = false } = {}) {
  const row = el('div', `bar${highlight ? ' bar--hot' : ''}`);
  row.append(el('span', 'bar__label', label));
  const track = el('div', 'bar__track');
  const fill = el('div', 'bar__fill');
  const max = total || 1;
  const width = `${Math.max(2, (hits / max) * 100)}%`;

  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    fill.style.width = width;
  } else {
    // Zero now, real width after the row is in the document, so the transition
    // plays. The delay cascades the bars instead of filling them at once.
    fill.style.width = '0%';
    const delay = Math.min(400, (barSeq += 1) * 45);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fill.style.transitionDelay = `${delay}ms`;
      fill.style.width = width;
    }));
  }

  track.append(fill);
  row.append(track);
  row.append(el('span', 'bar__value', String(hits)));
  return row;
}

function tile(label, value, sub) {
  const box = el('div', 'tile');
  box.append(el('span', 'tile__label', label));
  box.append(el('span', 'tile__value', value));
  if (sub) box.append(el('span', 'tile__sub', sub));
  return box;
}

/**
 * Horizontal art strip: the meanings' drawings, swipeable, no visible scrollbar.
 *
 * One drawing appears once: the delivered table reuses the same image under
 * several names, and repeating it in the strip says nothing new.
 */
function symbolStrip(ficha, { inline = false } = {}) {
  const strip = el('div', `symbolstrip${inline ? ' symbolstrip--inline' : ''}`);
  strip.setAttribute('role', 'list');

  const seen = new Set();
  for (const meaning of ficha.significados) {
    const key = meaning.clave ?? meaning.icon ?? `sin-arte-${meaning.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const item = el('div', 'symbolstrip__item');
    item.setAttribute('role', 'listitem');

    if (meaning.icon) {
      const disc = el('span', 'symbolstrip__disc');
      const img = el('img', 'symbolstrip__icon');
      img.src = meaning.icon;
      img.alt = '';
      img.loading = 'lazy';
      disc.append(img);
      item.append(disc);
    } else {
      item.append(el('span', 'symbolstrip__initial', (meaning.nombre || '?').charAt(0)));
    }

    item.append(el('span', 'symbolstrip__name', meaning.nombre));
    strip.append(item);
  }

  return strip;
}

function renderAnalysisResult(a, ficha = null) {
  const frag = document.createDocumentFragment();

  // Every meaning of the number, as art you swipe through above the number.
  if (ficha && ficha.significados?.length) frag.append(symbolStrip(ficha));

  // Header: the same number node, now compact and tappable to reset.
  const head = el('div', 'anahead');
  if (numberEls) {
    numberEls.label.textContent = String(a.target).padStart(2, '0');
    numberEls.wrap.classList.add('is-compact', 'is-tappable');
    numberEls.wrap.setAttribute('role', 'button');
    numberEls.wrap.setAttribute('tabindex', '0');
    numberEls.wrap.setAttribute('aria-label', 'Analizar otro número');
    numberEls.wrap.onclick = resetAnalysis;
    numberEls.wrap.onkeydown = (evt) => {
      if (evt.key === 'Enter' || evt.key === ' ') { evt.preventDefault(); resetAnalysis(); }
    };
    head.append(numberEls.wrap);
  }
  if (a.significado) head.append(el('span', 'anahead__meaning', a.significado));
  frag.append(head);

  const tabs = el('div', 'drawtabs');
  tabs.setAttribute('role', 'tablist');
  const body = el('div');

  const perTurn = a.perTurn ?? {};
  const show = (key) => {
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.draw === key));
    body.replaceChildren(renderAnalysisPanels(a, key, perTurn[key]));
  };

  for (const [key, label, icon] of [['MIDDAY', 'Mediodía', 'sun'], ['EVENING', 'Noche', 'moon']]) {
    const b = el('button', 'drawtabs__tab ripple', '');
    b.append(iconElement(icon), el('span', '', label));
    b.dataset.draw = key;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => show(key));
    tabs.append(b);
  }
  frag.append(tabs, body);
  view.replaceChildren(frag);

  // Default to whichever turn has more hits.
  const preferred = (perTurn.MIDDAY?.hits ?? 0) >= (perTurn.EVENING?.hits ?? 0) ? 'MIDDAY' : 'EVENING';
  show(preferred);
}

function renderAnalysisPanels(a, drawKey, turn) {
  barSeq = 0;
  const frag = document.createDocumentFragment();
  const turnLabel = drawKey === 'MIDDAY' ? 'Mediodía' : 'Noche';
  const t = turn ?? { hits: 0, draws: 0, averageSpacing: null, gap: { neverSeen: true } };

  // Tiles are scoped to the selected turn, matching the tabs above them.
  const tiles = el('div', 'tiles');
  tiles.append(tile('Salidas', String(t.hits), `${turnLabel} · ${t.draws} sorteos`));
  const spacing = t.averageSpacing?.draws;
  tiles.append(tile('Frecuencia', spacing ? `1/${spacing}` : '—', 'sorteos'));
  frag.append(tiles);

  // Gap, also turn-scoped.
  const gapPanel = el('section', 'panel');
  gapPanel.append(el('h2', 'panel__title', `Sin salir · ${turnLabel}`));
  const gapValue = t.gap?.neverSeen ? 'Nunca' : `${t.gap?.current ?? 0} sorteos`;
  gapPanel.append(el('p', 'bigstat', gapValue));
  if (t.gap?.max != null) gapPanel.append(el('p', 'bigstat__sub', `Máximo sin salir: ${t.gap.max}`));
  frag.append(gapPanel);

  // Weekday breakdown
  const wd = el('section', 'panel');
  wd.append(el('h2', 'panel__title', 'Por día de la semana'));
  const maxWd = Math.max(1, ...a.byWeekday.map((d) => d.hits));
  for (const d of a.byWeekday) wd.append(barRow(d.name.slice(0, 3), d.hits, maxWd));
  frag.append(wd);

  // Month breakdown
  const mo = el('section', 'panel');
  mo.append(el('h2', 'panel__title', 'Por mes'));
  const maxMo = Math.max(1, ...a.byMonth.map((m) => m.hits));
  for (const m of a.byMonth) mo.append(barRow(m.name, m.hits, maxMo));
  frag.append(mo);

  // Context: share vs expectation, streaks
  const ctx = el('section', 'panel');
  ctx.append(el('h2', 'panel__title', 'Frecuencia histórica'));
  ctx.append(barRow('Este número', a.share, Math.max(2, a.share)));
  ctx.append(el('p', 'note',
    `${turnLabel}: ${t.hits} de ${t.draws} sorteos (${t.share}%). `
    + `En todo el historial: ${a.hits} de ${a.totalDraws} (${a.share}%).`));
  ctx.append(el('p', 'note',
    'Cada sorteo es independiente: lo esperado por azar es 1%. '
    + 'Que un número lleve tiempo sin salir no lo hace más probable.'));
  if (a.streaks) {
    ctx.append(el('p', 'note',
      `Racha máxima: ${a.streaks.longest} seguidos. `
      + `Repeticiones consecutivas: ${a.streaks.consecutiveRepeats} `
      + `(esperadas ${a.streaks.expectedRepeats}).`));
  }
  if (a.range?.from) {
    ctx.append(el('p', 'note', `Historial: ${formatDate(a.range.from)} — ${formatDate(a.range.to)}`));
  }
  frag.append(ctx);

  return frag;
}


// ---------- Más ----------
//
// The menu is always visible. The gate appears only when a tool that needs an
// account is tapped: showing an empty locked screen first would explain nothing.

const MORE_TOOLS = [
  {
    id: 'significados',
    title: 'Los 100 significados',
    blurb: 'La tabla completa de la charada, con el símbolo de cada número.',
    icon: 'grid',
    needsAccount: false,
    status: 'ready',
  },
  {
    id: 'sueno',
    title: 'Cuéntame tu sueño',
    blurb: 'Cuéntanos lo que soñaste, con tus palabras, y te lo leemos en clave de charada.',
    icon: 'moon',
    needsAccount: true,
    status: 'ready',
  },
  {
    id: 'adivinanza',
    title: 'La adivinanza',
    blurb: 'Cada día, un dicharacho con doble sentido armado con las combinaciones del día.',
    icon: 'sun',
    needsAccount: false,
    status: 'ready',
  },
  {
    id: 'corazonada',
    title: 'Tengo una corazonada',
    blurb: 'Di qué número crees que sale hoy y compáralo con el resto de corazonadas.',
    icon: 'heart',
    needsAccount: true,
    status: 'soon',
  },
  {
    id: 'cultura',
    title: 'Origen y cultura',
    blurb: 'De la charada china a la bolita cubana: cómo llegó el juego hasta aquí.',
    icon: 'book',
    needsAccount: false,
    status: 'ready',
  },
];

const TOOL_ICONS = {
  moon: '<path d="M20.5 14.36A8.6 8.6 0 0 1 9.64 3.5a8.6 8.6 0 1 0 10.86 10.86Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-7.5-9.4A4.3 4.3 0 0 1 12 8.4a4.3 4.3 0 0 1 7.5 2.7c0 4.8-7.5 9.4-7.5 9.4Z"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22Zm0 0V22"/>',
  grid: '<path d="M4 4h7v7H4Zm9 0h7v7h-7ZM4 13h7v7H4Zm9 0h7v7h-7Z"/>',
};

function toolIcon(name) {
  const wrap = el('span', 'toolicon');
  wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" `
    + `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TOOL_ICONS[name] ?? TOOL_ICONS.book}</svg>`;
  return wrap;
}

async function viewMas() {
  await loadSession();
  const session = getSession();

  const frag = document.createDocumentFragment();

  // When linked, the header becomes the profile: avatar, name, @username.
  if (session.linked) {
    const profile = el('div', 'profile');
    const avatar = el('div', 'profile__avatar');
    if (session.avatar) {
      const img = el('img', 'profile__img');
      img.src = session.avatar;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => { avatar.replaceChildren(el('span', 'profile__initial', (session.name ?? session.username ?? '?')[0].toUpperCase())); });
      avatar.append(img);
    } else {
      avatar.append(el('span', 'profile__initial', (session.name ?? session.username ?? '?')[0].toUpperCase()));
    }

    const who = el('div', 'profile__who');
    const full = [session.name, session.lastname].filter(Boolean).join(' ').trim();
    if (full) who.append(el('span', 'profile__name', full));
    who.append(el('span', 'profile__handle', `@${session.username ?? 'usuario'}`));

    profile.append(avatar, who);
    frag.append(profile);
  } else {
    const head = el('div', 'morehead');
    head.append(el('h2', 'panel__title', 'Más'));
    head.append(el('p', 'morehead__who', 'Vincula tu cuenta de QvaPay para usar las herramientas.'));
    frag.append(head);
  }

  const ready = MORE_TOOLS.filter((tool) => tool.status === 'ready');
  const soon = MORE_TOOLS.filter((tool) => tool.status !== 'ready');

  const grid = el('div', 'toolgrid');
  for (const tool of ready) grid.append(toolCard(tool));
  frag.append(grid);

  if (soon.length > 0) {
    // One divider carries the word; repeating the tag inside every card said the
    // same thing three times and stole room from the title.
    const divider = el('div', 'toolgrid__divider');
    divider.append(el('span', 'toolgrid__label', 'Próximamente'));
    frag.append(divider);

    const pending = el('div', 'toolgrid');
    for (const tool of soon) pending.append(toolCard(tool));
    frag.append(pending);
  }
  view.replaceChildren(frag);
}

/** One tool card. A tool that is not ready keeps its content and loses colour. */
function toolCard(tool) {
  const card = el('button', `toolcard ripple${tool.status === 'ready' ? '' : ' toolcard--soon'}`);
  card.type = 'button';
  card.append(toolIcon(tool.icon));

  const body = el('span', 'toolcard__body');
  body.append(el('span', 'toolcard__title', tool.title));
  body.append(el('span', 'toolcard__blurb', tool.blurb));
  card.append(body);

  card.addEventListener('click', () => openTool(tool));
  return card;
}

/**
 * Enter a tool, or explain what is needed first.
 *
 * Order matters: "not logged in" is actionable, "coming soon" is not. Telling
 * someone a feature is unavailable before telling them how to unlock it wastes
 * the tap.
 */
async function openTool(tool) {
  if (tool.needsAccount && !isLinked()) {
    sheetMessage({
      title: 'Necesitas tu cuenta',
      body: `Para usar «${tool.title}» vincula tu cuenta de QvaPay. Así guardamos tus datos y no pierdes nada al volver.`,
      action: 'Vincular cuenta',
      onAction: () => linkAndRetry(tool),
    });
    return;
  }

  if (tool.id === 'cultura') {
    navigate('cultura');
    return;
  }

  if (tool.id === 'significados') {
    navigate('significados');
    return;
  }

  if (tool.id === 'adivinanza') {
    navigate('adivinanza');
    return;
  }

  if (tool.id === 'sueno') {
    navigate('sueno');
    return;
  }

  if (tool.status === 'soon') {
    sheetMessage({
      title: 'Muy pronto',
      body: `«${tool.title}» todavía está en el horno. Ya tenemos los datos listos; falta la última vuelta.`,
    });
    return;
  }
}

async function linkAndRetry(tool) {
  if (!(await startLink())) return;
  await viewMas();
  syncChrome('mas');
  openTool(tool);
}

/**
 * Run the login handshake and explain the outcome.
 *
 * Shared by the "needs an account" sheet and the header's account action, so a
 * cancellation is handled exactly once.
 */
async function startLink() {
  const sdk = getQvaPay();
  if (!sdk) {
    sheetMessage({
      title: 'Abre QvaPay',
      body: 'El vínculo con tu cuenta solo funciona dentro de la app de QvaPay o de su simulador.',
    });
    return false;
  }

  const result = await linkAccount(sdk);
  if (result.ok) {
    haptic(sdk, 'success').catch(() => {});
    return true;
  }

  sheetMessage({
    title: result.code === 'USER_CANCELLED' ? 'Sin prisa' : 'No se pudo vincular',
    body: result.code === 'USER_CANCELLED'
      ? 'Cerraste la ventana de permiso. Puedes intentarlo cuando quieras.'
      : 'Inténtalo de nuevo en un momento.',
  });
  return false;
}

/** Small bottom sheet with a message and an optional action. */
let sheetSeq = 0;

function sheetMessage({ title, body, action, onAction }) {
  const name = `sheet-${(sheetSeq += 1)}`;
  const overlay = el('div', 'sheet-overlay is-open');
  const sheet = el('div', 'sheet sheet--msg');

  const grab = el('div', 'sheet__grab');
  grab.append(el('span', 'sheet__handle'));

  const h = el('h3', 'sheetmsg__title', title);
  const p = el('p', 'sheetmsg__body', body);

  const actions = el('div', 'sheetmsg__actions');
  const close = () => { overlay.classList.remove('is-open'); setTimeout(() => overlay.remove(), 240); };

  if (action) {
    const go = el('button', 'actionbar__btn ripple ripple--on-accent', action);
    // The action usually opens another sheet or navigates; settle in place so no
    // back is in flight when that happens.
    go.addEventListener('click', () => { settleOverlay(name); onAction?.(); });
    actions.append(go);
  }
  const cancel = el('button', 'sheetmsg__cancel ripple', action ? 'Ahora no' : 'Entendido');
  cancel.addEventListener('click', () => closeOverlay(name));
  actions.append(cancel);

  sheet.append(grab, h, p, actions);
  overlay.append(sheet);
  overlay.addEventListener('click', (evt) => { if (evt.target === overlay) closeOverlay(name); });
  document.body.append(overlay);

  // A sheet is a step: the native back button closes it (S16).
  openOverlay(name, close);
}


// ---------- Cultura ----------
//
// The index is a grid of tiles, one per article (S13). Each article is rendered
// from the Markdown that the server already converted to HTML (S12), so the
// client never parses Markdown and never builds prose by hand.

let cultureIndex = null;

async function viewCultura() {
  renderSkeleton(4);
  if (!cultureIndex) {
    cultureIndex = await getContent('/api/cultura',
      (data) => Array.isArray(data?.articles),
      'La sección de cultura no llegó completa. Reinicia el servidor y recarga.');
  }
  renderCultureIndex(cultureIndex);
}

/** One tile: artwork slot on top, kicker, title, teaser and reading time. */
function cultureTile(article, position, { mark = null, onOpen = null } = {}) {
  const tile = el('button', 'culturetile ripple');
  tile.type = 'button';

  const art = el('span', 'culturetile__art');
  if (article.image) {
    const img = el('img', 'culturetile__img');
    img.src = article.image;
    img.alt = '';
    img.loading = 'lazy';
    art.append(img);
  } else {
    // No artwork yet: the order number stands in for the illustration, so the
    // tile reads as designed rather than as a missing image.
    art.append(el('span', 'culturetile__mark', mark ?? String(position + 1).padStart(2, '0')));
  }

  const body = el('span', 'culturetile__body');
  body.append(el('span', 'culturetile__kicker', article.kicker));
  body.append(el('span', 'culturetile__title', article.title));
  if (article.pull) body.append(el('span', 'culturetile__pull', article.pull));
  if (article.readMinutes) body.append(el('span', 'culturetile__meta', `${article.readMinutes} min`));

  tile.append(art, body);
  tile.setAttribute('aria-label', `${article.title} — ${article.readMinutes ?? 0} minutos de lectura`);
  tile.addEventListener('click', onOpen ?? (() => openArticle(article.id)));
  return tile;
}

function renderCultureIndex(data) {
  const frag = document.createDocumentFragment();

  const head = el('div', 'morehead culturehead');
  head.append(el('h2', 'panel__title', 'Historia y cultura'));
  head.append(el('p', 'morehead__who', 'Cómo llegó la charada a Cuba y por qué sigue viva.'));
  frag.append(head);

  const grid = el('div', 'culturegrid');
  data.articles.forEach((article, i) => grid.append(cultureTile(article, i)));

  // The glossary is one more tile, not a list hanging under the index: it is
  // reference material, and it now opens like any other piece.
  grid.append(cultureTile(
    {
      kicker: 'Jerga',
      title: 'Diccionario del barrio',
      pull: 'Del apuntador al banquero: cómo se nombra cada cosa en la bolita.',
      image: '',
    },
    data.articles.length,
    { mark: 'A-Z', onOpen: () => openGlossary() },
  ));

  frag.append(grid);
  view.replaceChildren(frag);
}

/** Searchable glossary. Kept inline: it is reference material, not an article. */
function glossaryBlock(entries) {
  const wrap = el('div', 'glossary');
  wrap.append(el('h3', 'glossary__title', 'Diccionario del barrio'));

  const input = el('input', 'glossary__search');
  input.type = 'search';
  input.id = 'glossary-search';
  input.placeholder = 'Buscar un término…';
  input.setAttribute('aria-label', 'Buscar en el diccionario');
  wrap.append(input);

  const list = el('div', 'glossary__list');
  wrap.append(list);

  const draw = (query) => {
    const q = query.trim().toLowerCase();
    const items = entries.filter((g) =>
      q === '' || g.term.toLowerCase().includes(q) || g.def.toLowerCase().includes(q));
    if (items.length === 0) {
      list.replaceChildren(el('p', 'state', 'Sin resultados.'));
      return;
    }
    list.replaceChildren(...items.slice(0, 60).map((g) => {
      const row = el('div', 'glassrow');
      row.append(el('span', 'glassrow__term', g.term));
      row.append(el('span', 'glassrow__def', g.def));
      return row;
    }));
  };

  input.addEventListener('input', () => draw(input.value));
  draw('');
  return wrap;
}

async function openArticle(id, { push = true } = {}) {
  if (push) pushView('cultura', { article: id });
  renderSkeleton(3);
  const article = await getContent(`/api/cultura?id=${encodeURIComponent(id)}`,
    (data) => typeof data?.html === 'string',
    'El artículo no llegó completo. Reinicia el servidor y recarga.');
  const frag = document.createDocumentFragment();

  const back = el('button', 'backlink ripple', '‹ Historia y cultura');
  back.type = 'button';
  back.addEventListener('click', closeArticle);
  frag.append(back);

  // The article's own illustration, when it has one.
  if (article.image) {
    const art = el('img', 'readerart');
    art.src = article.image;
    art.alt = '';
    art.decoding = 'async';
    frag.append(art);
  }

  const head = el('header', 'readerhead');
  head.append(el('span', 'culturetile__kicker', article.kicker));
  head.append(el('h2', 'readerhead__title', article.title));
  if (article.readMinutes) head.append(el('span', 'readerhead__meta', `${article.readMinutes} min de lectura`));
  if (article.pull) head.append(el('p', 'readerhead__pull', article.pull));
  frag.append(head);

  // The server renders the Markdown, and its renderer escapes the source before
  // emitting any tag, so this HTML cannot carry markup from the prose.
  const prose = el('div', 'prose');
  prose.innerHTML = article.html;
  frag.append(prose);

  const note = el('p', 'readernote',
    'Material histórico y cultural sobre la charada cubana. Cada sorteo es independiente: '
    + 'conocer la tradición no mejora la probabilidad de acertar.');
  frag.append(note);

  view.replaceChildren(frag);
  view.scrollTop = 0;
  syncChrome('article', { title: article.title });
}

async function openGlossary({ push = true } = {}) {
  if (push) pushView('cultura', { glosario: true });
  renderSkeleton(4);

  if (!cultureIndex) {
    cultureIndex = await getContent('/api/cultura',
      (data) => Array.isArray(data?.articles),
      'La sección de cultura no llegó completa. Reinicia el servidor y recarga.');
  }

  const frag = document.createDocumentFragment();
  const head = el('div', 'morehead');
  head.append(el('h2', 'panel__title', 'Diccionario del barrio'));
  head.append(el('p', 'morehead__who', 'Las palabras con las que se habla la charada.'));
  frag.append(head);
  frag.append(glossaryBlock(cultureIndex.glossary));

  view.replaceChildren(frag);
  view.scrollTop = 0;
  syncChrome('cultura', { titulo: 'Diccionario del barrio' });
}

function closeArticle() {
  // The article is its own history entry, so this link and the native back
  // button do exactly the same thing.
  if (history.state?.article) {
    history.back();
    return;
  }
  if (cultureIndex) renderCultureIndex(cultureIndex);
  else viewCultura();
  syncChrome('cultura');
}

// ---------- Significados ----------
//
// The charada table as delivered: 100 fichas with their meanings, artwork and
// the traditional relations between numbers (S16). The list stays small (one row
// per number) and the ficha is fetched when it is opened, so the two screens are
// separate requests. Navigation goes through history: the native back button
// returns from a ficha to the list.

async function viewSignificados() {
  renderSkeleton(6);
  await ensureCharadaIndex();
  renderCharadaList(charadaIndex);
}

function renderCharadaList(data) {
  const frag = document.createDocumentFragment();

  const head = el('div', 'morehead');
  head.append(el('h2', 'panel__title', 'Los 100 significados'));
  const totalSignificados = data.total?.significados
    ?? data.numbers.reduce((acc, row) => acc + row.significados, 0);
  head.append(el('p', 'morehead__who', `${totalSignificados} significados repartidos en 100 fichas.`));

  const search = el('input', 'glossary__search');
  search.type = 'search';
  search.id = 'significados-search';
  search.placeholder = 'Buscar número o símbolo…';
  search.setAttribute('aria-label', 'Buscar en los significados');
  // Hidden until the native header's search action asks for it.
  search.setAttribute('hidden', '');
  head.append(search);
  frag.append(head);

  const list = el('div', 'signlist');
  frag.append(list);

  const draw = (query) => {
    const q = query.trim().toLowerCase();
    // The 693 names travel with the list, so filtering is local and instant: no
    // request per keystroke. An entry matches by its number or by any meaning.
    const rows = data.numbers.filter((entry) =>
      q === ''
      || String(entry.number).startsWith(q)
      || entry.nombres.some((name) => name.toLowerCase().includes(q)));

    if (rows.length === 0) {
      list.replaceChildren(el('p', 'state', 'Sin resultados.'));
      return;
    }
    list.replaceChildren(...rows.map(charadaRow));
  };

  search.addEventListener('input', () => draw(search.value));
  draw('');
  view.replaceChildren(frag);
}

/** One row: number, principal artwork, name and how much is inside. */
function charadaRow(entry) {
  const row = el('button', 'signrow ripple');
  row.type = 'button';
  row.setAttribute('aria-label', `${entry.number}: ${entry.principal}`);

  row.append(el('span', 'signrow__num', String(entry.number)));

  if (entry.icon) {
    const img = el('img', 'signrow__thumb');
    img.src = entry.icon;
    img.alt = '';
    img.loading = 'lazy';
    row.append(img);
  } else {
    // No artwork for the principal symbol: no grey placeholder pretending there
    // is one, just the space the row already reserves.
    row.append(el('span', 'signrow__thumb signrow__thumb--empty'));
  }

  const text = el('span', 'signrow__text');
  text.append(el('span', 'signrow__title', entry.principal));
  text.append(el('span', 'signrow__meta', `${entry.significados} significados · ${entry.conArte} con dibujo`));

  row.append(text, el('span', 'signrow__chev', '›'));
  row.addEventListener('click', () => openFicha(entry.number));
  return row;
}

async function openFicha(number, { push = true } = {}) {
  if (push) pushView('significados', { numero: number });
  renderSkeleton(4);
  const ficha = await getContent(`/api/significados?numero=${number}`,
    (data) => Array.isArray(data?.significados),
    `La ficha ${number} no llegó completa. Reinicia el servidor y recarga.`);
  renderFicha(ficha);
  syncChrome('significados', { ficha: `${ficha.number} · ${ficha.principal}` });
}

function renderFicha(ficha) {
  const frag = document.createDocumentFragment();

  // Hero: the symbol on a white disc over a purple band, the number on a badge
  // that hangs off the disc, and the name underneath. Nothing here goes back:
  // the QvaPay header already carries the native back button.
  const head = el('header', 'fichahero');

  const disc = el('div', 'fichahero__disc');
  if (ficha.icon) {
    const img = el('img', 'fichahero__icon');
    img.src = ficha.icon;
    img.alt = '';
    disc.append(img);
  } else {
    // No drawing for the symbol: its initial, never a borrowed image.
    disc.append(el('span', 'fichahero__initial', (ficha.principal || '?').charAt(0).toUpperCase()));
  }
  disc.append(el('span', 'fichahero__badge', String(ficha.number)));

  head.append(disc);
  head.append(el('h2', 'fichahero__name', ficha.principal));
  frag.append(head);

  const conArte = ficha.significados.filter((s) => s.icon).length;
  frag.append(el('p', 'fichameta', `${ficha.significados.length} significados · ${conArte} con dibujo`));

  if (ficha.contexto) frag.append(el('p', 'ficha__contexto', ficha.contexto));

  // Tradition: the relations the table declares between numbers, as links. They
  // are navigation, not a suggestion of what to play.
  const links = el('div', 'fichalinks');
  const tradicion = ficha.tradicion ?? {};
  let hasLinks = false;
  links.append(el('span', 'fichalinks__label', 'Tradición'));
  for (const [label, value] of [['Peón', tradicion.peon], ['Compañero', tradicion.companero]]) {
    if (!value) continue;
    const chip = el('button', 'chip chip--link ripple', `${label} ${value}`);
    chip.type = 'button';
    chip.addEventListener('click', () => openFicha(value));
    links.append(chip);
    hasLinks = true;
  }
  if (tradicion.cuadrilla) {
    links.append(el('span', 'chip', `Cuadrilla: ${tradicion.cuadrilla}`));
    hasLinks = true;
  }
  if (hasLinks) frag.append(links);

  const list = el('div', 'fichalist');
  for (const meaning of ficha.significados) {
    const item = el('div', 'fichaitem');

    if (meaning.icon) {
      const img = el('img', 'fichaitem__icon');
      img.src = meaning.icon;
      img.alt = '';
      img.loading = 'lazy';
      item.append(img);
    } else {
      item.append(el('span', 'fichaitem__icon fichaitem__icon--empty'));
    }

    const body = el('span', 'fichaitem__body');
    const title = el('span', 'fichaitem__title', meaning.nombre);
    if (meaning.rol === 'principal') title.append(el('span', 'fichaitem__badge', 'principal'));
    body.append(title);
    if (meaning.descripcion) body.append(el('span', 'fichaitem__desc', meaning.descripcion));
    item.append(body);
    list.append(item);
  }
  frag.append(list);

  if (ficha.relacionadas.length > 0) {
    const related = el('div', 'fichalinks');
    related.append(el('span', 'fichalinks__label', 'Relacionadas'));
    for (const number of ficha.relacionadas) {
      const chip = el('button', 'chip chip--link ripple', String(number));
      chip.type = 'button';
      chip.addEventListener('click', () => openFicha(number));
      related.append(chip);
    }
    frag.append(related);
  }

  view.replaceChildren(frag);
  view.scrollTop = 0;
}

// No back control here: the QvaPay header carries the native one, and a browser
// has its own. Navigation already pushes history, so both return to the list.

// ---------- La adivinanza ----------

// The dicharacho on screen, so the header's share button shares this text and
// not the app's sales pitch.
let adivinanzaShown = null;

// A screen that cannot be filled says why; it never shows invented text (S18).
const ADIV_EMPTY = {
  sin_tiro: 'Todavía no hay tiro para ese día, así que tampoco hay adivinanza.',
  unconfigured: 'La adivinanza todavía no está encendida en este servidor.',
  error: 'El dicharacho se atascó al generarse. Prueba de nuevo en un rato.',
  rejected: 'El dicharacho de hoy no pasó el filtro de calidad. Prueba de nuevo en un rato.',
};

/**
 * The daily adivinanza: one dicharacho, read-only, plus the days behind it.
 *
 * The text is generated server-side once per date and stored (S2), so this
 * screen composes nothing: it asks for a date and prints what comes back.
 */
async function viewAdivinanza() {
  const fecha = new URLSearchParams(location.search).get('fecha');
  renderSkeleton(3);

  let data;
  try {
    data = await getContent(
      `/api/adivinanza${fecha ? `?fecha=${encodeURIComponent(fecha)}` : ''}`,
      (d) => typeof d?.disponible === 'boolean',
      'La adivinanza no llegó completa. Reinicia el servidor y recarga.',
    );
  } catch (err) {
    setState(err.message, true);
    return;
  }

  renderAdivinanza(data);
  fillAdivinanzaHistory(data.date);
}

function renderAdivinanza(data) {
  const frag = document.createDocumentFragment();

  const head = el('div', 'morehead adiv__head');
  // The QvaPay header already says "La adivinanza"; repeating it inside the page
  // spends the first screenful on a title the user just read.
  if (!isHosted()) head.append(el('h2', 'panel__title', 'La adivinanza'));
  head.append(el('p', 'morehead__who', 'Un dicharacho con doble sentido, publicado después de las 8 de la noche para el tiro siguiente.'));
  frag.append(head);

  if (!data.disponible) {
    adivinanzaShown = null;
    const empty = el('div', 'panel adiv adiv--empty');
    empty.append(el('p', 'adiv__texto', ADIV_EMPTY[data.motivo] ?? ADIV_EMPTY.error));
    frag.append(empty);
    view.replaceChildren(frag);
    view.scrollTop = 0;
    return;
  }

  adivinanzaShown = data;

  const card = el('article', 'panel adiv');
  const meta = el('div', 'adiv__meta');
  // The date is the day the riddle is FOR, so it is never the day of the draw it
  // hints at (S11). The number it evokes is not on screen at all (S10).
  meta.append(el('span', 'adiv__date', `Para el ${formatDate(data.date)} · ${weekdayOf(data.date)}`));
  card.append(meta);
  card.append(el('p', 'adiv__texto', data.texto));
  card.append(el('p', 'adiv__foot', 'Juego de palabras con los significados del día. No es un pronóstico.'));
  frag.append(card);

  // Filled after the card, so the text never waits for the list.
  frag.append(el('div', 'adiv__history'));

  view.replaceChildren(frag);
  view.scrollTop = 0;
}

/** Short version of a text, cut on a word so the ellipsis does not orphan one. */
function snippet(text, limit = 110) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > limit * 0.6 ? space : limit).trimEnd()}…`;
}

async function fillAdivinanzaHistory(currentDate) {
  const holder = view.querySelector('.adiv__history');
  if (!holder) return;

  let data;
  try {
    data = await getContent('/api/adivinanzas?limite=20',
      (d) => Array.isArray(d?.items),
      'El historial de adivinanzas no llegó completo.');
  } catch {
    // A missing history is not worth an error banner over a text that is fine.
    holder.remove();
    return;
  }

  const rows = data.items.filter((row) => row.date !== currentDate);
  if (rows.length === 0) {
    holder.remove();
    return;
  }

  const head = el('div', 'morehead adiv__histhead');
  head.append(el('h2', 'panel__title', 'Adivinanzas anteriores'));
  holder.append(head);

  for (const row of rows) {
    const btn = el('button', 'adiv__row ripple');
    btn.type = 'button';

    const line = el('span', 'adiv__rowhead');
    line.append(el('span', 'adiv__rowdate', formatDate(row.date)));
    btn.append(line);
    btn.append(el('span', 'adiv__rowsnip', snippet(row.texto)));

    btn.addEventListener('click', () => navigate('adivinanza', { extra: { fecha: row.date } }));
    holder.append(btn);
  }
}

/** The header's share button: the dicharacho on its screen, the app elsewhere. */
async function shareCurrentScreen() {
  if (currentView === 'adivinanza' && adivinanzaShown?.texto) {
    // Shared text carries the day and the riddle, never the number it evokes
    // (S10): the illusion only holds while the number stays hidden.
    const text = `La adivinanza para el ${formatDate(adivinanzaShown.date)}:\n\n`
      + `${adivinanzaShown.texto}\n\nLa charada cubana, en QvaPay.`;
    try {
      await share(sdkRef, { text });
      return;
    } catch {
      // Fall through: sharing the app is better than a dead button.
    }
  }
  await shareMiniApp();
}

// ---------- Cuéntame tu sueño ----------
//
// One dream in, one reading out (S1). The text goes up once and is not kept:
// what comes back are the signals it left, the numbers they point at (S5) and
// the week's coincidences (S3, S4). Nothing of another dream ever reaches this
// screen — the route answers with counts only (S4).
//
// The last reading lives in a module variable, like `analysisData`, so stepping
// into the tab again shows the reading instead of an empty field.

const SUENO_PROMISE = 'Escribe lo que soñaste. Queda guardado en tu cuenta, para que puedas volver a leerlo; nadie más lo ve.';

let suenoResult = null;
let suenoSemana = null;
/** The author's own stored dreams, read once per visit (S9). */
let suenoHistorial = null;
let suenoText = '';
let suenoLoading = false;
let suenoError = null;
/** The text that is being, or has been, read: the frozen copy and the share. */
let suenoSubmitted = '';
/** Which tab is open: the dream you wrote, or what it evoked. */
let suenoTab = 'sueno';
/** The nodes of the current render, so a request can update the state in place. */
let suenoEls = null;

async function viewSueno() {
  const frag = document.createDocumentFragment();

  const head = el('div', 'morehead sueno__head');
  // The host bar already says "Cuéntame tu sueño"; repeating it would spend the
  // first screenful on a title the user just read.
  if (!isHosted()) head.append(el('h2', 'panel__title', 'Cuéntame tu sueño'));
  head.append(el('p', 'morehead__who', SUENO_PROMISE));
  frag.append(head);

  // The two halves are tabs from the moment the screen opens: the reading is a
  // locked tab until there is one, so the shape never changes under the finger.
  const tabs = el('div', 'sueno__tabs');
  tabs.setAttribute('role', 'tablist');
  frag.append(tabs);

  const pane = el('div', 'sueno__pane');
  frag.append(pane);

  view.replaceChildren(frag);
  view.scrollTop = 0;
  suenoEls = { tabs, pane, input: null, go: null };
  renderSuenoTabs();
  renderSuenoPane();
  loadSuenoSemana();
}

/** The tab bar. «La interpretación» stays locked while there is nothing to read. */
function renderSuenoTabs() {
  const holder = suenoEls?.tabs;
  if (!holder) return;

  const locked = !suenoResult && !suenoLoading;
  const buttons = [];

  for (const [key, label] of [['sueno', 'Mi sueño'], ['lectura', 'La interpretación']]) {
    const active = suenoTab === key;
    const isLocked = key === 'lectura' && locked;
    const tab = el('button', `sueno__tab${active ? ' is-active' : ''}${isLocked ? ' is-locked' : ''}`, label);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(active));
    tab.disabled = isLocked;
    if (isLocked) tab.setAttribute('aria-disabled', 'true');
    tab.addEventListener('click', () => {
      if (isLocked) return;
      suenoTab = key;
      renderSuenoTabs();
      renderSuenoPane();
    });
    buttons.push(tab);
  }

  holder.replaceChildren(...buttons);
}

/** The open tab's content: the form, the skeleton, or the reading. */
function renderSuenoPane() {
  const holder = suenoEls?.pane;
  if (!holder) return;

  // Whatever was being typed belongs to the pane that is about to go away.
  cancelSuenoTyping();

  if (suenoTab === 'lectura') {
    if (suenoLoading) {
      holder.replaceChildren(suenoSkeleton());
      return;
    }
    if (suenoResult) {
      holder.replaceChildren(suenoReading(suenoResult));
      return;
    }
  }

  holder.replaceChildren(suenoForm());
}

/** The field and the action, full width: on a phone the button is the target. */
function suenoForm() {
  const block = el('div', 'sueno__form');

  const input = el('textarea', 'sueno__input');
  input.setAttribute('rows', '6');
  input.setAttribute('maxlength', '2000');
  input.setAttribute('placeholder', 'Anoche soñé que…');
  input.setAttribute('aria-label', 'Lo que soñaste');
  input.value = suenoText;
  input.addEventListener('input', () => {
    suenoText = input.value;
    // Editing after a reading leaves that reading behind: it answered other
    // words. The tab closes until the new text is interpreted.
    if (suenoResult) {
      suenoResult = null;
      suenoSubmitted = '';
      suenoTab = 'sueno';
      renderSuenoTabs();
    }
    syncSuenoButton();
  });

  // The button is the only submit: Enter inside the field is a newline, because
  // a dream is prose and a stray Enter must not send it.
  const go = el('button', 'sueno__go ripple', suenoResult ? 'Limpiar' : 'Interpretar');
  go.type = 'button';
  go.addEventListener('click', () => {
    if (suenoResult) resetSueno();
    else runSueno();
  });

  block.append(input, go);

  if (suenoError) block.append(el('p', 'state state--error', suenoError));

  // The week is context for the field, so it lives here and only while there is
  // no reading to show: the counter of signals, the combinations they make, and
  // the dreams already stored.
  if (!suenoResult) {
    if (suenoSemana?.combinaciones) block.append(suenoPlay(suenoSemana.combinaciones));
    if (suenoSemana?.senales?.length) block.append(suenoWeek(suenoSemana.senales));
    if (suenoHistorial?.length) block.append(suenoHistory(suenoHistorial));
  }

  suenoEls.input = input;
  suenoEls.go = go;
  syncSuenoButton();
  return block;
}

/** Empty text and an in-flight request both disable the action. */
function syncSuenoButton() {
  if (!suenoEls?.go) return;
  suenoEls.go.textContent = suenoResult ? 'Limpiar' : 'Interpretar';
  // «Limpiar» is always available: clearing needs no text.
  suenoEls.go.disabled = suenoLoading || (!suenoResult && suenoEls.input.value.trim() === '');
}

/** Start over: the text, the reading and the open tab all go back to zero. */
function resetSueno() {
  suenoResult = null;
  suenoError = null;
  suenoSubmitted = '';
  suenoText = '';
  suenoTab = 'sueno';
  renderSuenoTabs();
  renderSuenoPane();
}

/** The boxes that hold the reading's place while the model works. */
function suenoSkeleton() {
  const wrap = el('div', 'sueno__skeleton');
  for (const height of ['92px', '128px', '182px']) {
    const box = el('div', 'skeleton');
    box.style.height = height;
    wrap.append(box);
  }
  return wrap;
}

/**
 * Write the reading out the way a stream arrives: character by character.
 *
 * The server sends the whole sentence in one answer, so this is presentation,
 * not transport. Reduced motion gets it in one shot.
 */
let suenoTyping = null;

function cancelSuenoTyping() {
  if (suenoTyping) clearInterval(suenoTyping);
  suenoTyping = null;
}

function typeResumen(node, text) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  if (reduced || !text) {
    node.textContent = text ?? '';
    return;
  }

  let i = 0;
  node.textContent = '';
  cancelSuenoTyping();
  suenoTyping = setInterval(() => {
    // Leaving the tab mid sentence must not keep writing into a dead node.
    if (!node.isConnected) {
      cancelSuenoTyping();
      return;
    }
    i += 1;
    node.textContent = text.slice(0, i);
    if (i >= text.length) cancelSuenoTyping();
  }, 18);
}

/** The week: its signals and the combinations they make (S3, S10). */
async function loadSuenoSemana() {
  try {
    const data = await getJson('/api/sueno/senales?dias=7');
    suenoSemana = {
      senales: Array.isArray(data?.senales) ? data.senales : [],
      combinaciones: data?.combinaciones ?? null,
    };
  } catch {
    // The week is context, not the point of the screen: its absence must not
    // put an error over a field that still works.
    suenoSemana = null;
  }
  await loadSuenoHistorial();
  renderSuenoPane();
}

/** The author's own dreams. Silent when there is none to list (S9). */
async function loadSuenoHistorial() {
  try {
    const data = await getJson('/api/suenos');
    suenoHistorial = Array.isArray(data?.items) ? data.items : [];
  } catch {
    // Not signed in, or nothing stored: the field still works without a list.
    suenoHistorial = [];
  }
  renderSuenoPane();
}

/** Open one stored dream of the author's own, read again from the server. */
async function openStoredSueno(id) {
  try {
    const data = await getJson(`/api/sueno/lectura?id=${encodeURIComponent(id)}`);
    suenoResult = data;
    suenoSubmitted = data?.texto ?? '';
    suenoText = data?.texto ?? '';
    suenoTab = 'lectura';
    renderSuenoTabs();
    renderSuenoPane();
  } catch {
    // The row is gone or is not ours; the list keeps showing what does exist.
  }
}

/** The week's signal counter: one row per signal, never a dream (S4). */
function suenoWeek(rows) {
  const panel = el('section', 'panel sueno__week');
  panel.append(el('h2', 'panel__title', 'Esta semana'));

  if (!rows.length) {
    panel.append(el('p', 'sueno__empty', 'Todavía nadie ha soñado con esto esta semana.'));
    return panel;
  }

  const list = el('div', 'sueno__rows');
  for (const row of rows) {
    const line = el('div', 'sueno__row');
    line.append(el('span', 'sueno__rowname', row.senal));
    line.append(el('span', 'sueno__rowcount', `${row.suenos} ${row.suenos === 1 ? 'sueño' : 'sueños'}`));
    list.append(line);
  }
  panel.append(list);
  return panel;
}

/** The week's playable combinations: fijo, corridos and parles (S10). */
function suenoPlay(combos) {
  const panel = el('section', 'panel sueno__play');
  panel.append(el('h2', 'panel__title', 'Para jugar esta semana'));

  const fijo = combos.fijos?.[0];
  if (fijo) {
    const row = el('div', 'sueno__fijorow');
    row.append(el('span', 'sueno__fijolabel', 'Fijo'));
    // The leading digit in the accent, like the cargador card does.
    const digits = el('span', 'sueno__fijonum');
    digits.append(el('span', 'digit-lead', fijo.formatted[0]));
    digits.append(el('span', 'digit-rest', fijo.formatted.slice(1)));
    row.append(digits);
    panel.append(row);
  }

  if (combos.corridos?.length) {
    const block = el('div', 'sueno__playblock');
    block.append(el('h3', 'sueno__playsub', 'Corridos'));
    const row = el('div', 'sueno__balls');
    for (const corrido of combos.corridos) row.append(el('span', 'sueno__ball', corrido.formatted));
    block.append(row);
    panel.append(block);
  }

  if (combos.parles?.length) {
    const block = el('div', 'sueno__playblock');
    block.append(el('h3', 'sueno__playsub', 'Parles'));
    const row = el('div', 'sueno__parles');
    for (const parle of combos.parles) {
      const card = el('span', 'sueno__parle');
      card.append(el('span', 'sueno__parletop', parle.top.formatted));
      card.append(el('span', 'sueno__parlebottom', parle.bottom.formatted));
      row.append(card);
    }
    block.append(row);
    panel.append(block);
  }

  panel.append(el('p', 'sueno__note', 'Es el material de la semana, no un pronóstico.'));
  return panel;
}

/** The author's own dreams, newest first: a way back into a reading (S9). */
function suenoHistory(rows) {
  const panel = el('section', 'panel sueno__history');
  panel.append(el('h2', 'panel__title', 'Tus sueños anteriores'));

  for (const row of rows) {
    const item = el('button', 'sueno__historyrow ripple');
    item.type = 'button';

    const when = el('span', 'sueno__historydate', formatDate(row.fecha));
    item.append(when);
    if (row.resumen) item.append(el('span', 'sueno__historysnip', snippet(row.resumen, 80)));
    item.addEventListener('click', () => openStoredSueno(row.id));
    panel.append(item);
  }

  return panel;
}

/** The reading of one dream: its numbers, its signals, the week around it. */
function suenoReading(data) {
  const block = el('div', 'sueno__result');

  // The sentence that ties the dream to its symbols comes first and is written
  // out as a stream would arrive: the numbers below are the same answer in
  // another language.
  if (data.resumen) {
    const lead = el('p', 'sueno__resumen');
    block.append(lead);
    typeResumen(lead, data.resumen);
  }

  // The numbers chosen for the whole dream, with the art of each element (S5).
  const numeros = el('section', 'panel');
  numeros.append(el('h2', 'panel__title', 'Los números'));
  const cards = el('div', 'sueno__nums');
  for (const item of data.elementos ?? []) {
    // Each number is a way into its ficha: the reading points at the table, and
    // the table is where the symbol is explained.
    const card = el('button', 'sueno__num ripple');
    card.type = 'button';
    card.setAttribute('aria-label', `Ver el ${item.numero} en los significados`);

    const disc = el('span', 'sueno__numdisc');
    if (item.icono) {
      const img = el('img', 'sueno__numicon');
      img.src = item.icono;
      img.alt = '';
      img.loading = 'lazy';
      disc.append(img);
    } else {
      // Without art the initial of the meaning holds the disc, same rule as the
      // ficha hero: a missing drawing must not leave a hole.
      disc.append(el('span', 'sueno__numinitial', (item.significado || '?').charAt(0).toUpperCase()));
    }
    // The number hangs off the disc's bottom-right corner, almost escaping it.
    disc.append(el('span', 'sueno__numbadge', pad2(item.numero)));

    card.append(disc);
    if (item.significado) card.append(el('span', 'sueno__numname', item.significado));
    card.addEventListener('click', () => openFicha(item.numero));
    cards.append(card);
  }
  numeros.append(cards);
  block.append(numeros);

  // One chip per signal: its name and the numbers its symbols suggest.
  const senales = el('section', 'panel');
  senales.append(el('h2', 'panel__title', 'Las señales'));
  const chips = el('div', 'sueno__chips');
  for (const senal of data.senales ?? []) {
    const chip = el('span', 'sueno__chip');
    chip.append(el('span', 'sueno__chipname', senal.nombre));
    if (senal.numeros?.length) {
      chip.append(el('span', 'sueno__chipnums', senal.numeros.map((n) => pad2(n)).join(' · ')));
    }
    chips.append(chip);
  }
  senales.append(chips);
  block.append(senales);

  const coincidencias = data.coincidencias ?? null;
  if (!coincidencias) return block;

  block.append(suenoWeek(coincidencias.senales ?? []));

  // How close this dream is to the week's others. No other dream's text ever
  // reaches this screen; who it was is the public profile the app already holds
  // and the user just asked to see.
  const parecidos = coincidencias.parecidos ?? { total: 0, muestra: [] };
  const pare = el('section', 'panel');
  pare.append(el('h2', 'panel__title', 'Se parece a'));
  if (parecidos.total > 0) {
    pare.append(el('p', 'sueno__note', parecidos.total === 1
      ? 'Tu sueño se parece al de 1 persona esta semana.'
      : `Tu sueño se parece al de ${parecidos.total} personas esta semana.`));

    const list = el('div', 'sueno__people');
    for (const match of parecidos.muestra ?? []) {
      const row = el('div', 'sueno__person');

      const avatar = el('span', 'sueno__avatar');
      if (match.avatar) {
        const img = el('img', 'sueno__avatarimg');
        img.src = match.avatar;
        img.alt = '';
        img.loading = 'lazy';
        avatar.append(img);
      } else {
        // No picture still needs a face: the initial holds the disc, same rule
        // as a missing drawing in the numbers.
        avatar.append(el('span', 'sueno__avatarinitial', (match.nombre || '?').charAt(0).toUpperCase()));
      }

      const who = el('span', 'sueno__whobody');
      who.append(el('span', 'sueno__whoname', match.nombre ? `@${match.nombre}` : 'Alguien'));
      who.append(el('span', 'sueno__whoshared', `${match.compartidas} ${match.compartidas === 1 ? 'señal en común' : 'señales en común'}`));

      row.append(avatar, who);
      list.append(row);
    }
    pare.append(list);
  } else {
    pare.append(el('p', 'sueno__empty', 'De momento es el único sueño así esta semana.'));
  }
  block.append(pare);

  return block;
}

async function runSueno() {
  const texto = suenoEls?.input.value.trim() ?? '';
  if (suenoLoading || !texto) return;

  suenoLoading = true;
  suenoError = null;
  suenoSubmitted = texto;
  // The answer lives in the other tab: open it now so the skeleton is where the
  // reading will appear, instead of making the user look for it.
  suenoTab = 'lectura';
  renderSuenoTabs();
  renderSuenoPane();

  let out = null;
  try {
    out = await postJson('/api/sueno', { sueno: texto });
  } catch {
    // A dead network is not an answer: there is no code to read, so it falls
    // through to the generic retry line below.
    out = null;
  }

  suenoLoading = false;

  if (out?.status === 200 && Array.isArray(out.data?.numeros)) {
    suenoResult = out.data;
    suenoError = null;
    suenoTab = 'lectura';
    renderSuenoTabs();
    renderSuenoPane();
    // The dream just stored belongs in the list under the field.
    loadSuenoHistorial();
    return;
  }

  // A failed request keeps the text and returns to it: rewriting a dream is
  // worse than retrying one.
  suenoResult = null;
  suenoSubmitted = '';
  suenoTab = 'sueno';
  suenoError = suenoErrorFor(out?.data?.error);
  renderSuenoTabs();
  renderSuenoPane();
  if (out?.data?.error === 'cuenta_requerida') suenoNeedAccount();
}

/** The machine code of the route, turned into a sentence the user can act on. */
function suenoErrorFor(code) {
  if (code === 'sueno_vacio') return 'Escribe tu sueño primero.';
  if (code === 'sueno_largo') return 'Tu sueño es muy largo: resúmelo en 2000 caracteres.';
  if (code === 'no_configurado') return 'La interpretación todavía no está encendida en este servidor.';
  if (code === 'cuenta_requerida') return 'Vincula tu cuenta de QvaPay para interpretar tu sueño.';
  // llm_* and internal errors are not the user's to fix: offer the way back.
  return 'No se pudo interpretar tu sueño. Inténtalo otra vez en un momento.';
}

/** The gate of S7 as an action, so the refusal is not a dead end. */
function suenoNeedAccount() {
  sheetMessage({
    title: 'Necesitas tu cuenta',
    body: 'Para interpretar tu sueño vincula tu cuenta de QvaPay. Lo que escribiste sigue ahí.',
    action: 'Vincular cuenta',
    onAction: async () => { if (await startLink()) runSueno(); },
  });
}


// ---------- Router ----------

const VIEWS = {
  tiros: viewTiros,
  analisis: viewAnalisis,
  historial: viewHistorial,
  mas: viewMas,
  cultura: viewCultura,
  significados: viewSignificados,
  adivinanza: viewAdivinanza,
  sueno: viewSueno,
};

async function viewAnalisis() {
  if (analysisData) renderAnalysisResult(analysisData);
  else renderAnalysisInput();
}

function initialView() {
  const wanted = new URLSearchParams(location.search).get('vista');
  return wanted && wanted in VIEWS ? wanted : 'tiros';
}

// ---------- Host chrome (header, main button, notices) ----------
//
// One table decides what QvaPay's own bar says on each screen (S14). Keeping it
// in one place means a screen cannot disagree with itself, and the dedupe below
// keeps us from re-sending an identical state on every re-render.

let sdkRef = null;
let currentView = 'tiros';
let chromeSent = null;
let calendarOpen = false;

/** Brand colours for the host surfaces, matching :root in the stylesheet. */
const BRAND = { header: '#0e1116', background: '#0e1116' };

const ACTION = {
  calendar: { id: 'calendar', icon: 'calendar', label: 'Elegir fecha' },
  search: { id: 'search', icon: 'search', label: 'Buscar' },
  share: { id: 'share', icon: 'share', label: 'Compartir' },
  user: { id: 'user', icon: 'user', label: 'Mi cuenta' },
};

function chromeFor(name, context = {}) {
  switch (name) {
    case 'tiros':
      return {
        subtitle: 'El cargador de hoy',
        // The calendar action disappears while its sheet is open: a second tap
        // would open a second sheet on top of the first.
        actions: calendarOpen ? [ACTION.share] : [ACTION.calendar, ACTION.share],
      };
    case 'historial':
      return { subtitle: 'Historial', actions: [ACTION.calendar] };
    case 'analisis':
      // The screen owns its action (the round button under the number), so the
      // native main button stays hidden instead of offering a second one.
      return { subtitle: 'Análisis', main: null };
    case 'mas':
      return isLinked()
        ? { subtitle: `@${getSession().username ?? 'usuario'}` }
        : { subtitle: 'Herramientas', actions: [ACTION.user] };
    case 'adivinanza':
      return { subtitle: 'La adivinanza', actions: [ACTION.share] };
    case 'sueno':
      // Same as the analyser: the screen owns its action (the button under the
      // field), so the native main button stays hidden instead of doubling it.
      return { subtitle: 'Cuéntame tu sueño', main: null };
    case 'cultura':
      return { subtitle: context.titulo ?? 'Historia y cultura', actions: [ACTION.search] };
    case 'significados':
      return context.ficha
        ? { subtitle: context.ficha, actions: [ACTION.share] }
        : { subtitle: 'Los 100 significados', actions: [ACTION.search] };
    case 'article':
      return { subtitle: context.title ?? 'Historia y cultura', actions: [ACTION.share] };
    default:
      return { subtitle: 'El cargador de hoy' };
  }
}

/** Push the current screen's chrome to the host. Fire and forget: chrome is optional. */
function syncChrome(name, context = {}) {
  if (!sdkRef) return;
  const state = chromeFor(name, context);
  const key = JSON.stringify(state);
  if (key === chromeSent) return;
  chromeSent = key;

  setHeader(sdkRef, { subtitle: state.subtitle ?? '', actions: state.actions ?? [] }).catch(() => {});
  applyMainButton(state.main ?? null);
}

function applyMainButton(cfg) {
  if (!sdkRef) return;
  if (cfg) setMainButton(sdkRef, { text: cfg.text, visible: true, enabled: cfg.enabled ?? true }).catch(() => {});
  else setMainButton(sdkRef, { text: '', visible: false }).catch(() => {});
}

const HEADER_ACTIONS = {
  calendar: () => openDatePicker(),
  search: () => focusSearch(),
  share: () => shareCurrentScreen(),
  user: () => startLink(),
};

/** Focus the search field of the screen that has one (cultura or significados). */
function focusSearch() {
  const input = view.querySelector('.glossary__search');
  if (!input) return;
  // On the significados list the field is hidden until it is asked for: the
  // header button is the only way in, which keeps the list clean.
  if (input.hasAttribute('hidden')) input.removeAttribute('hidden');
  input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  input.focus({ preventScroll: true });
}

/** Share the mini-app itself; QvaPay supplies the public link. */
async function shareMiniApp() {
  if (!sdkRef) return;
  try {
    await share(sdkRef, { text: 'La charada cubana: el cargador de cada día, su historia y sus 100 significados.' });
  } catch (err) {
    const info = describeSdkError(err);
    if (!info.silent) toast(sdkRef, info.message, { type: 'error' }).catch(() => {});
  }
}

/** Leave the WebView for an external link. */
async function openExternal(href) {
  if (!sdkRef) {
    // Outside QvaPay there is no host to hand the link to: a plain navigation is
    // what the same click does in any browser.
    location.href = href;
    return true;
  }
  const opened = await openLink(sdkRef, href).catch(() => false);
  if (!opened) toast(sdkRef, 'No se pudo abrir el enlace.', { type: 'error' }).catch(() => {});
  return opened;
}

/** Inside QvaPay there is no `target=_blank`: links leave through the host. */
function wireExternalLinks() {
  document.addEventListener('click', (evt) => {
    const node = evt.target instanceof Element ? evt.target : null;
    const link = node?.closest('.prose a[data-external]');
    if (!link || !sdkRef) return;
    evt.preventDefault();
    openExternal(link.href);
  });
}

function wireHostEvents(sdk) {
  if (typeof sdk?.on !== 'function') return;
  sdk.on('headerAction', ({ id } = {}) => {
    const run = HEADER_ACTIONS[id];
    if (run) run();
  });
  sdk.on('mainButton', () => {
    if (currentView === 'analisis' && !analysisData) runAnalysis();
  });
}

/**
 * Keep --tabbar-real equal to the bar that is actually on screen.
 *
 * The analyser's action bar sits above the tab bar using a CSS constant. On a
 * device whose bar is taller than that constant — safe-area insets, larger text —
 * the button ended up tucked behind the bar. Measuring removes the guess; the
 * stylesheet falls back to the constant until the first measurement lands.
 */
function watchTabbarHeight() {
  const bar = document.querySelector('.tabbar');
  if (!bar) return;

  const measure = () => {
    const height = Math.round(bar.getBoundingClientRect().height);
    if (height > 0) document.documentElement.style.setProperty('--tabbar-real', `${height}px`);
  };

  measure();
  window.addEventListener('resize', measure, { passive: true });
  window.addEventListener('orientationchange', measure, { passive: true });
}

// ---------- History ----------
//
// QvaPay's back button walks the browser history, so navigation has to write
// history. Every screen and every in-view step (an article) is an entry (S15).
//
// A sheet is a step too (S16). The calendar and the message sheets push their own
// entry when they open, so back closes them instead of leaving the screen behind
// them; a sheet dismissed by its own controls takes that entry back off, so what
// is stored and what is on screen never disagree.

/** Open sheets, oldest first. The last one is what back closes. */
const overlays = [];

/** Set while we walk back ourselves, so the popstate we caused is not re-handled. */
let ignoringPop = false;

function openOverlay(name, close) {
  if (overlays.some((overlay) => overlay.name === name)) return;
  overlays.push({ name, close });
  history.pushState({ ...(history.state ?? {}), overlay: name }, '', location.href);
}

/** Remove a sheet from the stack, or undefined when it was already gone. */
function takeOverlay(name) {
  const index = overlays.findIndex((overlay) => overlay.name === name);
  if (index === -1) return undefined;
  return overlays.splice(index, 1)[0];
}

/**
 * Reconcile a sheet that closed itself (its own button, the backdrop, Escape).
 *
 * Called from the sheet's `onClose`. When the close came from us the sheet is
 * already off the stack and this is a no-op, which is what keeps the two paths
 * from fighting over history.
 */
function releaseOverlayEntry(name) {
  if (!takeOverlay(name)) return;
  if (history.state?.overlay !== name) return;
  ignoringPop = true;
  history.back();
}

/** Close from the screen's controls: the entry goes away with the sheet. */
function closeOverlay(name) {
  const overlay = takeOverlay(name);
  if (!overlay) return;
  overlay.close();
  if (history.state?.overlay === name) {
    ignoringPop = true;
    history.back();
  }
}

/**
 * Close while something else takes over — a navigation, another sheet.
 *
 * The entry is neutralised in place instead of walked back: a `history.back()`
 * in flight would land after the push that follows and undo it.
 */
function settleOverlay(name) {
  const overlay = takeOverlay(name);
  if (!overlay) return;
  overlay.close();
  if (history.state?.overlay === name) {
    const { overlay: _dropped, ...rest } = history.state;
    history.replaceState(rest, '', location.href);
  }
}


/** True when the page runs inside the QvaPay WebView, which draws its own bar. */
function isHosted() {
  return document.body.classList.contains('is-hosted');
}

function pushView(name, extra = {}) {
  const params = new URLSearchParams();
  if (name !== 'tiros') params.set('vista', name);
  if (extra.article) params.set('articulo', extra.article);
  if (extra.numero) params.set('numero', extra.numero);
  if (extra.glosario) params.set('glosario', '1');
  if (extra.fecha) params.set('fecha', extra.fecha);
  const qs = params.toString();
  history.pushState({ view: name, ...extra }, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
}

function wireHistory() {
  window.addEventListener('popstate', (evt) => {
    // Our own walk back for a dismissed sheet: nothing to render.
    if (ignoringPop) {
      ignoringPop = false;
      return;
    }

    // Back is the way out of a sheet, and only of a sheet, while one is open.
    const overlay = overlays.pop();
    if (overlay) {
      overlay.close();
      return;
    }

    const state = evt.state ?? {};

    // Back out of a finished analysis shows the input again, not the same result.
    if (state.view === 'analisis' && !state.resultado) analysisData = null;

    if (state.article) {
      openArticle(state.article, { push: false });
      return;
    }
    if (state.numero) {
      openFicha(state.numero, { push: false });
      return;
    }
    if (state.glosario) {
      openGlossary({ push: false });
      return;
    }
    navigate(state.view ?? initialView(), { push: false });
  });
}

/** A reload while reading must land on the article, not on the index. */
async function openBootArticle() {
  const params = new URLSearchParams(location.search);

  const id = params.get('articulo');
  if (id) {
    history.replaceState({ view: 'cultura', article: id }, '', location.href);
    await openArticle(id, { push: false });
    return;
  }

  if (params.get('glosario')) {
    history.replaceState({ view: 'cultura', glosario: true }, '', location.href);
    await openGlossary({ push: false });
  }
}

/** Same for a ficha of the charada table. */
async function openBootFicha() {
  const raw = new URLSearchParams(location.search).get('numero');
  const number = Number(raw);
  if (!Number.isInteger(number) || number < 1 || number > 100) return;
  history.replaceState({ view: 'significados', numero: number }, '', location.href);
  await openFicha(number, { push: false });
}

async function navigate(name, { push = true, extra = {} } = {}) {
  clearCountdown();
  currentView = name;
  doc_body_class_toggle('is-analyser', name === 'analisis');
  if (name !== 'historial') {
    historialDays = null;
    historialList = null;
  }
  for (const btn of tabbar.children) {
    const active = btn.dataset.view === name;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  }
  if (push) pushView(name, extra);
  // Chrome first: the bar and the main button must follow the tap, not the
  // network. The second call after the view renders corrects anything the
  // screen only knows once its data (or its session) is loaded; the dedupe in
  // `syncChrome` keeps the unchanged case from sending twice.
  syncChrome(name);
  try {
    await (VIEWS[name] ?? viewTiros)();
    syncChrome(name);
  } catch (err) {
    setState(err.message, true);
  }
}

function wireTabbar() {
  attachRipples(document);
  tabbar.addEventListener('click', (evt) => {
    const btn = evt.target.closest('[data-view]');
    if (!btn) return;
    haptic(sdkRef, 'light').catch(() => {});
    navigate(btn.dataset.view);
  });
}

// ---------- Boot ----------

async function start(sdk) {
  sdkRef = sdk;
  // Inside QvaPay the host draws the bar and names the screen, so the page must
  // not repeat the title. In a plain browser it does (see `isHosted`).
  document.body.classList.add('is-hosted');
  splashTimer = setTimeout(hideSplash, SPLASH_MAX_MS);
  const caps = capabilities(sdk);

  const cleanupTheme = await applyTheme(sdk, document);
  window.addEventListener('pagehide', cleanupTheme, { once: true });

  // Mark the page as hosted so the local bar steps aside; the per-screen
  // subtitle and actions arrive with the first `syncChrome` below.
  if (caps.header) await configureHeader(sdk, {}).catch(() => {});
  setColors(sdk, BRAND).catch(() => {});
  wireHostEvents(sdk);
  if (caps.present) await sdk.ready().catch(() => {});

  restoreSession();
  wireTabbar();
  wireHistory();
  wireExternalLinks();
  watchTabbarHeight();
  const boot = initialView();
  history.replaceState({ view: boot }, '', location.href);
  await navigate(boot, { push: false });
  await openBootArticle();
  await openBootFicha();
  hideSplash();
}

function bootWithoutSdk() {
  restoreSession();
  wireTabbar();
  wireHistory();
  wireExternalLinks();
  watchTabbarHeight();
  // Hide as soon as the view has content, and fail open if it never does.
  splashTimer = setTimeout(hideSplash, SPLASH_MAX_MS);
  const boot = initialView();
  history.replaceState({ view: boot }, '', location.href);
  Promise.resolve(navigate(boot, { push: false }))
    .then(openBootArticle)
    .then(openBootFicha)
    .finally(hideSplash);
}

if (getQvaPay()) {
  start(getQvaPay());
} else {
  whenReady(start);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootWithoutSdk, { once: true });
  } else {
    bootWithoutSdk();
  }
}
