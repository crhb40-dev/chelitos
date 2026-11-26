// Estado, guardado y pantallas principales.
const KEY = 'data', OLD_KEY = 'movements';
let data = L.defaultData();
let tab = 'home', month = L.today().slice(0, 7), picked = null, ready = false, chartEnd = null;
const filters = { text: '', category: '', account: '', from: '', to: '' };
const screens = {};           // nombre -> función(view)
const homeBlocks = {};        // secciones del inicio: id -> [nombre, función(view, datos)]
const settingsSections = [];  // bloques extra de ajustes
const homeNotices = [];       // avisos arriba del inicio
const reportSections = [];    // bloques extra de reportes: función(view, datos)
const moveActions = [];       // botones extra al editar un movimiento: función(movimiento) -> [texto, acción]

const account = (id) => data.accounts.find((a) => a.id === id);
const category = (id) => data.categories.find((c) => c.id === id);
const KIND = { cash: ['Efectivo', 'cash', L.COLORS[2]], bank: ['Banco', 'bank', L.COLORS[0]], card: ['Tarjeta', 'card', L.COLORS[6]] };
const mine = () => L.view(data, cur);
const curOf = (id) => L.curOf(data, id);
// Sin moneda: todas las cuentas, indicando cuáles son en dólares.
const accountOptions = (k) => data.accounts.filter((a) => !k || a.currency === k)
  .map((a) => [a.id, !k && a.currency !== 'peso' ? `${a.name} (${symbol(a.currency)})` : a.name]);
const curSwitch = () => el('div', { className: 'seg cur', role: 'group', ariaLabel: 'Moneda' },
  ...Object.entries(CUR).filter(([k]) => prefs.currencies.includes(k) || k === cur).map(([k, [name]]) => el('button', { textContent: name, ariaPressed: String(k === cur),
    onclick: () => {
      const order = Object.keys(CUR);
      if (k !== cur) slide(order.indexOf(k) > order.indexOf(cur) ? 1 : -1, () => { cur = k; picked = null; shown = 0; });
    } })));
const categoryOptions = (type) => data.categories.filter((c) => c.type === type).map((c) => [c.id, c.name, c.icon, c.color]);

// Los cambios se hacen sobre una copia, se validan y solo entonces reemplazan lo guardado.
// En fila: dos cambios casi a la vez no deben pisarse.
let queue = Promise.resolve();
function update(change, done) {
  const run = queue.then(() => applyChange(change, done));
  queue = run.catch(() => {});
  return run;
}
async function applyChange(change, done) {
  let next;
  try {
    next = structuredClone(data);
    change(next);
    next = L.load(JSON.stringify(next));
    await store.set(KEY, JSON.stringify(next));
  } catch (e) {
    console.error(e);
    return 'No se pudo guardar. Revisa los datos.';
  }
  const before = data;
  data = next;
  render(true);
  window.syncNotices?.();
  if (!done) return;
  // Deshacer solo vale si no hubo otro cambio después.
  toast(done, async () => {
    if (data !== next) { toast('Ya hiciste otro cambio; no se puede deshacer.'); return; }
    try { await store.set(KEY, JSON.stringify(before)); } catch { toast('No se pudo deshacer.'); return; }
    data = before;
    render(true);
    window.syncNotices?.();
    toast('Deshecho');
  });
}

const upsert = (list, item) => {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) list.push(item); else list[i] = item;
};

