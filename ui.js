// Piezas de interfaz compartidas.
const L = window.Logic;
const plugins = window.Capacitor?.isNativePlatform() ? window.Capacitor.Plugins : null;
const $ = (id) => document.getElementById(id);

// Preferences en el teléfono; localStorage al probar en el navegador.
const store = {
  get: async (key) => plugins ? (await plugins.Preferences.get({ key })).value : localStorage.getItem(key),
  set: async (key, value) => plugins ? plugins.Preferences.set({ key, value }) : localStorage.setItem(key, value),
  remove: async (key) => plugins ? plugins.Preferences.remove({ key }) : localStorage.removeItem(key),
};

function el(tag, props = {}, ...kids) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids.filter((k) => k !== null && k !== false && k !== undefined));
  return node;
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const CUR = { peso: ['Pesos', '$'], usd: ['Dólares', 'US$'], eur: ['Euros', '€'] };
let cur = 'peso'; // apartado que se está viendo
const symbol = (k = cur) => CUR[k][1];
let prefs = L.prefs(null);
function applyPrefs() {
  const root = document.documentElement;
  root.style.setProperty('--lime', prefs.accent);
  root.style.setProperty('--zoom', prefs.size);
  root.dataset.theme = prefs.theme;
  root.classList.toggle('calm', !prefs.motion);
}
const buzz = () => { if (plugins) try { navigator.vibrate?.(8); } catch { /* sin vibración */ } };
const calm = () => !prefs.motion || matchMedia('(prefers-reduced-motion: reduce)').matches;
async function savePrefs(change) {
  Object.assign(prefs, change);
  applyPrefs();
  try { await store.set('prefs', JSON.stringify(prefs)); } catch (e) { console.warn(e.message); }
}
const money = (c, k = cur) => prefs.hidden ? `${symbol(k)}••••` : (c < 0 ? '−' : '') + symbol(k) + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
const asInput = (c) => c === undefined || c === null ? '' : String(c / 100);
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const toDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
const monthName = (m) => cap(toDate(m).toLocaleDateString('es', { month: 'long', year: 'numeric' }));
const monthShort = (m) => cap(toDate(m).toLocaleDateString('es', { month: 'short' }).replace('.', '').slice(0, 3));
const longDay = (d) => d === L.today() ? 'Hoy' : d === L.today(new Date(Date.now() - 864e5)) ? 'Ayer'
  : cap(toDate(d).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', ...(d.slice(0, 4) !== L.today().slice(0, 4) && { year: 'numeric' }) }));
const dayName = (d) => d === L.today() ? 'Hoy' : toDate(d).toLocaleDateString('es', { day: 'numeric', month: 'short', ...(d.slice(0, 4) !== L.today().slice(0, 4) && { year: 'numeric' }) });

const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6',
  food: 'M7 3v8M4 3v5a3 3 0 006 0V3M7 11v10M18 3c-3 2-4 6-3 10h3M18 3v18',
  car: 'M4 16v-4l2-5h12l2 5v4zM4 12h16M7 16v3M17 16v3',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  shirt: 'M8 3L3 7l3 4 2-1v11h8V10l2 1 3-4-5-4a4 4 0 01-8 0z',
  heart: 'M12 20S3 14 3 8.5A4.5 4.5 0 0112 6a4.5 4.5 0 019 2.500C21 14 12 20 12 20z',
  game: 'M6 8h12a4 4 0 014 4v2a3 3 0 01-5.500 2L15 15H9l-1.500 1A3 3 0 012 14v-2a4 4 0 014-4zM8 10v4M6 12h4M16 12h.01',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4',
  cash: 'M3 7h18v10H3zM12 9.500a2.500 2.500 0 100 5 2.500 2.500 0 000-5zM6 12h.01M18 12h.01',
  work: 'M4 8h16v12H4zM9 8V5h6v3M4 13h16',
  cart: 'M3 4h3l2 11h10l2-8H7M10 19h.01M17 19h.01',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  gift: 'M4 11h16v10H4zM3 7h18v4H3zM12 7v14M12 7S10 3 8 4s0 3 4 3zm0 0s2-4 4-3 0 3-4 3z',
  book: 'M5 4h13v16H7a2 2 0 01-2-2zM5 18a2 2 0 012-2h11',
  paw: 'M7 10h.01M11 7h.01M15 7h.01M18 11h.01M8 18c0-3 2-5 4.500-5s4.500 2 4.500 5c0 2-2 2-4.500 1-2.500 1-4.500 1-4.500-1z',
  phone: 'M7 3h10v18H7zM11 18h2',
  plane: 'M10 3l2 0 2 7 7 3v2l-7-1-1 5 2 2H9l2-2-1-5-7 1v-2l7-3z',
  bank: 'M3 9l9-6 9 6zM5 10v8M10 10v8M14 10v8M19 10v8M3 21h18',
  gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  swap: 'M4 8h15l-4-4M20 16H5l4 4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  eyeoff: 'M3 3l18 18M10 5.500C17 4 22 12 22 12a17 17 0 01-3 3.500M6 7a17 17 0 00-4 5s4 7 10 7a10 10 0 004-1',
  plus: 'M12 5v14M5 12h14',
  bell: 'M6 16V11a6 6 0 0112 0v5l2 2H4zM10 21h4',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 018 0v3',
  face: 'M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3M9 10h.01M15 10h.01M9.500 15a3.500 3.500 0 005 0',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6',
  help: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.500 9a2.500 2.500 0 015 0c0 2-2.500 2-2.500 4M12 17h.01',
  sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.500 1.500M17.500 17.500L19 19M19 5l-1.500 1.500M6.500 17.500L5 19',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  coins: 'M12 4a7 3 0 100 6 7 3 0 100-6zM5 7v5c0 1.700 3.100 3 7 3s7-1.300 7-3V7M5 12v5c0 1.700 3.100 3 7 3s7-1.300 7-3v-5',
  hand: 'M7 11V5a1.500 1.500 0 013 0v5M10 10V4a1.500 1.500 0 013 0v6M13 10V5a1.500 1.500 0 013 0v7M16 12V8a1.500 1.500 0 013 0v6a7 7 0 01-7 7h-1a7 7 0 01-5-2l-3-4a1.500 1.500 0 012-2l2 2',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  chart: 'M4 20h16M7 20v-8M12 20V4M17 20v-12',
  target: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8zM12 12h.01',
};

