// Estado, guardado y pantallas principales.
const KEY = 'data', OLD_KEY = 'movements';
let data = L.defaultData();
let tab = 'home', month = L.today().slice(0, 7), picked = null, ready = false, chartEnd = null;
const filters = { text: '', category: '', account: '', from: '', to: '' };
const screens = {};           // nombre -> función(view)
const homeBlocks = {};        // secciones del inicio: id -> [nombre, función(view, datos)]
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
let lastCur = null; // para animar la píldora desde la moneda anterior
const visibleCurrencies = () => Object.keys(CUR).filter((k) => prefs.currencies.includes(k) || k === cur);
function curSwitch() {
  const list = visibleCurrencies(), i = list.indexOf(cur), from = list.indexOf(lastCur);
  const pill = el('span', { className: 'pill', ariaHidden: 'true' });
  const box = el('div', { className: 'seg cur', role: 'group', ariaLabel: 'Moneda' }, pill,
    ...list.map((k) => el('button', { textContent: CUR[k][0], ariaPressed: String(k === cur), onclick: () => switchCurrency(k) })));
  box.style.setProperty('--n', list.length);
  pill.style.transform = `translateX(${i * 100}%)`;
  if (from >= 0 && from !== i && !calm()) {
    pill.animate([{ transform: `translateX(${from * 100}%)` }, { transform: `translateX(${i * 100}%)` }], { duration: 360, easing: 'cubic-bezier(.3,1.3,.5,1)' });
  }
  lastCur = cur;
  return box;
}

