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
const CUR = { peso: ['Pesos', '$'], usd: ['Dólares', 'US$'] };
let cur = 'peso'; // apartado que se está viendo
const symbol = (k = cur) => CUR[k][1];
const money = (c, k = cur) => (c < 0 ? '−' : '') + symbol(k) + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
const asInput = (c) => c === undefined || c === null ? '' : String(c / 100);
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const toDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
const monthName = (m) => cap(toDate(m).toLocaleDateString('es', { month: 'long', year: 'numeric' }));
const monthShort = (m) => cap(toDate(m).toLocaleDateString('es', { month: 'short' }).replace('.', ''));
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

const empty = (text) => el('p', { className: 'empty', textContent: text });
const section = (title, action, onclick) => el('div', { className: 'section' }, el('h2', { textContent: title }),
  action ? el('button', { className: 'link', textContent: action, onclick }) : null);
const button = (textContent, onclick, className = 'wide') => el('button', { type: 'button', className, textContent, onclick });

let toastTimer;
function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3200);
}

let shown = 0;
function countUp(node, to) {
  const from = shown, start = performance.now();
  shown = to;
  node.textContent = money(from === to ? to : from);
  if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { node.textContent = money(to); return; }
  const step = (now) => {
    const p = Math.min(1, (now - start) / 650);
    node.textContent = money(p === 1 ? to : Math.round((from + (to - from) * (1 - (1 - p) ** 3)) / 100) * 100);
    if (p < 1 && node.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

let closing = null;
function closeSheet() {
  const d = $('sheet');
  if (!d.open) return Promise.resolve();
  closing ||= new Promise((done) => {
    d.classList.add('closing');
    setTimeout(() => { d.close(); d.classList.remove('closing'); closing = null; done(); }, 200);
  });
  return closing;
}

/* Formulario único para toda la app.
   fields: {key, label, type: seg|money|text|date|select|chips|icons|colors|pin, options, show(values)}
   options puede ser una lista [[valor, texto, icono, color]] o una función(values).
   onSave(values) devuelve un texto de error, o nada si todo salió bien. */
function openForm({ title, fields, values = {}, save = 'Guardar', onSave, onDelete, deleteText = 'Borrar', actions = [] }) {
  if ($('sheet').open) return;
  const form = $('form'), v = { ...values }, parts = [];
  const error = el('p', { className: 'error', role: 'alert' });

  function draw() {
    for (const { field, wrap, control } of parts) {
      wrap.hidden = field.show ? !field.show(v) : false;
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
        const b = el('button', { type: 'button', ariaPressed: String(v[field.key] === value), onclick: () => { v[field.key] = value; draw(); } });
        if (field.type === 'seg') b.textContent = text;
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
    if (['money', 'text', 'date', 'pin'].includes(type)) {
      control = el('input', {
        type: type === 'date' ? 'date' : type === 'pin' ? 'password' : 'text',
        inputMode: type === 'money' ? 'decimal' : type === 'pin' ? 'numeric' : 'text',
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
      control = el('div', { className: type === 'seg' ? 'seg' : 'chips' });
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
    if (problem) error.textContent = problem; else await closeSheet();
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

  $('sheet').ariaLabel = title;
  form.replaceChildren(el('h2', { textContent: title }), ...parts.map((p) => p.wrap), error,
    el('button', { className: 'primary', textContent: save }),
    ...actions.map(([text, run]) => button(text, async () => { await closeSheet(); run(); })),
    ...(del ? [del] : []), button('Cancelar', closeSheet, ''));
  draw();
  $('sheet').showModal();
  $('sheet').scrollTop = 0;
}