function svgEl(tag, attrs) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}
function icon(name, size = 22) {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
  svg.append(svgEl('path', { d: ICONS[name] || ICONS.dots }));
  return svg;
}
function badge(name, color) {
  const b = el('span', { className: 'badge' }, icon(name));
  b.style.setProperty('--c', color);
  return b;
}

function line({ lead, title, sub, value, valueClass = '', onclick }) {
  return el(onclick ? 'button' : 'div', { className: 'row', ...(onclick && { type: 'button', onclick }) },
    lead, el('span', { className: 'mid' }, title, sub ? el('small', { textContent: sub }) : null),
    value !== undefined ? el('b', { className: valueClass, textContent: value }) : null);
}

function track(ratio, color) {
  const fill = el('i');
  fill.style.cssText = `width:${Math.max(0, Math.min(1, ratio)) * 100}%;background:${color}`;
  return el('div', { className: 'track' }, fill);
}

const empty = (text) => el('div', { className: 'empty' }, el('span', { className: 'eicon' }, icon('dots', 20)), el('p', { textContent: text }));
const section = (title, action, onclick) => el('div', { className: 'section' }, el('h2', { textContent: title }),
  action ? el('button', { className: 'link', textContent: action, onclick }) : null);
const button = (textContent, onclick, className = 'wide') => el('button', { type: 'button', className, textContent, onclick });

let toastTimer;
function toast(text, undo) {
  const box = $('toast');
  box.replaceChildren(el('span', { textContent: text }));
  if (undo) box.append(button('Deshacer', () => { box.classList.remove('show', 'act'); undo(); }, 'undo'));
  box.classList.add('show');
  box.classList.toggle('act', Boolean(undo));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show', 'act'), undo ? 6000 : 3200);
}