// Cambia de moneda sin mover la pantalla: la píldora se desliza, el saldo cuenta hasta el nuevo y el resto entra de lado.
function switchCurrency(k) {
  if (k === cur || settling) return;
  const list = visibleCurrencies(), dir = list.indexOf(k) > list.indexOf(cur) ? 1 : -1;
  buzz();
  cur = k;
  picked = null;
  render(true);
  if (calm()) return;
  const items = [...$('view').children], start = items.findIndex((n) => n.classList.contains('cur')) + 1;
  items.slice(start).forEach((n, i) => n.animate([{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }],
    { duration: 320, delay: Math.min(i, 6) * 35, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
}
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
  buzz();
  // Deshacer solo vale si no hubo otro cambio después.
  toast(done, () => { queue = queue.then(async () => {
    if (data !== next) { toast('Ya hiciste otro cambio; no se puede deshacer.'); return; }
    try { await store.set(KEY, JSON.stringify(before)); } catch { toast('No se pudo deshacer.'); return; }
    data = before;
    render(true);
    window.syncNotices?.();
    toast('Deshecho');
  }).catch(() => {}); });
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
        { key: 'amount', label: (v) => `Monto (${symbol(curOf(v.account) || home)})`, type: 'money' },
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
      if (!amount) return 'Escribe un monto mayor que 0.';
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

// grouped: va bajo un encabezado de día, así que no repite la fecha.
function moveRow(x, opts) {
  const transfer = x.type === 'transfer';
  const c = transfer ? { name: 'Transferencia', icon: 'swap', color: '#8B8F99' } : category(x.category);
  const where = transfer ? `${account(x.account).name} → ${account(x.to).name}` : account(x.account).name;
  // En un cambio de moneda se muestra lo que salió o llegó en el apartado actual.
  const arrived = transfer && curOf(x.to) === cur && curOf(x.account) !== cur;
  const amount = arrived ? x.received : x.amount;
  const other = x.received ? ` · ${money(x.amount, curOf(x.account))} → ${money(x.received, curOf(x.to))}` : '';
  return line({
    lead: badge(c.icon, c.color), title: x.note || c.name, sub: `${opts?.grouped ? '' : `${dayName(x.date)} · `}${where}${other}`,
    value: (x.type === 'in' || arrived ? '+' : x.type === 'out' || x.received ? '−' : '') + money(amount),
    valueClass: x.type === 'in' ? 'pos' : '', onclick: () => moveForm(x),
  });
}

/* ---------- Inicio ---------- */
// Gasto de cada día del mes, en barras pequeñas. Hoy en verde.
function spark(here, now, s) {
  if (!s.expense) return null;
  const days = L.calendar(here, now).days, peak = Math.max(...days.map((d) => d.expense)), today = L.today();
  return el('div', { className: 'spark', ariaHidden: 'true' }, ...days.map((d, i) => {
    const bar = el('i', { className: d.date === today ? 'on' : d.date > today ? 'future' : '' });
    bar.style.height = `${d.expense ? Math.max(10, d.expense / peak * 100) : 4}%`;
    bar.style.animationDelay = `${i * 12}ms`;
    return bar;
  }));
}

screens.home = (view) => {
  const here = mine(), now = L.today().slice(0, 7), s = L.summary(here, now), b = L.balances(data, cur);
  const big = el('div', { className: 'big' + (b.total < 0 && !prefs.hidden ? ' neg' : '') });
  const eye = el('button', { className: 'icon-btn', ariaLabel: prefs.hidden ? 'Mostrar saldos' : 'Ocultar saldos', ariaPressed: String(prefs.hidden),
    onclick: async () => { await savePrefs({ hidden: !prefs.hidden }); render(true); window.syncNotices?.(); } }, icon(prefs.hidden ? 'eyeoff' : 'eye'));
  view.append(
    el('div', { className: 'head' }, el('h1', { textContent: prefs.name ? `Hola, ${prefs.name}` : 'Chelitos' }), el('div', { className: 'tools' }, eye,
      el('button', { className: 'icon-btn', ariaLabel: 'Ajustes', onclick: () => go('settings') }, icon('gear')))),
    curSwitch(),
    el('div', { className: 'card hero' }, el('div', { className: 'dim', textContent: `Saldo total en ${CUR[cur][0].toLowerCase()}` }), big,
      el('div', { className: 'dim', textContent: monthName(now) }),
      spark(here, now, s),
      el('div', { className: 'duo' },
        el('div', {}, '▲ Entró', el('b', { className: s.income ? 'pos' : '', textContent: money(s.income) })),
        el('div', {}, '▼ Salió', el('b', { className: s.expense ? 'neg' : '', textContent: money(s.expense) })))),
    el('div', { className: 'actions' }, button('− Gasté', () => moveForm(null, { type: 'out' }), 'spend'),
      button('+ Me entró', () => moveForm(null, { type: 'in' }), 'earn')));
  countUp(big, b.total);
  for (const notice of homeNotices) notice(view);
  for (const id of prefs.order) if (!prefs.off.includes(id)) homeBlocks[id]?.[1](view, { here, s, b });
};

homeBlocks.accounts = ['Cuentas', (view, { here, b }) => view.append(section('Cuentas', here.accounts.length ? '+ Cuenta' : '', () => accountForm()),
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
// Lista con un encabezado por día y lo que dejó ese día (sin transferencias).
const lastDay = (m) => { const [y, n] = m.split('-').map(Number); return `${m}-${String(new Date(y, n, 0).getDate()).padStart(2, '0')}`; };

function byDay(list) {
  const net = {};
  for (const x of list) net[x.date] = (net[x.date] || 0) + (x.type === 'in' ? x.amount : x.type === 'out' ? -x.amount : 0);
  return list.flatMap((x, i) => i && list[i - 1].date === x.date ? [moveRow(x, { grouped: true })]
    : [el('div', { className: 'dayhead' }, el('span', { textContent: longDay(x.date) }), el('span', { textContent: (net[x.date] > 0 ? '+' : '') + money(net[x.date]) })), moveRow(x, { grouped: true })]);
}

let showFilters = false;
screens.moves = (view) => {
  const results = el('div');
  let limit = 60;
  const refresh = () => {
    const found = L.search(mine(), filters);
    let income = 0, expense = 0; // sin transferencias
    for (const x of found) { if (x.type === 'in') income += x.amount; else if (x.type === 'out') expense += x.amount; }
    results.replaceChildren(
      el('div', { className: 'duo stats' },
        el('div', {}, '▲ Entró', el('b', { className: income ? 'pos' : '', textContent: money(income) })),
        el('div', {}, '▼ Salió', el('b', { className: expense ? 'neg' : '', textContent: money(expense) }))),
      el('p', { className: 'dim count-line', textContent: `${found.length} ${found.length === 1 ? 'movimiento' : 'movimientos'}` }),
      ...(found.length ? byDay(found.slice(0, limit)) : [empty(filters.text || filters.category || filters.account ? 'Nada coincide con la búsqueda.' : 'No hay movimientos en este periodo.')]),
      ...(found.length > limit ? [button('Ver más', () => { limit += 100; refresh(); })] : []));
  };
  const input = (key, type, label) => el('input', { type, value: filters[key], ariaLabel: label, placeholder: label, oninput: (e) => { filters[key] = e.target.value; refresh(); } });
  const select = (key, label, options) => {
    const s = el('select', { ariaLabel: label, onchange: () => { filters[key] = s.value; render(true); } },
      el('option', { value: '', textContent: label }), ...options.map(([value, textContent]) => el('option', { value, textContent })));
    s.value = filters[key];
    if (s.value !== filters[key]) filters[key] = s.value = '';
    return s;
  };
  const today = L.today(), m = today.slice(0, 7), pm = L.shiftMonth(m, -1);
  const ranges = [['Todo', '', ''], ['Hoy', today, today], ['Este mes', `${m}-01`, lastDay(m)], ['Mes pasado', `${pm}-01`, lastDay(pm)]];
  const extra = ['category', 'account'].filter((k) => filters[k]).length + (ranges.some(([, f, t]) => f === filters.from && t === filters.to) ? 0 : 1);
  const toggle = el('button', { className: 'fbtn', ariaLabel: 'Filtros', ariaExpanded: String(showFilters), onclick: () => { showFilters = !showFilters; render(true); } },
    icon('filter'), extra ? el('span', { className: 'count', textContent: String(extra) }) : null);
  view.append(el('div', { className: 'head' }, el('h1', { textContent: 'Historial' })), curSwitch(),
    el('div', { className: 'searchrow' }, input('text', 'search', 'Buscar por nota o categoría'), toggle),
    el('div', { className: 'ranges', role: 'group', ariaLabel: 'Fechas' }, ...ranges.map(([name, from, to]) => el('button', {
      textContent: name, ariaPressed: String(filters.from === from && filters.to === to),
      onclick: () => { Object.assign(filters, { from, to }); render(true); } }))),
    showFilters ? el('div', { className: 'card panel' },
      el('div', { className: 'filters' },
        select('category', 'Categorías', data.categories.map((c) => [c.id, c.name])),
        select('account', 'Cuentas', accountOptions(cur)),
        el('label', { className: 'field' }, 'Desde', input('from', 'date', 'Desde')),
        el('label', { className: 'field' }, 'Hasta', input('to', 'date', 'Hasta'))),
      button('Limpiar filtros', () => { for (const k in filters) filters[k] = ''; render(true); })) : '',
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
  const arrow = (name, n, ariaLabel, disabled) => el('button', { ariaLabel, disabled, onclick: () => go6(n) }, icon(name));
  const column = (m) => {
    const bar = (v, color) => { const i = el('i'); i.style.cssText = `height:${v ? Math.max(2, v / top * 100) : 0}%;background:${color}`; return i; };
    return el('button', { ariaPressed: String(m.month === month), ariaLabel: `${monthName(m.month)}: entró ${money(m.income)}, salió ${money(m.expense)}`,
      onclick: () => { month = m.month; picked = null; render(true); } },
      el('div', { className: 'pair' }, bar(m.income, 'var(--good)'), bar(m.expense, 'var(--coral)')), monthShort(m.month));
  };
  const key = (color, text) => el('span', {}, Object.assign(el('i'), { style: `background:${color}` }), text);
  view.append(
    el('div', { className: 'head' }, el('h1', { textContent: 'Reportes' })), curSwitch(),
    el('div', { className: 'month' }, arrow('left', -1, 'Mes anterior'), el('strong', { textContent: monthName(month) }), arrow('right', 1, 'Mes siguiente', month >= L.today().slice(0, 7))),
    el('div', { className: 'duo stats' },
      el('div', {}, '▲ Entró', el('b', { className: s.income ? 'pos' : '', textContent: money(s.income) })),
      el('div', {}, '▼ Salió', el('b', { className: s.expense ? 'neg' : '', textContent: money(s.expense) }))),
    el('p', { className: 'dim count-line', textContent: `Te quedó ${money(s.income - s.expense)} este mes` }));
  for (const add of reportSections) add(view, { here });
  view.append(
    ...(s.expense ? [section('Con qué pagaste'), el('div', { className: 'card' }, ...L.spentByKind(here, month).map(([k, v]) =>
      el('div', {}, line({ lead: badge(KIND[k][1], KIND[k][2]), title: KIND[k][0], sub: `${Math.round(v * 100 / s.expense)}% de tus gastos`, value: money(v) }), track(v / s.expense, KIND[k][2]))))] : []),
    section('Gastos por categoría'),
    el('div', { className: 'card' }, ...(s.expense ? [donut(s), ...s.byCategory.map(([id, v]) => {
      const c = category(id);
      return line({ lead: badge(c.icon, c.color), title: c.name, sub: `${Math.round(v * 100 / s.expense)}%`, value: money(v),
        onclick: () => { Object.assign(filters, { text: '', account: '', category: id, from: `${month}-01`, to: lastDay(month) }); go('moves'); } });
    })] : [empty('Sin gastos este mes.')])),
    section(chartEnd === L.today().slice(0, 7) ? 'Últimos 6 meses' : 'Comparación de 6 meses'),
    el('div', { className: 'card' }, ...(six.some((m) => m.income || m.expense) ? [
      el('div', { className: 'keys' }, key('var(--good)', 'Entró'), key('var(--coral)', 'Salió')),
      el('div', { className: 'cols' }, ...six.map(column)),
      el('p', { className: 'dim', textContent: `Toca un mes para verlo. ${monthName(month)}: entró ${money(s.income)}, salió ${money(s.expense)}.` })]
      : [empty(`Aún no hay movimientos en ${CUR[cur][0].toLowerCase()} en estos meses.`)])));
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
      { key: 'initial', label: 'Saldo con el que empieza (en tarjeta, deuda con signo -)', type: 'money', inputMode: 'text' },
    ],
    onSave: (v) => {
      const initial = L.parseAmount(v.initial, { zero: true, negative: true });
      if (!v.name.trim()) return 'Ponle un nombre.';
      if (initial === null) return 'Revisa el saldo.';
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

// Iconos de la interfaz que no se ofrecen para categorías.
const SYSTEM_ICONS = ['gear', 'swap', 'list', 'chart', 'target', 'eye', 'eyeoff', 'plus', 'bell', 'lock', 'face', 'upload', 'download', 'file', 'help', 'sun', 'filter', 'left', 'right'];

function categoryForm(c) {
  openForm({
    title: c ? 'Editar categoría' : 'Nueva categoría',
    values: c ? { ...c } : { type: 'out', icon: 'dots', color: L.COLORS[0] },
    fields: [
      { key: 'type', label: 'Para', type: 'seg', options: [['out', 'Gastos'], ['in', 'Entradas']], show: () => !c },
      { key: 'name', label: 'Nombre', type: 'text' },
      { key: 'icon', label: 'Icono', type: 'icons', options: Object.keys(ICONS).filter((k) => !SYSTEM_ICONS.includes(k)).map((k, i) => [k, `Icono ${i + 1}`]) },
      { key: 'color', label: 'Color', type: 'colors', options: L.COLORS.map((x, i) => [x, `Color ${i + 1}`]) },
    ],
    onSave: (v) => {
      if (!v.name.trim()) return 'Ponle un nombre.';
      return update((d) => upsert(d.categories, { id: c?.id || uid(), name: v.name.trim(), type: v.type, icon: v.icon, color: v.color, ...Object.fromEntries(Object.values(L.BUDGET).map((k) => [k, c?.[k] || 0])) }), 'Categoría guardada');
    },
    onDelete: c && !L.FIXED.includes(c.id) ? () => update((d) => L.removeCategory(d, c.id), 'Borrada. Sus movimientos pasaron a la categoría general.') : null,
  });
}


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
  if (!await shareFile(`chelitos-${L.today()}.json`, JSON.stringify(data), 'application/json')) return;
  await savePrefs({ lastBackup: L.today() });
  render(true);
}

$('file').onchange = async () => {
  const file = $('file').files[0];
  $('file').value = '';
  if (!file) return;
  let next;
  try { next = L.load(await file.text()); } catch (e) { toast(e.message); return; }
  if (!ready) { // datos dañados: la copia los reemplaza
    if (!confirm(`¿Reemplazar los datos dañados por la copia (${next.movements.length} movimientos)?`)) return;
    try { await store.set(KEY, JSON.stringify(next)); } catch { toast('No se pudo guardar.'); return; }
    location.reload();
    return;
  }
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
  movePill();
}

// La marca verde del menú se desliza hasta el apartado activo (la transición está en el CSS).
function movePill() {
  const pill = $('navpill'), b = document.querySelector(`[data-tab="${tab}"]`);
  pill.style.opacity = b ? '1' : '0';
  if (!b) return;
  const first = !pill.dataset.ready;
  if (first) pill.style.transition = 'none';
  Object.assign(pill.style, { transform: `translateX(${b.offsetLeft}px)`, top: `${b.offsetTop}px`, width: `${b.offsetWidth}px`, height: `${b.offsetHeight}px` });
  if (first) { void pill.offsetWidth; pill.style.transition = ''; pill.dataset.ready = '1'; }
}
addEventListener('resize', () => { const p = $('navpill'); delete p.dataset.ready; movePill(); });

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
  if (settling) return;
  buzz();
  slide(order.indexOf(next) > order.indexOf(tab) ? 1 : -1, () => { enter(next); shown = 0; });
}

// Deslizar el dedo: la pantalla lo sigue y la del apartado vecino viene pegada a ella.
let drag = null, settling = false;

function neighbor(dx) {
  const tabs = [...document.querySelectorAll('[data-tab]')].map((b) => b.dataset.tab);
  if (tab === 'settings') return dx > 0 ? 'home' : null;
  return tabs[tabs.indexOf(tab) + (dx < 0 ? 1 : -1)] || null;
}

// Estado con el que se abre un apartado.
function enter(name) {
  tab = name;
  picked = null;
  if (name === 'reports') { month = L.today().slice(0, 7); chartEnd = null; }
}

// Dibuja el apartado vecino aparte, sin cambiar todavía de apartado.
function preview(name) {
  const keep = { tab, month, picked, chartEnd, shown };
  const box = $('view').getBoundingClientRect();
  const node = el('main', { className: 'still ghost', inert: true });
  node.style.cssText = `top:${box.top}px;left:${box.left}px;width:${box.width}px;height:${box.height}px`;
  enter(name);
  instant = true;
  screens[name](node);
  instant = false;
  ({ tab, month, picked, chartEnd, shown } = keep);
  document.body.append(node);
  return node;
}

function place(d, dx) {
  const view = $('view');
  // Sin apartado a ese lado la pantalla cede un poco y vuelve.
  d.dx = d.next ? dx : dx * 0.2;
  view.style.transform = `translateX(${d.dx}px)`;
  if (d.node) d.node.style.transform = `translateX(${d.dx - Math.sign(d.side) * d.width}px)`;
}

// Termina el gesto: completa el cambio o devuelve la pantalla a su sitio.
async function settle(d, change) {
  settling = true;
  const view = $('view'), end = change ? Math.sign(d.side) * d.width : 0;
  const timing = { duration: Math.max(120, Math.min(300, Math.abs(end - d.dx) * 0.8)), easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' };
  const moves = [view.animate([{ transform: `translateX(${d.dx}px)` }, { transform: `translateX(${end}px)` }], timing)];
  if (d.node) moves.push(d.node.animate([{ transform: `translateX(${d.dx - Math.sign(d.side) * d.width}px)` }, { transform: `translateX(${end - Math.sign(d.side) * d.width}px)` }], timing));
  await Promise.race([Promise.all(moves.map((m) => m.finished)), new Promise((r) => setTimeout(r, 600))]).catch(() => {});
  if (change) { buzz(); enter(d.next); shown = 0; instant = true; render(true); instant = false; view.scrollTop = 0; }
  for (const m of moves) m.cancel();
  view.style.transform = '';
  view.classList.remove('dragging');
  d.node?.remove();
  settling = false;
}

function dropDrag() {
  const d = drag;
  drag = null;
  if (d?.active) settle(d, false);
}

$('view').addEventListener('touchstart', (e) => {
  if (e.touches.length > 1) { dropDrag(); return; }
  // No cuenta si empieza en un campo o en una fila que se desplaza de lado (las cuentas).
  const row = e.target.closest('.scroll, .ranges');
  const busy = settling || !ready || window.locked || $('sheet').open || e.target.closest('input, select') || (row && row.scrollWidth > row.clientWidth);
  drag = busy ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now(), active: false, dx: 0 };
}, { passive: true });

$('view').addEventListener('touchmove', (e) => {
  if (!drag) return;
  const dx = e.touches[0].clientX - drag.x, dy = e.touches[0].clientY - drag.y;
  if (!drag.active) {
    if (Math.hypot(dx, dy) < 10) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.2) { drag = null; return; } // es un desplazamiento hacia arriba o abajo
    drag.active = true;
    $('view').classList.add('dragging');
    drag.width = $('view').getBoundingClientRect().width;
    for (const g of document.querySelectorAll('.ghost')) g.remove();
    for (const a of $('view').getAnimations()) a.cancel();
  }
  if (calm()) { drag.dx = dx; return; } // sin animaciones: solo cambia al soltar
  // Si el dedo cruza al otro lado, se prepara el otro vecino.
  if (dx && Math.sign(dx) !== drag.side) {
    drag.node?.remove();
    drag.side = Math.sign(dx);
    drag.next = neighbor(dx);
    drag.node = drag.next ? preview(drag.next) : null;
  }
  place(drag, dx);
}, { passive: true });

$('view').addEventListener('touchend', (e) => {
  const d = drag;
  drag = null;
  if (!d?.active) return;
  const dx = e.changedTouches[0].clientX - d.x;
  const flick = Math.abs(dx) > 50 && Date.now() - d.at < 300; // gesto corto y rápido
  const far = Math.abs(dx) > d.width * 0.3;
  if (calm()) { const next = neighbor(dx); if (next && (far || flick)) go(next); return; }
  settle(d, Boolean(d.next) && Math.sign(dx) === d.side && (far || flick));
}, { passive: true });
$('view').addEventListener('touchcancel', dropDrag, { passive: true });

$('add').onclick = () => moveForm();
$('sheet').oncancel = (e) => { e.preventDefault(); closeSheet(); };
const NAV_ICONS = { home: 'home', moves: 'list', reports: 'chart', plans: 'target' };
for (const b of document.querySelectorAll('[data-tab]')) {
  b.prepend(icon(NAV_ICONS[b.dataset.tab], 22));
  b.onclick = () => go(b.dataset.tab);
}
plugins?.App.addListener('backButton', () => {
  if (window.locked) plugins.App.exitApp();
  else if ($('viewer').open) $('viewer').close();
  else if ($('sheet').open) closeSheet();
  else if (tab !== 'home') go('home');
  else plugins.App.exitApp();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('sheet').open) { render(true); window.syncNotices?.(); } });

async function start() {
  try {
    prefs = L.prefs(await store.get('prefs'));
    applyPrefs();
    try { await window.gate?.(); } catch (e) { window.lockBroken = true; throw e; } // bloquea antes de leer nada
    const saved = await store.get(KEY);
    if (saved) data = L.load(saved);
    else {
      // Primera vez en la versión 2: pasa los datos de la 1. La clave vieja se conserva intacta.
      const old = await store.get(OLD_KEY);
      if (old) { data = L.load(old); await store.set(KEY, JSON.stringify(data)); }
    }
    cur = prefs.start;
    ready = true;
    render();
    window.afterStart?.();
    window.syncNotices?.();
  } catch (e) {
    // No tocar datos ilegibles: se bloquea la app para no sobrescribirlos.
    console.error(e);
    $('add').disabled = true;
    for (const b of document.querySelectorAll('[data-tab]')) b.disabled = true;
    if (window.lockBroken) { $('view').replaceChildren(empty('No pude leer el bloqueo. No se borró nada. Cierra la app y vuelve a abrirla.')); return; }
    const raw = await store.get(KEY).catch(() => null);
    $('view').replaceChildren(empty('No pude leer tus datos guardados. No se borró nada.'),
      button('Recuperar una copia', () => { window.skipLock = true; $('file').click(); }),
      raw ? button('Guardar los datos dañados para revisarlos', () => shareFile('chelitos-danado.txt', raw, 'text/plain')) : null);
  }
}
// Espera a que carguen todas las partes antes de dibujar.
window.addEventListener('DOMContentLoaded', start);