/* ---------- Movimientos ---------- */
function moveForm(x, preset = {}) {
  const quick = !x; // al anotar: monto, tocar categoría y listo
  const type = preset.type || 'out';
  const remembered = account(prefs.last[`${cur}:${type}`]);
  const first = remembered?.currency === cur ? remembered : data.accounts.find((a) => a.currency === cur);
  if (!x && !first) { toast(`Primero crea una cuenta en ${CUR[cur][0].toLowerCase()}.`); accountForm(); return; }
  const cross = (v) => v.type === 'transfer' && Boolean(v.to) && curOf(v.to) !== curOf(v.account);
  const linked = x?.debt; // un abono mantiene su tipo y categoría
  const home = x ? curOf(x.account) : cur;
  // Si no hay una cuenta del tipo elegido, se ofrece crearla al guardar.
  const payOptions = (v) => {
    if (v.type === 'transfer') return accountOptions();
    const found = data.accounts.filter((a) => a.currency === home && a.kind === v.method).map((a) => [a.id, a.name]);
    return found.length ? found : [[`new:${v.method}`, `${KIND[v.method][0]} (se crea al guardar)`]];
  };
  const isType = (...t) => (v) => t.includes(v.type);
  openForm({
    title: x ? 'Editar movimiento' : 'Anotar',
    actions: x ? moveActions.map((make) => make(x)).filter(Boolean) : [],
    showSave: quick ? isType('transfer') : undefined,
    moreLabel: (v) => `${account(v.account)?.name || KIND[v.method]?.[0] || ''} · ${v.date ? dayName(v.date) : 'sin fecha'}`,
    values: x ? { ...x, method: account(x.account).kind, amount: asInput(x.amount), received: asInput(x.received) }
      : { type, method: first.kind, account: first.id, date: L.today() },
    fields: (() => {
      const hide = quick && { more: true };
      const forTransfer = quick && { more: true, always: isType('transfer') };
      const category = { key: 'category', label: quick ? 'Toca una categoría para guardar' : 'Categoría', type: 'chips', submit: quick,
        options: (v) => categoryOptions(v.type === 'in' ? 'in' : 'out'), show: (v) => !linked && isType('in', 'out')(v) };
      return [
        { key: 'type', label: 'Tipo', type: 'seg', options: [['out', 'Gasto'], ['in', 'Entrada'], ['transfer', 'Transferir']], show: () => !linked },
        { key: 'amount', label: (v) => `Monto (${symbol(curOf(v.account) || home)})`, type: quick ? 'keypad' : 'money' },
        ...(quick ? [] : [category]),
        { key: 'method', label: (v) => v.type === 'in' ? 'Cómo lo recibiste' : 'Con qué pagaste', type: 'seg', titled: true, ...hide,
          options: Object.entries(KIND).map(([k, kind]) => [k, kind[0]]), show: isType('in', 'out') },
        { key: 'account', label: 'Cuenta', type: 'select', options: payOptions, ...forTransfer },
        { key: 'to', label: 'Hacia la cuenta', type: 'select', options: (v) => accountOptions().filter(([id]) => id !== v.account), show: isType('transfer'), ...forTransfer },
        { key: 'received', label: (v) => `Cuánto llega (${symbol(curOf(v.to) || cur)})`, type: 'money', show: cross, ...forTransfer },
        { key: 'note', label: 'Nota', type: 'text', placeholder: 'Opcional', ...hide },
        { key: 'date', label: 'Fecha', type: 'date', ...hide },
        ...(quick ? [category] : []),
      ];
    })(),
    onSave: (v) => {
      const amount = L.parseAmount(v.amount);
      if (!amount) return 'Escribe un monto mayor que 0. Usa punto para los centavos.';
      if (!v.date) return 'Elige una fecha.';
      if (quick && v.type !== 'transfer' && !v.picked) return 'Toca una categoría para guardar.';
      if (v.type === 'transfer' && !v.to) return 'Para transferir necesitas dos cuentas. Crea otra en Ajustes.';
      const received = cross(v) ? L.parseAmount(v.received) : null;
      if (cross(v) && !received) return 'Escribe cuánto llega a la otra cuenta.';
      const kind = v.account.startsWith('new:') ? v.account.slice(4) : null;
      const created = kind && { id: uid(), name: KIND[kind][0], kind, initial: 0, currency: home };
      if (created) v.account = created.id;
      const item = {
        id: x?.id || uid(), type: v.type, amount, account: v.account, note: v.note.trim(), date: v.date,
        category: linked ? x.category : v.type === 'transfer' ? '' : v.category,
        ...(v.type === 'transfer' && { to: v.to }), ...(received && { received }), ...(linked && { debt: x.debt }),
      };
      // Pasa al apartado donde quedó anotado, para que se vea.
      const before = cur;
      cur = created ? home : curOf(item.account);
      return update((d) => { if (created) d.accounts.push(created); upsert(d.movements, item); }, 'Guardado').then((problem) => {
        if (problem) cur = before;
        else if (quick && item.type !== 'transfer') savePrefs({ last: { ...prefs.last, [`${cur}:${item.type}`]: item.account } });
        return problem;
      });
    },
    onDelete: x && (() => update((d) => { d.movements = d.movements.filter((m) => m.id !== x.id); }, 'Borrado')),
  });
}