let shown = 0, instant = false; // instant: dibujar cifras sin contar
function countUp(node, to) {
  const from = shown, start = performance.now();
  shown = to;
  node.textContent = money(from === to ? to : from);
  if (instant || from === to || calm()) { node.textContent = money(to); return; }
  const step = (now) => {
    const p = Math.min(1, (now - start) / 650);
    node.textContent = money(p === 1 ? to : Math.round((from + (to - from) * (1 - (1 - p) ** 3)) / 100) * 100);
    if (p < 1 && node.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

let closing = null;
// from: cuántos px ya se arrastró hacia abajo (también llega un evento si se usa como onclick).
function closeSheet(from = 0) {
  const d = $('sheet');
  if (!d.open) return Promise.resolve();
  const dragged = typeof from === 'number' ? from : 0;
  closing ||= new Promise((done) => {
    const end = () => { d.close(); d.classList.remove('closing'); d.style.transform = ''; closing = null; done(); };
    if (dragged) {
      const a = d.animate([{ transform: `translateY(${dragged}px)` }, { transform: 'translateY(100%)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
      setTimeout(() => { end(); a.cancel(); }, 180);
      return;
    }
    d.classList.add('closing');
    setTimeout(end, 200);
  });
  return closing;
}

$('close').onclick = () => closeSheet();

// Tocar la zona oscura de fuera cierra la hoja o la foto, como Cancelar.
for (const box of [$('sheet'), $('viewer')]) {
  box.addEventListener('click', (e) => {
    const r = box.getBoundingClientRect();
    const outside = e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right;
    if (e.target === box && outside) { if (box === $('sheet')) closeSheet(); else box.close(); }
  });
}

// Arrastrar la hoja desde arriba la cierra.
(() => {
  const d = $('sheet');
  let start = null, dy = 0;
  d.addEventListener('touchstart', (e) => {
    const y = e.touches[0].clientY, fromTop = y - d.getBoundingClientRect().top;
    start = d.scrollTop <= 0 && fromTop < 56 && !e.target.closest('input, select') ? y : null;
    dy = 0;
  }, { passive: true });
  d.addEventListener('touchmove', (e) => {
    if (start === null) return;
    dy = Math.max(0, e.touches[0].clientY - start);
    d.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  const finish = () => {
    if (start === null) return;
    start = null;
    if (dy > 110) { closeSheet(dy); return; }
    if (dy) d.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    d.style.transform = '';
  };
  d.addEventListener('touchend', finish, { passive: true });
  d.addEventListener('touchcancel', finish, { passive: true });
})();

/* Formulario único para toda la app.
   fields: {key, label, type: seg|money|text|date|select|chips|pills|icons|colors|pin, options, show(values)}
   more: true esconde el campo tras "Más opciones" (salvo que always(values)). submit: true en chips guarda al tocar.
   options puede ser una lista [[valor, texto, icono, color]] o una función(values).
   onSave(values) devuelve un texto de error, o nada si todo salió bien. */
function openForm({ title, text = [], fields, values = {}, save = 'Guardar', onSave, onDelete, deleteText = 'Borrar', actions = [], showSave, moreLabel }) {
  if ($('sheet').open) return;
  const form = $('form'), v = { ...values }, parts = [];
  const error = el('p', { className: 'error', role: 'alert' });
  let expanded = false;
  const primary = el('button', { className: 'primary', textContent: save });
  const toggle = button('', () => { expanded = !expanded; draw(); }, 'more');

  function draw() {
    primary.hidden = Boolean(showSave && !showSave(v));
    for (const { field, wrap, control } of parts) {
      const forced = Boolean(field.always?.(v));
      wrap.hidden = (field.show ? !field.show(v) : false) || (field.more && !expanded && !forced);
      if (typeof field.label === 'function') wrap.firstChild.textContent = field.label(v);
      const options = typeof field.options === 'function' ? field.options(v) : field.options;
      if (!options) continue;
      if (!options.some((o) => o[0] === v[field.key])) v[field.key] = options[0]?.[0];
      if (field.type === 'select') {
        control.replaceChildren(...options.map(([value, text]) => el('option', { value, textContent: text })));
        control.value = v[field.key];
        continue;
      }
      control.replaceChildren(...options.map(([value, text, ico, color]) => {
        const b = el('button', { type: 'button', onclick: () => {
          v[field.key] = value;
          const wait = field.wait?.(v); // falta elegir algo más antes de guardar
          draw();
          if (wait) form.querySelector('.pills')?.scrollIntoView({ block: 'nearest' });
          if (field.submit && !wait) { v.picked = true; form.requestSubmit(); }
        } });
        if (!field.submit || (field.wait && v.opened)) b.ariaPressed = String(v[field.key] === value);
        if (field.type === 'seg' || field.type === 'pills') b.textContent = text;
        else if (field.type === 'chips') b.append(badge(ico, color), text);
        else if (field.type === 'icons') { b.append(icon(value)); b.ariaLabel = text; }
        else { const dot = el('span', { className: 'badge' }); dot.style.background = value; b.append(dot); b.ariaLabel = text; }
        return b;
      }));
    }
  }

  for (const field of fields) {
    const { key, type } = field;
    const label = typeof field.label === 'function' ? field.label(v) : field.label;
    let control, wrap;
    if (['money', 'text', 'date', 'time', 'pin'].includes(type)) {
      control = el('input', {
        type: type === 'date' || type === 'time' ? type : type === 'pin' ? 'password' : 'text',
        inputMode: field.inputMode || (type === 'money' ? 'decimal' : type === 'pin' ? 'numeric' : 'text'),
        className: type === 'money' ? 'money' : '', autocomplete: 'off', value: v[key] ?? '',
        maxLength: type === 'pin' ? 6 : 60, placeholder: field.placeholder || (type === 'money' ? '0' : ''),
        oninput: () => { v[key] = control.value; },
      });
      v[key] ??= '';
      wrap = el('label', { className: 'field' }, label, control);
    } else if (type === 'select') {
      control = el('select', { onchange: () => { v[key] = control.value; draw(); } });
      wrap = el('label', { className: 'field' }, label, control);
    } else {
      control = el('div', { className: type === 'seg' || type === 'pills' ? type : field.submit ? 'chips quick' : 'chips' });
      wrap = el('div', { className: 'field', role: 'group', ariaLabel: label }, type === 'seg' && !field.titled ? null : label, control);
    }
    parts.push({ field, wrap, control });
  }

  let busy = false;
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    const problem = await onSave({ ...v });
    if (problem) { error.textContent = problem; v.picked = false; } else await closeSheet();
    busy = false;
  };

  // Borrar pide un segundo toque.
  let del = null;
  if (onDelete) {
    del = button(deleteText, async () => {
      if (del.textContent !== 'Toca otra vez para confirmar') { del.textContent = 'Toca otra vez para confirmar'; return; }
      const problem = await onDelete({ ...v });
      if (problem) error.textContent = problem; else closeSheet();
    }, 'neg');
  }

  const nodes = parts.map((p) => p.wrap);
  const firstMore = parts.findIndex((p) => p.field.more);
  if (firstMore >= 0) nodes.splice(firstMore, 0, toggle);
  const redraw = draw;
  draw = () => {
    redraw();
    if (firstMore < 0) return;
    toggle.hidden = Boolean(parts[firstMore].field.always?.(v));
    toggle.textContent = `${moreLabel ? moreLabel(v) + ' · ' : ''}${expanded ? 'Menos opciones ▴' : 'Más opciones ▾'}`;
  };
  $('sheet').ariaLabel = title;
  $('sheet').classList.toggle('fast', Boolean(showSave));
  form.replaceChildren(el('h2', { textContent: title }), ...text.map((t) => el('p', { className: 'tip', textContent: t })), ...nodes, error, primary,
    ...actions.map(([text, run]) => button(text, async () => { await closeSheet(); run(); })),
    ...(del ? [del] : []), button('Cancelar', closeSheet, ''));
  draw();
  $('sheet').showModal();
  $('sheet').scrollTop = 0;
}
