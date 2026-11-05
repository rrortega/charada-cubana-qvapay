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
import { loadSession, getSession, linkAccount, restoreSession, isLinked } from '/src/ui/session.js';

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

async function getJson(path) {
  const res = await fetch(path, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`No se pudo cargar (${res.status})`);
  return res.json();
}

// ---------- Card pieces (shared by both screens) ----------

function panelFijo(draw) {
  const panel = el('section', 'panel');
  panel.append(el('h2', 'panel__title', 'Fijo'));
  const row = el('div', 'fijo');
  // Each digit starts at 0 and rolls up; the targets are the real digits.
  const digits = [];
  draw.fijo.digits.forEach((digit, i) => {
    const node = el('span', `fijo__digit fijo__digit--${i === 0 ? 'lead' : 'rest'}`, '');
    digits.push({ element: node, text: String(digit) });
    row.append(node);
  });
  panel.append(row);
  if (draw.fijo.significado) panel.append(el('p', 'fijo__meaning', draw.fijo.significado));
  panel._digits = digits;
  return panel;
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
  const range = await getJson('/api/rango').catch(() => null);
  if (!range?.to) return;
  const initial = /^\d{4}-\d{2}-\d{2}$/.test(currentDate ?? '') ? currentDate : range.to;
  openCalendar({
    value: initial,
    min: range.from,
    max: range.to,
    onSelect: (iso) => {
      currentDate = iso;
      navigate('tiros');
    },
  });
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

/** The element that animates between "input" and "result" states. */
function buildNumberNode() {
  const wrap = el('div', 'ananum');

  const input = el('input', 'ananum__input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.maxLength = 2;
  input.placeholder = '00';
  input.setAttribute('aria-label', 'Número a analizar');
  if (analysisNumber !== null) input.value = String(analysisNumber);

  // Digits only: strip anything else as it is typed or pasted.
  input.addEventListener('input', () => {
    const clean = input.value.replace(/\D/g, '').slice(0, 2);
    if (clean !== input.value) input.value = clean;
    analysisNumber = clean === '' ? null : Number(clean);
    const btn = document.getElementById('analyser-btn');
    if (btn) btn.disabled = analysisNumber === null;
    // The native main button mirrors the same enablement.
    if (currentView === 'analisis') syncChrome('analisis');
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

  label.textContent = analysisNumber === null ? '00' : String(analysisNumber).padStart(2, '0');
  input.value = analysisNumber === null ? '' : String(analysisNumber);

  const frag = document.createDocumentFragment();

  const hint = el('p', 'analyser__hint', 'Escribe un número del 0 al 99');
  const stage = el('div', 'analyser');
  stage.append(hint, wrap);
  frag.append(stage);

  // Fixed action bar, sitting just above the bottom menu.
  const bar = el('div', 'actionbar');
  const btn = el('button', 'actionbar__btn ripple ripple--on-accent', 'Analizar');
  btn.id = 'analyser-btn';
  btn.disabled = analysisNumber === null;
  btn.addEventListener('click', runAnalysis);
  bar.append(btn);
  frag.append(bar);

  view.replaceChildren(frag);
  doc_body_class_toggle('is-analyser', true);
  document.body.classList.remove('is-analysing');
  if (focus) requestAnimationFrame(() => input.focus?.());
}

function doc_body_class_toggle(name, on) {
  document.body.classList.toggle(name, on);
}

async function runAnalysis() {
  if (analysisNumber === null) return;

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
    analysisData = data;
    renderAnalysisResult(data);
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
}

/** Horizontal bar row used by the weekday/month breakdown. */
function barRow(label, hits, total, { highlight = false } = {}) {
  const row = el('div', `bar${highlight ? ' bar--hot' : ''}`);
  row.append(el('span', 'bar__label', label));
  const track = el('div', 'bar__track');
  const fill = el('div', 'bar__fill');
  const max = total || 1;
  fill.style.width = `${Math.max(2, (hits / max) * 100)}%`;
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

function renderAnalysisResult(a) {
  const frag = document.createDocumentFragment();

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
    blurb: 'Graba o escribe lo que soñaste y te lo interpretamos en clave de charada.',
    icon: 'moon',
    needsAccount: true,
    status: 'soon',
  },
  {
    id: 'adivinanza',
    title: 'La adivinanza',
    blurb: 'Cada día, un dicharacho con doble sentido armado con las combinaciones del día.',
    icon: 'sun',
    needsAccount: true,
    status: 'soon',
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

  const grid = el('div', 'toolgrid');
  for (const tool of MORE_TOOLS) {
    const card = el('button', 'toolcard ripple');
    card.type = 'button';
    card.append(toolIcon(tool.icon));

    const body = el('span', 'toolcard__body');
    body.append(el('span', 'toolcard__title', tool.title));
    body.append(el('span', 'toolcard__blurb', tool.blurb));
    card.append(body);

    if (tool.status === 'soon') card.append(el('span', 'toolcard__tag', 'Próximamente'));

    card.addEventListener('click', () => openTool(tool));
    grid.append(card);
  }
  frag.append(grid);
  view.replaceChildren(frag);
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
function sheetMessage({ title, body, action, onAction }) {
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
    go.addEventListener('click', () => { close(); onAction?.(); });
    actions.append(go);
  }
  const cancel = el('button', 'sheetmsg__cancel ripple', action ? 'Ahora no' : 'Entendido');
  cancel.addEventListener('click', close);
  actions.append(cancel);

  sheet.append(grab, h, p, actions);
  overlay.append(sheet);
  overlay.addEventListener('click', (evt) => { if (evt.target === overlay) close(); });
  document.body.append(overlay);
}


// ---------- Cultura ----------
//
// The index is a grid of tiles, one per article (S13). Each article is rendered
// from the Markdown that the server already converted to HTML (S12), so the
// client never parses Markdown and never builds prose by hand.

let cultureIndex = null;

async function viewCultura() {
  renderSkeleton(4);
  if (!cultureIndex) cultureIndex = await getJson('/api/cultura');
  renderCultureIndex(cultureIndex);
}

/** One tile: artwork slot on top, kicker, title, teaser and reading time. */
function cultureTile(article, position) {
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
    art.append(el('span', 'culturetile__mark', String(position + 1).padStart(2, '0')));
  }

  const body = el('span', 'culturetile__body');
  body.append(el('span', 'culturetile__kicker', article.kicker));
  body.append(el('span', 'culturetile__title', article.title));
  if (article.pull) body.append(el('span', 'culturetile__pull', article.pull));
  if (article.readMinutes) body.append(el('span', 'culturetile__meta', `${article.readMinutes} min`));

  tile.append(art, body);
  tile.setAttribute('aria-label', `${article.title} — ${article.readMinutes ?? 0} minutos de lectura`);
  tile.addEventListener('click', () => openArticle(article.id));
  return tile;
}

function renderCultureIndex(data) {
  const frag = document.createDocumentFragment();

  const head = el('div', 'morehead');
  head.append(el('h2', 'panel__title', 'Historia y cultura'));
  head.append(el('p', 'morehead__who', 'Cómo llegó la charada a Cuba y por qué sigue viva.'));
  frag.append(head);

  const grid = el('div', 'culturegrid');
  data.articles.forEach((article, i) => grid.append(cultureTile(article, i)));
  frag.append(grid);

  frag.append(glossaryBlock(data.glossary));
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
  const article = await getJson(`/api/cultura?id=${encodeURIComponent(id)}`);
  const frag = document.createDocumentFragment();

  const back = el('button', 'backlink ripple', '‹ Historia y cultura');
  back.type = 'button';
  back.addEventListener('click', closeArticle);
  frag.append(back);

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
// The 100 entries with their sprite icon. Each icon is a 180x180 tile cut from
// an 1800x900 sheet with background-position, so the whole list is two images.

let meaningsIndex = null;

/**
 * Rendered size of one sprite tile.
 * Sheet 1770x885 / 10x5 = 177px source tiles; displayed at 46px, so the step
 * between tiles is 46px (1770 * 46/177 = 460 wide, 885 * 46/177 = 230 tall).
 */
const TILE_PX = 46;

async function viewSignificados() {
  renderSkeleton(6);
  if (!meaningsIndex) meaningsIndex = await getJson('/api/significados');

  const frag = document.createDocumentFragment();

  const head = el('div', 'morehead');
  head.append(el('h2', 'panel__title', 'Los 100 significados'));
  head.append(el('p', 'morehead__who', 'La tabla de la charada cubana, del 1 al 100.'));

  const search = el('input', 'glossary__search');
  search.type = 'search';
  search.placeholder = 'Buscar número o símbolo…';
  search.setAttribute('aria-label', 'Buscar en los significados');
  head.append(search);
  frag.append(head);

  const list = el('div', 'signlist');
  frag.append(list);

  const draw = (query) => {
    const q = query.trim().toLowerCase();
    const items = meaningsIndex.items.filter((x) =>
      q === '' || String(x.number) === q || String(x.number).startsWith(q) || x.meaning.toLowerCase().includes(q));

    list.replaceChildren(...items.map((x) => {
      const row = el('div', 'signrow');

      // Sprite icon: one element, two background values.
      //
      // Positions must be in RENDERED pixels, not source pixels. The sheet is
      // scaled from 1800x900 to 440x220, so one 180px tile becomes 44px:
      // offset = col * tileSize, not col * 180.
      const icon = el('span', 'signrow__icon');
      icon.style.backgroundImage = `url('${x.sheet}')`;
      icon.style.backgroundPosition = `-${x.col * TILE_PX}px -${x.row * TILE_PX}px`;
      icon.setAttribute('role', 'img');
      icon.setAttribute('aria-label', x.meaning);
      row.append(icon);

      // The tile is a split rectangle: symbol on one half, number on the other.
      const tile = el('span', 'signtile');
      tile.append(el('span', 'signtile__num', String(x.number)));
      tile.append(icon);
      row.append(tile);

      // The meaning stays outside the tile, as plain text.
      row.append(el('span', 'signrow__meaning', x.meaning));
      return row;
    }));

    if (items.length === 0) list.append(el('p', 'state', 'Sin resultados.'));
  };

  search.addEventListener('input', () => draw(search.value));
  draw('');
  view.replaceChildren(frag);
}

// ---------- Router ----------

const VIEWS = {
  tiros: viewTiros,
  analisis: viewAnalisis,
  historial: viewHistorial,
  mas: viewMas,
  cultura: viewCultura,
  significados: viewSignificados,
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
      return { subtitle: 'El cargador de hoy', actions: [ACTION.calendar, ACTION.share] };
    case 'historial':
      return { subtitle: 'Historial', actions: [ACTION.calendar] };
    case 'analisis':
      return {
        subtitle: 'Análisis',
        main: analysisData ? null : { text: 'Analizar', enabled: analysisNumber !== null },
      };
    case 'mas':
      return isLinked()
        ? { subtitle: `@${getSession().username ?? 'usuario'}` }
        : { subtitle: 'Herramientas', actions: [ACTION.user] };
    case 'cultura':
      return { subtitle: 'Historia y cultura', actions: [ACTION.search] };
    case 'significados':
      return { subtitle: 'Los 100 significados', actions: [ACTION.search] };
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
  share: () => shareMiniApp(),
  user: () => startLink(),
};

/** Focus the search field of the screen that has one (cultura or significados). */
function focusSearch() {
  const input = view.querySelector('.glossary__search');
  if (!input) return;
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

/** Leave the WebView for an external article link. */
async function openExternal(href) {
  if (!sdkRef) return false;
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

// ---------- History ----------
//
// QvaPay's back button walks the browser history, so navigation has to write
// history. Every screen and every in-view step (an article) is an entry (S15).

function pushView(name, extra = {}) {
  const params = new URLSearchParams();
  if (name !== 'tiros') params.set('vista', name);
  if (extra.article) params.set('articulo', extra.article);
  const qs = params.toString();
  history.pushState({ view: name, ...extra }, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
}

function wireHistory() {
  window.addEventListener('popstate', (evt) => {
    const state = evt.state ?? {};
    if (state.article) {
      openArticle(state.article, { push: false });
      return;
    }
    navigate(state.view ?? initialView(), { push: false });
  });
}

/** A reload while reading must land on the article, not on the index. */
async function openBootArticle() {
  const id = new URLSearchParams(location.search).get('articulo');
  if (!id) return;
  history.replaceState({ view: 'cultura', article: id }, '', location.href);
  await openArticle(id, { push: false });
}

async function navigate(name, { push = true } = {}) {
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
  if (push) pushView(name);
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
  const boot = initialView();
  history.replaceState({ view: boot }, '', location.href);
  await navigate(boot, { push: false });
  await openBootArticle();
  hideSplash();
}

function bootWithoutSdk() {
  restoreSession();
  wireTabbar();
  wireHistory();
  wireExternalLinks();
  // Hide as soon as the view has content, and fail open if it never does.
  splashTimer = setTimeout(hideSplash, SPLASH_MAX_MS);
  const boot = initialView();
  history.replaceState({ view: boot }, '', location.href);
  Promise.resolve(navigate(boot, { push: false })).then(openBootArticle).finally(hideSplash);
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