function moveRow(x) {
  const transfer = x.type === 'transfer';
  const c = transfer ? { name: 'Transferencia', icon: 'swap', color: '#8B8F99' } : category(x.category);
  const where = transfer ? `${account(x.account).name} → ${account(x.to).name}` : account(x.account).name;
  // En un cambio de moneda se muestra lo que salió o llegó en el apartado actual.
  const arrived = transfer && curOf(x.to) === cur && curOf(x.account) !== cur;
  const amount = arrived ? x.received : x.amount;
  const other = x.received ? ` · ${money(x.amount, curOf(x.account))} → ${money(x.received, curOf(x.to))}` : '';
  return line({
    lead: badge(c.icon, c.color), title: x.note || c.name, sub: `${dayName(x.date)} · ${where}${other}`,
    value: (x.type === 'in' || arrived ? '+' : x.type === 'out' || x.received ? '−' : '') + money(amount),
    valueClass: x.type === 'in' ? 'pos' : '', onclick: () => moveForm(x),
  });
}

/* ---------- Inicio ---------- */
screens.home = (view) => {
  const here = mine(), now = L.today().slice(0, 7), s = L.summary(here, now), b = L.balances(data, cur);
  const big = el('div', { className: 'big' + (b.total < 0 && !prefs.hidden ? ' neg' : '') });
  const eye = el('button', { className: 'icon-btn', ariaLabel: prefs.hidden ? 'Mostrar saldos' : 'Ocultar saldos', ariaPressed: String(prefs.hidden),
    onclick: async () => { await savePrefs({ hidden: !prefs.hidden }); render(true); window.syncNotices?.(); } }, icon(prefs.hidden ? 'eyeoff' : 'eye'));
  view.append(
    el('div', { className: 'head' }, el('h1', { textContent: prefs.name ? `Hola, ${prefs.name}` : 'Mi dinero' }), el('div', { className: 'tools' }, eye,
      el('button', { className: 'icon-btn', ariaLabel: 'Ajustes', onclick: () => go('settings') }, icon('gear')))),
    curSwitch(),
    el('div', { className: 'card hero' }, el('div', { className: 'dim', textContent: `Saldo total en ${CUR[cur][0].toLowerCase()}` }), big,
      el('div', { className: 'dim', textContent: monthName(now) }),
      el('div', { className: 'duo' },
        el('div', {}, '▲ Entró', el('b', { className: 'pos', textContent: money(s.income) })),
        el('div', {}, '▼ Salió', el('b', { className: 'neg', textContent: money(s.expense) })))),
    el('div', { className: 'actions' }, button('− Gasté', () => moveForm(null, { type: 'out' }), 'spend'),
      button('+ Me entró', () => moveForm(null, { type: 'in' }), 'earn')));
  countUp(big, b.total);
  for (const notice of homeNotices) notice(view);
  for (const id of prefs.order) if (!prefs.off.includes(id)) homeBlocks[id]?.[1](view, { here, s, b });
};

homeBlocks.accounts = ['Cuentas', (view, { here, b }) => view.append(section('Cuentas', '+ Cuenta', () => accountForm()),
  el('div', { className: 'scroll' }, ...(here.accounts.length ? [] : [button(`Crear cuenta en ${CUR[cur][0].toLowerCase()}`, () => accountForm())]),
    ...here.accounts.map((a) => el('button', { className: 'tile', onclick: () => accountForm(a) },
      badge(KIND[a.kind][1], KIND[a.kind][2]), el('span', { className: 'dim', textContent: a.name }),
      el('b', { className: b.byAccount[a.id] < 0 && !prefs.hidden ? 'neg' : '', textContent: money(b.byAccount[a.id]) })))))];

