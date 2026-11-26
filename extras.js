// Gastos frecuentes, calendario, resúmenes, avisos, fotos de recibos, guía y personalización.
const choice = (label, value, options, key, after) => el('div', { className: 'field choice', role: 'group', ariaLabel: label }, label,
  el('div', { className: 'seg' }, ...options.map(([v, text]) => el('button', { type: 'button', textContent: text, ariaPressed: String(v === value),
    onclick: async () => { await savePrefs({ [key]: v }); after?.(); render(true); } }))));

/* ---------- Gastos frecuentes ---------- */
function favoriteForm(f, from) {
  const base = f || from;
  const first = data.accounts.find((a) => a.currency === cur);
  if (!base && !first) { toast(`Primero crea una cuenta en ${CUR[cur][0].toLowerCase()}.`); accountForm(); return; }
  openForm({
    title: f ? 'Editar frecuente' : 'Nuevo frecuente',
    values: base ? { type: base.type, name: f ? f.name : base.note || category(base.category).name, amount: asInput(base.amount), account: base.account, category: base.category, sub: base.sub }
      : { type: 'out', account: first.id },
    fields: [
      { key: 'type', label: 'Tipo', type: 'seg', options: [['out', 'Gasto'], ['in', 'Entrada']] },
      { key: 'name', label: 'Nombre', type: 'text', placeholder: 'Ej. Pasaje, Almuerzo' },
      { key: 'amount', label: (v) => `Monto (${symbol(curOf(v.account))})`, type: 'money' },
      { key: 'category', label: 'Categoría', type: 'chips', options: (v) => categoryOptions(v.type) },
      subField(),
      { key: 'account', label: 'Cuenta', type: 'select', options: () => accountOptions() },
    ],
    onSave: (v) => {
      const amount = L.parseAmount(v.amount);
      if (!v.name.trim()) return 'Ponle un nombre.';
      if (!amount) return BAD_AMOUNT;
      return update((d) => upsert(d.favorites, { id: f?.id || uid(), name: v.name.trim(), type: v.type, amount, account: v.account, category: v.category, ...(v.sub && { sub: v.sub }) }), 'Frecuente guardado');
    },
    onDelete: f && drop('favorites', f.id, 'Frecuente borrado'),
  });
}

let adding = false; // evita anotar dos veces con un doble toque
async function useFavorite(f) {
  if (adding) return;
  adding = true;
  const problem = await update((d) => d.movements.push({ id: uid(), type: f.type, amount: f.amount, account: f.account, category: f.category, ...(f.sub && { sub: f.sub }), note: f.name, date: L.today() }),
    `${f.name} anotado: ${money(f.amount, curOf(f.account))}`);
  if (problem) toast(problem);
  setTimeout(() => { adding = false; }, 800);
}

homeBlocks.favorites = ['Frecuentes', (view, { here }) => {
  if (!here.favorites.length) return;
  view.append(section('Toca para anotar', 'Editar', () => go('plans')),
    el('div', { className: 'scroll' }, ...here.favorites.map((f) => { const c = category(f.category); return el('button', { className: 'tile fav', onclick: () => useFavorite(f) },
      badge(c.icon, c.color), el('span', { className: 'dim', textContent: f.name }), el('b', { textContent: (f.type === 'in' ? '+' : '−') + money(f.amount) })); })));
}];

const plansScreen = screens.plans;
screens.plans = (view) => {
  plansScreen(view);
  const rows = mine().favorites.map((f) => { const c = category(f.category); return el('div', { className: 'duo-row' },
    line({ lead: badge(c.icon, c.color), title: f.name, sub: money(f.amount), onclick: () => favoriteForm(f) }), button('Anotar', () => useFavorite(f), 'chip')); });
  view.append(section('Gastos frecuentes', rows.length ? '+ Frecuente' : '', () => favoriteForm()),
    el('div', { className: 'card' }, ...(rows.length ? rows : [empty('Guarda lo que repites, como el pasaje, y anótalo con un toque.'), button('Crear frecuente', () => favoriteForm(), 'wide add')])));
};
moveActions.push((x) => x.type !== 'transfer' && !x.debt && ['Guardar como frecuente', () => favoriteForm(null, x)]);

/* ---------- Hoy, total y avisos ---------- */
homeBlocks.today = ['Puedes gastar hoy', (view, { here }) => {
  const left = L.dailyAllowance(here, L.today());
  if (left === null) return;
  view.append(el('div', { className: 'card' }, el('div', { className: 'dim', textContent: 'Puedes gastar hoy' }), el('div', { className: 'num', textContent: money(left) }),
    el('div', { className: 'dim', textContent: 'Según los límites de tus categorías. No cuenta las que no tienen límite.' })));
}];