homeBlocks.spending = ['En qué gastas', (view, { s }) => {
  if (!s.expense) return;
  view.append(section('En qué gastas', 'Ver reportes', () => go('reports')),
    el('div', { className: 'card' }, ...s.byCategory.slice(0, 3).map(([id, v]) => {
      const c = category(id);
      return el('div', {}, line({ lead: badge(c.icon, c.color), title: c.name, sub: `${Math.round(v * 100 / s.expense)}% de tus gastos`, value: money(v) }), track(v / s.expense, c.color));
    })));
}];

homeBlocks.recent = ['Últimos movimientos', (view, { here }) => {
  const recent = L.search(here).slice(0, 5);
  view.append(section('Últimos movimientos', recent.length ? 'Ver todos' : '', () => go('moves')),
    el('div', {}, ...(recent.length ? recent.map(moveRow) : [empty('Aún no hay movimientos. Toca Gasté o Me entró.')])));
}];

/* ---------- Buscar ---------- */
screens.moves = (view) => {
  const results = el('div');
  let limit = 60;
  const refresh = () => {
    const found = L.search(mine(), filters);
    const net = found.reduce((n, x) => n + (x.type === 'in' ? x.amount : x.type === 'out' ? -x.amount : 0), 0); // sin transferencias
    results.replaceChildren(
      el('p', { className: 'dim', textContent: `${found.length} ${found.length === 1 ? 'movimiento' : 'movimientos'} · balance ${money(net)}` }),
      ...(found.length ? found.slice(0, limit).map(moveRow) : [empty('Nada coincide con la búsqueda.')]),
      ...(found.length > limit ? [button('Ver más', () => { limit += 100; refresh(); })] : []));
  };
  const input = (key, type, label) => el('input', { type, value: filters[key], ariaLabel: label, placeholder: label, oninput: (e) => { filters[key] = e.target.value; refresh(); } });
  const select = (key, label, options) => {
    const s = el('select', { ariaLabel: label, onchange: () => { filters[key] = s.value; refresh(); } },
      el('option', { value: '', textContent: label }), ...options.map(([value, textContent]) => el('option', { value, textContent })));
    s.value = filters[key];
    if (s.value !== filters[key]) filters[key] = s.value = '';
    return s;
  };
  view.append(el('div', { className: 'head' }, el('h1', { textContent: 'Historial' })), curSwitch(),
    input('text', 'search', 'Buscar por nota o categoría'),
    el('div', { className: 'filters' },
      select('category', 'Categorías', data.categories.map((c) => [c.id, c.name])),
      select('account', 'Cuentas', accountOptions(cur)),
      el('label', { className: 'field' }, 'Desde', input('from', 'date', 'Desde')),
      el('label', { className: 'field' }, 'Hasta', input('to', 'date', 'Hasta'))),
    button('Limpiar búsqueda', () => { for (const k in filters) filters[k] = ''; render(true); }),
    results);
  refresh();
};

/* ---------- Reportes ---------- */
function donut(s) {
  // Como mucho 6 porciones; lo demás se agrupa.
  const slices = s.byCategory.map(([id, v]) => ({ id, v, ...category(id) }));
  if (slices.length > 6) {
    const rest = slices.splice(5);
    slices.push({ id: 'rest', name: 'Resto', color: '#8B8F99', v: rest.reduce((n, x) => n + x.v, 0) });
  }
  const R = 80, C = 2 * Math.PI * R;
  const chosen = slices.find((x) => x.id === picked);
  const svg = svgEl('svg', { viewBox: '0 0 200 200', width: 200, height: 200, role: 'img', 'aria-label': 'Gastos por categoría' });
  let at = 0;
  for (const x of slices) {
    const len = x.v / s.expense * C;
    const arc = svgEl('circle', { cx: 100, cy: 100, r: R, fill: 'none', stroke: x.color, 'stroke-width': x === chosen ? 34 : 26,
      'stroke-dasharray': `${Math.max(1, len - (slices.length > 1 ? 2 : 0))} ${C}`, 'stroke-dashoffset': -at });
    arc.onclick = () => { picked = picked === x.id ? null : x.id; render(true); };
    svg.append(arc);
    at += len;
  }
  return el('div', { className: 'donut' }, svg, el('div', { className: 'center' },
    el('span', { className: 'dim', textContent: chosen ? chosen.name : 'Gastaste' }),
    el('b', { textContent: money(chosen ? chosen.v : s.expense) }),
    chosen ? el('span', { className: 'dim', textContent: `${Math.round(chosen.v * 100 / s.expense)}%` }) : null));
}

screens.reports = (view) => {
  chartEnd = L.windowEnd(chartEnd, month, 6);
  const here = mine(), s = L.summary(here, month), six = L.lastMonths(here, chartEnd, 6);
  const top = Math.max(1, ...six.flatMap((m) => [m.income, m.expense]));
  const go6 = (n) => { month = L.shiftMonth(month, n); picked = null; render(true); };
  const arrow = (textContent, n, ariaLabel) => el('button', { textContent, ariaLabel, onclick: () => go6(n) });
  const column = (m) => {
    const bar = (v, color) => { const i = el('i'); i.style.cssText = `height:${v ? Math.max(2, v / top * 100) : 0}%;background:${color}`; return i; };
    return el('button', { ariaPressed: String(m.month === month), ariaLabel: `${monthName(m.month)}: entró ${money(m.income)}, salió ${money(m.expense)}`,
      onclick: () => { month = m.month; picked = null; render(true); } },
      el('div', { className: 'pair' }, bar(m.income, 'var(--in)'), bar(m.expense, 'var(--out)')), monthShort(m.month));
  };
  const key = (color, text) => el('span', {}, Object.assign(el('i'), { style: `background:${color}` }), text);
  view.append(
    el('div', { className: 'head' }, el('h1', { textContent: 'Reportes' })), curSwitch(),
    el('div', { className: 'month' }, arrow('‹', -1, 'Mes anterior'), el('strong', { textContent: monthName(month) }), arrow('›', 1, 'Mes siguiente')),
    el('div', { className: 'card' }, el('div', { className: 'duo' },
      el('div', {}, 'Entró', el('b', { textContent: money(s.income) })),
      el('div', {}, 'Salió', el('b', { textContent: money(s.expense) }))),
      el('p', { className: 'dim', textContent: `Te quedó ${money(s.income - s.expense)} este mes` })));
  for (const add of reportSections) add(view, { here });
  view.append(
    ...(s.expense ? [section('Con qué pagaste'), el('div', { className: 'card' }, ...L.spentByKind(here, month).map(([k, v]) =>
      el('div', {}, line({ lead: badge(KIND[k][1], KIND[k][2]), title: KIND[k][0], sub: `${Math.round(v * 100 / s.expense)}% de tus gastos`, value: money(v) }), track(v / s.expense, KIND[k][2]))))] : []),
    section('Gastos por categoría'),
    el('div', { className: 'card' }, ...(s.expense ? [donut(s), ...s.byCategory.map(([id, v]) => {
      const c = category(id);
      return line({ lead: badge(c.icon, c.color), title: c.name, sub: `${Math.round(v * 100 / s.expense)}%`, value: money(v),
        onclick: () => { Object.assign(filters, { text: '', account: '', category: id, from: `${month}-01`, to: `${month}-31` }); go('moves'); } });
    })] : [empty('Sin gastos este mes.')])),
    section(chartEnd === L.today().slice(0, 7) ? 'Últimos 6 meses' : 'Comparación de 6 meses'),
    el('div', { className: 'card' }, el('div', { className: 'keys' }, key('var(--in)', 'Entró'), key('var(--out)', 'Salió')),
      el('div', { className: 'cols' }, ...six.map(column)),
      el('p', { className: 'dim', textContent: `Toca un mes para verlo. ${monthName(month)}: entró ${money(s.income)}, salió ${money(s.expense)}.` })));
};