homeBlocks.total = ['Total en pesos', (view) => {
  if (!Object.keys(prefs.rates).length) return;
  const t = L.totalPesos(data, prefs.rates);
  view.append(el('div', { className: 'card' }, el('div', { className: 'dim', textContent: 'Todo junto, en pesos (aproximado)' }), el('div', { className: 'num', textContent: money(t.total, 'peso') }),
    el('div', { className: 'dim', textContent: t.missing.length ? `Falta la tasa de ${t.missing.map((c) => CUR[c][0].toLowerCase()).join(' y ')}; no está sumado.` : 'Con las tasas que pusiste en Ajustes.' })));
}];

homeNotices.push((view) => {
  const r = L.reminders(data, prefs.lastBackup, L.today());
  const notice = (text, action, run) => view.append(el('div', { className: 'card notice' }, el('span', { textContent: text }), button(action, run, 'chip')));
  if (r.idle) notice(`Llevas ${r.idle} días sin anotar.`, 'Anotar', () => moveForm());
  if (r.backup) notice(prefs.lastBackup ? 'Hace más de dos semanas de tu última copia.' : 'Todavía no has guardado una copia.', 'Guardar', exportBackup);
});

/* ---------- Reportes: resumen y calendario ---------- */
reportSections.push((view, { here }) => {
  const now = L.today(), current = month === now.slice(0, 7);
  if (current) {
    const c = L.compare(here, now);
    if (c.before || c.now) {
      const text = !c.before ? 'El mes pasado no anotaste gastos en estos días.'
        : c.now === c.before ? 'Llevas lo mismo que el mes pasado a estas alturas.'
        : `Llevas ${money(Math.abs(c.now - c.before))} ${c.now > c.before ? 'más' : 'menos'} que el mes pasado a estas alturas.`;
      view.append(section('Resumen'), el('div', { className: 'card' }, el('p', { textContent: text }),
        c.before && c.top ? el('p', { className: 'dim', textContent: `Lo que más subió: ${category(c.top[0]).name} (+${money(c.top[1])}).` }) : null));
    }
  }
  const cal = L.calendar(here, month);
  const short = (v) => prefs.hidden ? '••' : v >= 100000 ? `${+(v / 100000).toFixed(1)}k` : String(Math.round(v / 100));
  view.append(section('Calendario'), el('div', { className: 'card' }, el('div', { className: 'cal' },
    ...['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => el('b', { textContent: d })),
    ...Array.from({ length: cal.offset }, () => el('span')),
    ...cal.days.map((d) => el('button', { ariaCurrent: d.date === now ? 'date' : 'false',
      ariaLabel: `${dayName(d.date)}: gastaste ${money(d.expense)}, entró ${money(d.income)}`,
      onclick: () => { Object.assign(filters, { text: '', account: '', category: '', from: d.date, to: d.date }); go('moves'); } },
      String(Number(d.date.slice(8))), d.expense ? el('small', { textContent: short(d.expense) }) : null, d.income ? el('i') : null))),
    el('p', { className: 'dim', textContent: 'Número rojo: gastado. Punto: entró dinero. Toca un día para verlo.' })));
});

/* ---------- Fotos de recibos (solo en este teléfono) ---------- */
// shortcut: las fotos de movimientos borrados no se limpian (así Deshacer las recupera); limpiar si ocupan mucho.
function photoStore(mode, run) {
  return new Promise((done, fail) => {
    const open = indexedDB.open('recibos', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('fotos');
    open.onerror = () => fail(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('fotos', mode), request = run(tx.objectStore('fotos'));
      tx.oncomplete = () => { open.result.close(); done(request.result); };
      tx.onerror = tx.onabort = () => { open.result.close(); fail(tx.error); };
    };
  });
}

// Reduce la foto antes de guardarla.
async function shrink(file) {
  const dataUrl = await new Promise((done, fail) => { const r = new FileReader(); r.onload = () => done(r.result); r.onerror = fail; r.readAsDataURL(file); });
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const canvas = el('canvas', { width: Math.round(img.width * scale), height: Math.round(img.height * scale) });
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

let photoFor = null;
const pickPhoto = (id) => { photoFor = id; window.skipLock = true; $('photo').click(); };
$('photo').onchange = async () => {
  const file = $('photo').files[0];
  $('photo').value = '';
  if (!file || !photoFor) return;
  try {
    const picture = await shrink(file);
    await photoStore('readwrite', (s) => s.put(picture, photoFor));
    toast('Foto guardada');
  } catch (e) { console.warn(e.message); toast('No se pudo guardar la foto.'); }
};

async function showPhoto(id) {
  let picture;
  try { picture = await photoStore('readonly', (s) => s.get(id)); } catch { toast('No se pudo leer la foto.'); return; }
  if (!picture) { pickPhoto(id); return; }
  if (window.locked) return;
  const box = $('viewer');
  box.replaceChildren(el('img', { src: picture, alt: 'Recibo' }),
    button('Cambiar foto', () => { box.close(); pickPhoto(id); }),
    button('Borrar foto', async () => { await photoStore('readwrite', (s) => s.delete(id)); box.close(); toast('Foto borrada'); }, 'wide neg'),
    button('Cerrar', () => box.close()));
  box.showModal();
}
// El selector de archivos exige un toque directo: por eso hay un botón para ver o añadir.
moveActions.push((x) => ['Foto del recibo', () => showPhotoOrPick(x.id)]);
async function showPhotoOrPick(id) {
  let has = false;
  try { has = await photoStore('readonly', (s) => s.count(id)); } catch (e) { console.warn(e.message); }
  if (has) { showPhoto(id); return; }
  openForm({ title: 'Foto del recibo', text: ['Este movimiento no tiene foto. Se guarda solo en este teléfono.'], fields: [], save: 'Elegir o tomar foto',
    onSave: () => { pickPhoto(id); } });
}

/* ---------- Guía de la primera vez ---------- */
function guide() {
  openForm({ title: 'Cómo usar la app', save: 'Entendido', fields: [], text: [
    '1. Toca Gasté o Me entró, escribe el monto y toca la categoría. Se guarda solo.',
    '2. Cambia entre Pesos, Dólares y Euros arriba. Desliza el dedo para pasar de apartado.',
    '3. En Planes pones límites, pagos fijos, metas, deudas y gastos frecuentes.',
    '4. En el engranaje cambias el color y el orden. Guarda copias de vez en cuando.'],
  onSave: () => {} });
  savePrefs({ seen: true });
}
window.afterStart = () => { if (!prefs.seen && !window.locked) guide(); };

/* ---------- Notificaciones del teléfono (solo Android) ---------- */
let notifier = plugins?.LocalNotifications || null;
let syncing = Promise.resolve();
// Borra las programadas y las vuelve a crear con los datos actuales. Una a la vez.
function syncNotices() {
  if (!notifier || !ready) return syncing;
  syncing = syncing.then(async () => {
    const pending = (await notifier.getPending()).notifications;
    if (pending.length) await notifier.cancel({ notifications: pending.map((n) => ({ id: n.id })) });
    if ((await notifier.checkPermissions()).display !== 'granted') return;
    const notifications = L.notificationPlan(data, prefs, new Date(), Boolean(lockData)).map(({ at, on, ...n }) => ({
      ...n, smallIcon: 'ic_stat_dinero', schedule: at ? { at, allowWhileIdle: true } : { on, allowWhileIdle: true },
    }));
    if (notifications.length) await notifier.schedule({ notifications });
  }).catch((e) => console.warn('notificaciones:', e.message));
  return syncing;
}
window.syncNotices = syncNotices;

async function setNotify(change) {
  if (change.payments || change.daily) {
    try {
      let state = (await notifier.checkPermissions()).display;
      if (state !== 'granted') { window.skipLock = true; state = (await notifier.requestPermissions()).display; }
      if (state !== 'granted') { toast('Sin permiso. Actívalo en Ajustes del teléfono, en Notificaciones de Chelitos.'); return; }
    } catch (e) { console.warn(e.message); toast('No se pudo activar.'); return; }
  }
  await savePrefs({ notify: { ...prefs.notify, ...change } });
  render(true);
  await syncNotices();
}

function timeForm() {
  openForm({ title: 'Hora del recordatorio', values: { time: prefs.notify.time }, fields: [{ key: 'time', label: 'Hora', type: 'time' }],
    onSave: async (v) => {
      if (!v.time) return 'Elige una hora.';
      await setNotify({ time: v.time.slice(0, 5) });
    } });
}


/* ---------- Personalización ---------- */
function nameForm() {
  openForm({ title: 'Tu nombre', values: { name: prefs.name }, fields: [{ key: 'name', label: 'Nombre para el inicio (vacío = Chelitos)', type: 'text' }],
    onSave: async (v) => { await savePrefs({ name: v.name.trim().slice(0, 20) }); render(true); } });
}
function ratesForm() {
  openForm({ title: 'Tasas de cambio', values: { usd: prefs.rates.usd ?? '', eur: prefs.rates.eur ?? '' },
    fields: [{ key: 'usd', label: '¿Cuántos pesos vale 1 dólar? (vacío = no usar)', type: 'money' }, { key: 'eur', label: '¿Cuántos pesos vale 1 euro?', type: 'money' }],
    onSave: async (v) => {
      const rates = {};
      for (const k of ['usd', 'eur']) {
        if (!String(v[k]).trim()) continue;
        const cents = L.parseAmount(v[k]);
        if (!cents || cents >= 1e8) return 'Escribe una tasa válida, por ejemplo 60.50';
        rates[k] = cents / 100;
      }
      await savePrefs({ rates });
      render(true);
    } });
}