/* ---------- Cuentas, categorías y copia ---------- */
function accountForm(a) {
  openForm({
    title: a ? 'Editar cuenta' : 'Nueva cuenta',
    values: a ? { ...a, initial: asInput(a.initial) } : { kind: 'bank', initial: '0', currency: cur },
    fields: [
      { key: 'name', label: 'Nombre', type: 'text', placeholder: 'Ej. Banco, Ahorros' },
      { key: 'kind', label: 'Tipo', type: 'seg', titled: true, options: Object.entries(KIND).map(([k, v]) => [k, v[0]]) },
      { key: 'currency', label: 'Moneda', type: 'seg', titled: true, options: Object.entries(CUR).map(([k, x]) => [k, x[0]]) },
      { key: 'initial', label: 'Saldo con el que empieza (en tarjeta, deuda con signo -)', type: 'money' },
    ],
    onSave: (v) => {
      const initial = L.parseAmount(v.initial, { zero: true, negative: true });
      if (!v.name.trim()) return 'Ponle un nombre.';
      if (initial === null) return 'Revisa el saldo. Usa punto para los centavos.';
      if (a && v.currency !== a.currency && [...data.movements, ...data.recurring, ...data.favorites].some((x) => x.account === a.id || x.to === a.id)) {
        return 'No se puede cambiar la moneda de una cuenta con movimientos, pagos fijos o frecuentes. Crea otra cuenta.';
      }
      const before = cur;
      cur = v.currency;
      return update((d) => upsert(d.accounts, { id: a?.id || uid(), name: v.name.trim(), kind: v.kind, initial, currency: v.currency }), 'Cuenta guardada')
        .then((problem) => { if (problem) cur = before; return problem; });
    },
    onDelete: a && (async () => {
      try { L.removeAccount(structuredClone(data), a.id); } catch (e) { return e.message; }
      return update((d) => L.removeAccount(d, a.id), 'Cuenta borrada');
    }),
  });
}

function categoryForm(c) {
  openForm({
    title: c ? 'Editar categoría' : 'Nueva categoría',
    values: c ? { ...c } : { type: 'out', icon: 'dots', color: L.COLORS[0] },
    fields: [
      { key: 'type', label: 'Para', type: 'seg', options: [['out', 'Gastos'], ['in', 'Entradas']], show: () => !c },
      { key: 'name', label: 'Nombre', type: 'text' },
      { key: 'icon', label: 'Icono', type: 'icons', options: Object.keys(ICONS).filter((k) => !['gear', 'swap', 'list', 'chart', 'target', 'eye', 'eyeoff'].includes(k)).map((k, i) => [k, `Icono ${i + 1}`]) },
      { key: 'color', label: 'Color', type: 'colors', options: L.COLORS.map((x, i) => [x, `Color ${i + 1}`]) },
    ],
    onSave: (v) => {
      if (!v.name.trim()) return 'Ponle un nombre.';
      return update((d) => upsert(d.categories, { id: c?.id || uid(), name: v.name.trim(), type: v.type, icon: v.icon, color: v.color, ...Object.fromEntries(Object.values(L.BUDGET).map((k) => [k, c?.[k] || 0])) }), 'Categoría guardada');
    },
    onDelete: c && !L.FIXED.includes(c.id) ? () => update((d) => L.removeCategory(d, c.id), 'Borrada. Sus movimientos pasaron a la categoría general.') : null,
  });
}

screens.settings = (view) => {
  view.append(el('div', { className: 'head' }, el('h1', { textContent: 'Ajustes' }), button('Listo', () => go('home'), 'link')),
    section('Cuentas', '+ Nueva', () => accountForm()),
    el('div', { className: 'card' }, ...data.accounts.map((a) => line({ lead: badge(KIND[a.kind][1], KIND[a.kind][2]), title: a.name, sub: `${KIND[a.kind][0]} · ${CUR[a.currency][0]}`, onclick: () => accountForm(a) }))));
  for (const add of settingsSections) add(view);
  const set = async (change) => { await savePrefs(change); render(true); };
  const move = (i, step) => { const order = [...prefs.order]; [order[i], order[i + step]] = [order[i + step], order[i]]; set({ order }); };
  const arrow = (textContent, ariaLabel, disabled, onclick) => el('button', { className: 'mini', textContent, ariaLabel, disabled, onclick });
  view.append(section('Color'),
    el('div', { className: 'swatches', role: 'group', ariaLabel: 'Color principal' }, ...L.ACCENTS.map(([color, name]) => {
      const b = el('button', { ariaPressed: String(prefs.accent === color), onclick: () => set({ accent: color }) }, el('i'), name);
      b.firstChild.style.background = color;
      return b;
    })),
    section('Secciones del inicio'),
    el('div', { className: 'card' }, ...prefs.order.map((id, i) => {
      const name = homeBlocks[id][0], off = prefs.off.includes(id);
      return el('div', { className: 'order' }, el('span', { textContent: name, className: off ? 'dim' : '' }),
        arrow('↑', `Subir ${name}`, i === 0, () => move(i, -1)),
        arrow('↓', `Bajar ${name}`, i === prefs.order.length - 1, () => move(i, 1)),
        el('button', { className: 'mini wideb', textContent: off ? 'Mostrar' : 'Ocultar', ariaLabel: `${off ? 'Mostrar' : 'Ocultar'} ${name}`,
          onclick: () => set({ off: off ? prefs.off.filter((x) => x !== id) : [...prefs.off, id] }) }));
    })));
  view.append(section('Categorías', '+ Nueva', () => categoryForm()),
    el('div', { className: 'card' }, ...data.categories.map((c) => line({ lead: badge(c.icon, c.color), title: c.name, sub: c.type === 'in' ? 'Entradas' : 'Gastos', onclick: () => categoryForm(c) }))),
    section('Copia de seguridad'),
    el('div', {}, button('Guardar copia', exportBackup), button('Recuperar copia', () => { window.skipLock = true; $('file').click(); }),
      button('Exportar a Excel (CSV)', () => shareFile(`dinero-${L.today()}.csv`, L.csv(data), 'text/csv'))),
    el('p', { className: 'dim', textContent: 'Las fotos de recibos no van en la copia.' }));
};

// Entrega un archivo: menú de compartir en el teléfono, o descarga en el navegador.
async function shareFile(name, text, type) {
  window.skipLock = true; // salir a compartir no debe bloquear al instante
  if (!plugins) {
    const file = new File([text], name, { type });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
    }
    el('a', { href: URL.createObjectURL(file), download: name }).click();
    return true;
  }
  try {
    const { uri } = await plugins.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
    await plugins.Share.share({ title: name, files: [uri] });
    return true;
  } catch (e) {
    if (!/cancel/i.test(e.message)) toast('No se pudo guardar el archivo.');
    return false;
  }
}
async function exportBackup() {
  if (!await shareFile(`dinero-${L.today()}.json`, JSON.stringify(data), 'application/json')) return;
  await savePrefs({ lastBackup: L.today() });
  render(true);
}

$('file').onchange = async () => {
  const file = $('file').files[0];
  $('file').value = '';
  if (!file) return;
  let next;
  try { next = L.load(await file.text()); } catch (e) { toast(e.message); return; }
  if (!confirm(`¿Reemplazar todo lo actual (${data.movements.length} movimientos) por la copia (${next.movements.length} movimientos)?`)) return;
  const problem = await update((d) => Object.assign(d, next), 'Copia recuperada');
  if (problem) toast(problem);
};

/* ---------- Navegación ---------- */
// still = redibujar sin repetir las animaciones de entrada.
function render(still = false) {
  if (!ready) return;
  const view = $('view'), top = view.scrollTop;
  view.classList.toggle('still', still);
  view.classList.remove('sliding');
  view.replaceChildren();
  screens[tab](view);
  view.scrollTop = still ? top : 0;
  for (const b of document.querySelectorAll('[data-tab]')) b.ariaCurrent = b.dataset.tab === tab ? 'page' : 'false';
}

// Pasa de un apartado a otro: dir 1 = el nuevo está a la derecha, -1 = a la izquierda.
function slide(dir, change) {
  const view = $('view');
  for (const g of document.querySelectorAll('.ghost')) g.remove();
  for (const a of view.getAnimations()) a.cancel();
  const box = view.getBoundingClientRect(), top = view.scrollTop;
  const ghost = view.cloneNode(true); // copia de la pantalla que sale
  ghost.removeAttribute('id');
  ghost.className = 'still ghost';
  ghost.inert = true;
  ghost.style.cssText = `top:${box.top}px;left:${box.left}px;width:${box.width}px;height:${box.height}px`;
  change();
  render();
  view.scrollTop = 0;
  if (calm()) return;
  view.classList.add('sliding');
  document.body.append(ghost);
  ghost.scrollTop = top;
  const timing = { duration: 340, easing: 'cubic-bezier(.25,.8,.25,1)' };
  view.animate([{ transform: `translateX(${dir * 100}%)` }, { transform: 'none' }], timing);
  ghost.animate([{ transform: 'none' }, { transform: `translateX(${-dir * 100}%)` }], { ...timing, fill: 'forwards' })
    .finished.then(() => ghost.remove(), () => {});
}

function go(next) {
  if (next === tab) return;
  const order = [...document.querySelectorAll('[data-tab]')].map((b) => b.dataset.tab).concat('settings');
  slide(order.indexOf(next) > order.indexOf(tab) ? 1 : -1, () => {
    tab = next;
    picked = null;
    if (next === 'reports') { month = L.today().slice(0, 7); chartEnd = null; }
    shown = 0;
  });
}

// Deslizar el dedo: hacia la izquierda pasa al apartado de la derecha, y al revés.
let touch = null;
$('view').addEventListener('touchstart', (e) => {
  // No cuenta si empieza en un campo o en una fila que se desplaza de lado (las cuentas).
  const row = e.target.closest('.scroll');
  const busy = e.touches.length > 1 || e.target.closest('input, select') || (row && row.scrollWidth > row.clientWidth);
  touch = busy ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() };
}, { passive: true });
$('view').addEventListener('touchcancel', () => { touch = null; }, { passive: true });
$('view').addEventListener('touchend', (e) => {
  if (!touch || !ready || window.locked || $('sheet').open) return;
  const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
  const quick = Date.now() - touch.at < 700;
  touch = null;
  if (!quick || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  const tabs = [...document.querySelectorAll('[data-tab]')].map((b) => b.dataset.tab);
  if (tab === 'settings') { if (dx > 0) go('home'); return; }
  const next = tabs[tabs.indexOf(tab) + (dx < 0 ? 1 : -1)];
  if (next) go(next);
}, { passive: true });

$('add').onclick = () => moveForm();
$('sheet').oncancel = (e) => { e.preventDefault(); closeSheet(); };
const NAV_ICONS = { home: 'home', moves: 'list', reports: 'chart', plans: 'target' };
for (const b of document.querySelectorAll('[data-tab]')) {
  b.prepend(icon(NAV_ICONS[b.dataset.tab], 22));
  b.onclick = () => go(b.dataset.tab);
}
plugins?.App.addListener('backButton', () => {
  if (window.locked) plugins.App.exitApp();
  else if ($('sheet').open) closeSheet();
  else if (tab !== 'home') go('home');
  else plugins.App.exitApp();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('sheet').open) { render(true); window.syncNotices?.(); } });

async function start() {
  try {
    const saved = await store.get(KEY);
    if (saved) data = L.load(saved);
    else {
      // Primera vez en la versión 2: pasa los datos de la 1. La clave vieja se conserva intacta.
      const old = await store.get(OLD_KEY);
      if (old) { data = L.load(old); await store.set(KEY, JSON.stringify(data)); }
    }
    prefs = L.prefs(await store.get('prefs'));
    applyPrefs();
    cur = prefs.start;
    await window.gate?.(); // bloquea antes de mostrar nada
    ready = true;
    render();
    window.afterStart?.();
    window.syncNotices?.();
  } catch (e) {
    // No tocar datos ilegibles: se bloquea la app para no sobrescribirlos.
    console.error(e);
    $('add').disabled = true;
    for (const b of document.querySelectorAll('[data-tab]')) b.disabled = true;
    $('view').replaceChildren(empty('No pude leer tus datos guardados. No se borró nada. Cierra la app y vuelve a abrirla.'));
  }
}
// Espera a que carguen todas las partes antes de dibujar.
window.addEventListener('DOMContentLoaded', start);
