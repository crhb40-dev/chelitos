(function (root) {
  const MAX = 99999999999; // centavos
  const GRAY = '#8B8F99';
  // Paleta validada para fondo oscuro (separable con daltonismo, junto a etiquetas).
  const COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767', GRAY];
  // Categorías que el sistema necesita; no se borran.
  const FIXED = ['otro', 'ingreso', 'deudas', 'cobros'];

  function defaultData() {
    const cat = (id, name, type, icon, color) => ({ id, name, type, icon, color, budget: 0, budgetUsd: 0, budgetEur: 0 });
    return {
      app: 'dinero', version: 2,
      accounts: [{ id: 'cash', name: 'Efectivo', kind: 'cash', initial: 0, currency: 'peso' }],
      categories: [
        cat('casa', 'Casa', 'out', 'home', COLORS[0]), cat('comida', 'Comida', 'out', 'food', COLORS[1]),
        cat('transporte', 'Transporte', 'out', 'car', COLORS[2]), cat('servicios', 'Servicios', 'out', 'bolt', COLORS[3]),
        cat('ropa', 'Ropa', 'out', 'shirt', COLORS[4]), cat('salud', 'Salud', 'out', 'heart', COLORS[7]),
        cat('ocio', 'Diversión', 'out', 'game', COLORS[6]), cat('deudas', 'Deudas', 'out', 'card', COLORS[5]),
        cat('otro', 'Otro', 'out', 'dots', GRAY),
        cat('ingreso', 'Ingreso', 'in', 'cash', COLORS[5]), cat('sueldo', 'Sueldo', 'in', 'work', COLORS[0]),
        cat('venta', 'Venta', 'in', 'cart', COLORS[3]), cat('cobros', 'Cobros', 'in', 'card', COLORS[2]),
      ],
      movements: [], goals: [], recurring: [], debts: [], favorites: [],
    };
  }

  function parseAmount(str, { zero = false, negative = false } = {}) {
    let s = String(str).replace(/[$\s]/g, '');
    const sign = negative && s.startsWith('-') ? -1 : 1;
    if (sign < 0) s = s.slice(1);
    // coma = miles, punto = decimales; "12,50" se rechaza para no leerlo como 1250
    if (!/^(\d+|\d{1,3}(,\d{3})+)(\.\d{1,2})?$/.test(s)) return null;
    const cents = Math.round(Number(s.replace(/,/g, '')) * 100);
    return cents <= MAX && (cents > 0 || (zero && cents === 0)) ? sign * cents || 0 : null;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parts = (s) => s.split('-').map(Number);
  function shiftMonth(month, n) {
    const [y, m] = parts(month);
    return today(new Date(y, m - 1 + n, 1)).slice(0, 7);
  }
  const monthDays = (month) => { const [y, m] = parts(month); return new Date(y, m, 0).getDate(); };

  // freq: 'week' | 'half' (días 15 y último) | 'month' (mismo día, o el último si no existe)
  function nextDate(date, freq, day) {
    const [y, m, d] = parts(date);
    if (freq === 'week') return today(new Date(y, m - 1, d + 7));
    const month = date.slice(0, 7), last = monthDays(month);
    if (freq === 'half') {
      if (d < 15) return `${month}-15`;
      return d < last ? `${month}-${last}` : `${shiftMonth(month, 1)}-15`;
    }
    const next = shiftMonth(month, 1);
    return `${next}-${pad(Math.min(day || d, monthDays(next)))}`;
  }

  const isDate = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s);
  const isCents = (n, min = 1) => Number.isInteger(n) && n >= min && n <= MAX;
  const isText = (s) => typeof s === 'string';
  const KINDS = ['cash', 'bank', 'card'];

  // Cada moneda guarda su límite mensual en un campo propio de la categoría.
  const BUDGET = { peso: 'budget', usd: 'budgetUsd', eur: 'budgetEur' };
  const CURRENCIES = Object.keys(BUDGET);
  const curOf = (d, id) => d.accounts.find((a) => a.id === id)?.currency;

  // Datos guardados antes de tener otras monedas: todo era en pesos.
  function fill(d) {
    d.favorites ??= []; // gastos frecuentes
    for (const k of ['accounts', 'goals', 'debts']) for (const x of d[k] || []) if (x) x.currency ??= 'peso';
    for (const c of d.categories || []) if (c) for (const k of Object.values(BUDGET)) c[k] ??= 0;
    return d;
  }

  function check(d) {
    const lists = ['accounts', 'categories', 'movements', 'goals', 'recurring', 'debts', 'favorites'];
    if (d.app !== 'dinero' || d.version !== 2 || !lists.every((k) => Array.isArray(d[k]) &&
      d[k].every((x) => x && isText(x.id)) && new Set(d[k].map((x) => x.id)).size === d[k].length)) return false;
    const acc = new Set(d.accounts.map((a) => a.id));
    const cats = new Map(d.categories.map((c) => [c.id, c]));
    const debts = new Map(d.debts.map((x) => [x.id, x]));
    const money = (x) => CURRENCIES.includes(x.currency);
    const transfer = (x) => isCents(x.amount) && acc.has(x.account) && acc.has(x.to) && x.to !== x.account &&
      (curOf(d, x.account) === curOf(d, x.to) ? x.received === undefined : isCents(x.received));
    const entry = (x) => isCents(x.amount) && acc.has(x.account) && cats.get(x.category)?.type === x.type;
    return d.accounts.length > 0 && FIXED.every((id) => cats.has(id)) &&
      d.accounts.every((a) => isText(a.name) && KINDS.includes(a.kind) && isCents(a.initial, -MAX) && money(a)) &&
      d.goals.every(money) && d.debts.every(money) &&
      d.categories.every((c) => isText(c.name) && (c.type === 'in' || c.type === 'out') && isText(c.icon) &&
        /^#[0-9a-fA-F]{6}$/.test(c.color) && Object.values(BUDGET).every((k) => isCents(c[k], 0))) &&
      d.movements.every((x) => isDate(x.date) && isText(x.note) &&
        (x.debt === undefined || debts.get(x.debt)?.currency === curOf(d, x.account)) &&
        (x.type === 'transfer' ? transfer(x) : entry(x))) &&
      d.favorites.every((f) => isText(f.name) && entry(f)) &&
      d.goals.every((g) => isText(g.name) && isCents(g.target) && isCents(g.saved, 0)) &&
      d.recurring.every((r) => isText(r.name) && entry(r) && ['week', 'half', 'month'].includes(r.freq) &&
        Number.isInteger(r.day) && isDate(r.next)) &&
      d.debts.every((x) => isText(x.name) && (x.dir === 'owe' || x.dir === 'owed') && isCents(x.total) && isCents(x.paid, 0));
  }

  function migrate(v1) {
    const d = defaultData();
    const known = { Casa: 'casa', Comida: 'comida', Transporte: 'transporte' };
    d.movements = v1.movements.map((x) => ({
      id: x.id, type: x.type, amount: x.amount, account: 'cash',
      category: x.type === 'in' ? 'ingreso' : known[x.category] || 'otro', note: x.note, date: x.date,
    }));
    return d;
  }

  // Lee datos guardados o una copia (versión 1 o 2). Lanza error si no son válidos.
  function load(text) {
    let d;
    try {
      d = JSON.parse(text);
      if (d && d.app === 'dinero' && d.version === undefined && Array.isArray(d.movements)) d = migrate(d);
      if (!d || !check(fill(d))) throw new Error();
    } catch {
      throw new Error('Esos datos no son de esta app o están dañados.');
    }
    return d;
  }

  const newest = (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id);

  // total = suma de las cuentas de esa moneda; nunca se mezclan.
  function balances(d, currency = 'peso') {
    const byAccount = Object.fromEntries(d.accounts.map((a) => [a.id, a.initial]));
    for (const x of d.movements) {
      byAccount[x.account] += x.type === 'in' ? x.amount : -x.amount;
      if (x.type === 'transfer') byAccount[x.to] += x.received ?? x.amount;
    }
    const total = d.accounts.reduce((sum, a) => sum + (a.currency === currency ? byAccount[a.id] : 0), 0);
    return { byAccount, total };
  }

  // Lo que pertenece a una moneda. Un cambio de moneda aparece en las dos.
  function view(d, currency) {
    const mine = (id) => curOf(d, id) === currency;
    return {
      ...d,
      accounts: d.accounts.filter((a) => a.currency === currency),
      movements: d.movements.filter((x) => mine(x.account) || (x.type === 'transfer' && mine(x.to))),
      recurring: d.recurring.filter((x) => mine(x.account)),
      favorites: d.favorites.filter((x) => mine(x.account)),
      goals: d.goals.filter((x) => x.currency === currency),
      debts: d.debts.filter((x) => x.currency === currency),
      categories: d.categories.map((c) => ({ ...c, budget: c[BUDGET[currency]] })),
    };
  }

  function summary(d, month) {
    const items = d.movements.filter((x) => x.date.startsWith(month)).sort(newest);
    let income = 0, expense = 0;
    const cats = {};
    for (const x of items) {
      if (x.type === 'in') income += x.amount;
      else if (x.type === 'out') { expense += x.amount; cats[x.category] = (cats[x.category] || 0) + x.amount; }
    }
    const byCategory = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    return { income, expense, byCategory, items };
  }

  // Último mes que muestra un gráfico de n meses: solo cambia si el elegido queda fuera.
  function windowEnd(end, month, n) {
    if (!end || month > end) return month;
    return month < shiftMonth(end, 1 - n) ? shiftMonth(month, n - 1) : end;
  }

  const lastMonths = (d, end, n) => Array.from({ length: n }, (_, i) => {
    const month = shiftMonth(end, i - n + 1);
    const { income, expense } = summary(d, month);
    return { month, income, expense };
  });

  // Gastos del mes según el tipo de cuenta (efectivo, tarjeta, banco).
  function spentByKind(d, month) {
    const kinds = new Map(d.accounts.map((a) => [a.id, a.kind])), total = {};
    for (const x of summary(d, month).items) {
      if (x.type === 'out') total[kinds.get(x.account)] = (total[kinds.get(x.account)] || 0) + x.amount;
    }
    return Object.entries(total).sort((a, b) => b[1] - a[1]);
  }

  const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function search(d, { text = '', category = '', account = '', from = '', to = '' } = {}) {
    const names = new Map(d.categories.map((c) => [c.id, c.name]));
    const q = plain(text.trim());
    return d.movements.filter((x) =>
      (!q || plain(`${x.note} ${names.get(x.category) || 'transferencia'}`).includes(q)) &&
      (!category || x.category === category) && (!account || x.account === account || x.to === account) &&
      (!from || x.date >= from) && (!to || x.date <= to)).sort(newest);
  }

  function budgets(d, month) {
    const spent = Object.fromEntries(summary(d, month).byCategory);
    return d.categories.filter((c) => c.type === 'out' && c.budget > 0).map((c) => {
      const used = spent[c.id] || 0, ratio = used / c.budget;
      return { id: c.id, spent: used, limit: c.budget, ratio, level: ratio > 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok' };
    }).sort((a, b) => b.ratio - a.ratio);
  }

  const debtPaid = (d, debt) => d.movements.reduce((sum, x) => sum + (x.debt === debt.id ? x.amount : 0), debt.paid);

  function payRecurring(d, id, now, newId) {
    const r = d.recurring.find((x) => x.id === id);
    d.movements.push({
      id: newId, type: r.type, amount: r.amount, account: r.account, category: r.category,
      note: r.name, date: r.next < now ? r.next : now,
    });
    r.next = nextDate(r.next, r.freq, r.day);
  }

  function removeCategory(d, id) {
    if (FIXED.includes(id)) throw new Error('Esa categoría no se puede borrar.');
    const other = d.categories.find((c) => c.id === id).type === 'in' ? 'ingreso' : 'otro';
    for (const x of [...d.movements, ...d.recurring, ...d.favorites]) if (x.category === id) x.category = other;
    d.categories = d.categories.filter((c) => c.id !== id);
  }

  function removeAccount(d, id) {
    if (d.accounts.length === 1) throw new Error('Necesitas al menos una cuenta.');
    if ([...d.movements, ...d.recurring, ...d.favorites].some((x) => x.account === id || x.to === id)) {
      throw new Error('Esa cuenta tiene movimientos, pagos fijos o frecuentes. Cámbialos o bórralos primero.');
    }
    d.accounts = d.accounts.filter((a) => a.id !== id);
  }

  // Teclas del teclado propio: dígitos, punto y borrar.
  function keypad(value, key) {
    if (key === '⌫') return value.slice(0, -1);
    if (key === '.') return value.includes('.') ? value : (value || '0') + '.';
    const next = value === '0' ? key : value + key;
    return /^\d{0,9}(\.\d{0,2})?$/.test(next) ? next : value;
  }

  const ACCENTS = [['#C6F24E', 'Lima'], ['#7CC4FF', 'Azul'], ['#C4B0FF', 'Morado'], ['#FF9EC8', 'Rosa'], ['#FFB35C', 'Naranja']];
  const BLOCKS = ['today', 'favorites', 'total', 'accounts', 'spending', 'budgets', 'upcoming', 'recent']; // secciones del inicio

  // Preferencias de la persona. No van en la copia; si están dañadas se usan las de fábrica.
  function prefs(text) {
    let p;
    try { p = JSON.parse(text); } catch { p = null; }
    p = p && typeof p === 'object' && !Array.isArray(p) ? p : {};
    const blocks = (list) => [...new Set(Array.isArray(list) ? list : [])].filter((b) => BLOCKS.includes(b));
    const order = blocks(p.order);
    BLOCKS.forEach((b, i) => { if (!order.includes(b)) order.splice(i, 0, b); }); // las nuevas entran en su sitio
    const shown = CURRENCIES.filter((c) => !Array.isArray(p.currencies) || p.currencies.includes(c));
    const currencies = shown.length ? shown : CURRENCIES;
    const rates = Object.fromEntries(Object.entries(p.rates || {}).filter(([k, v]) => (k === 'usd' || k === 'eur') && Number.isFinite(v) && v > 0 && v < 1e6));
    return {
      name: typeof p.name === 'string' ? p.name.trim().slice(0, 20) : '',
      theme: p.theme === 'light' ? 'light' : 'dark',
      currencies, start: currencies.includes(p.start) ? p.start : currencies[0], rates,
      size: [1, 1.15, 1.3].includes(p.size) ? p.size : 1,
      motion: p.motion !== false,
      lockAfter: [0, 60, 300].includes(p.lockAfter) ? p.lockAfter : 60,
      lastBackup: isDate(p.lastBackup) ? p.lastBackup : '',
      seen: p.seen === true,
      accent: ACCENTS.some(([c]) => c === p.accent) ? p.accent : ACCENTS[0][0],
      hidden: p.hidden === true,
      order,
      off: blocks(p.off),
      last: p.last && typeof p.last === 'object' ? p.last : {},
    };
  }

  function calendar(d, month) {
    const [y, mm] = parts(month);
    const days = Array.from({ length: monthDays(month) }, (_, i) => ({ date: `${month}-${pad(i + 1)}`, income: 0, expense: 0 }));
    for (const x of summary(d, month).items) {
      const day = days[Number(x.date.slice(8)) - 1];
      if (day && x.type === 'in') day.income += x.amount;
      else if (day && x.type === 'out') day.expense += x.amount;
    }
    return { offset: (new Date(y, mm - 1, 1).getDay() + 6) % 7, days };
  }

  // Gastos de este mes hasta hoy frente a los mismos días del mes anterior.
  function compare(d, now) {
    const month = now.slice(0, 7), previous = shiftMonth(month, -1), day = Number(now.slice(8));
    const upTo = (m) => {
      const last = Math.min(day, monthDays(m));
      // Si hoy es fin de mes, se compara con el mes anterior completo.
      const limit = day === monthDays(month) ? monthDays(m) : last;
      return summary({ ...d, movements: d.movements.filter((x) => Number(x.date.slice(8)) <= limit) }, m);
    };
    const a = upTo(month), b = upTo(previous), old = Object.fromEntries(b.byCategory);
    const rises = a.byCategory.map(([id, v]) => [id, v - (old[id] || 0)]).filter((x) => x[1] > 0).sort((x, y) => y[1] - x[1]);
    return { now: a.expense, before: b.expense, top: rises[0] || null };
  }

  // Lo que queda hoy repartiendo los límites del mes entre los días que faltan. null = sin límites.
  function dailyAllowance(d, now) {
    const month = now.slice(0, 7), limits = d.categories.filter((c) => c.type === 'out' && c.budget > 0);
    if (!limits.length) return null;
    let free = 0, spentToday = 0;
    for (const c of limits) {
      let before = 0;
      for (const x of d.movements) {
        if (x.type !== 'out' || x.category !== c.id || !x.date.startsWith(month)) continue;
        if (x.date === now) spentToday += x.amount; else if (x.date < now) before += x.amount;
      }
      free += Math.max(0, c.budget - before);
    }
    const left = monthDays(month) - Number(now.slice(8)) + 1;
    return Math.max(0, Math.floor(free / left) - spentToday);
  }

  // rates: cuántos pesos vale 1 unidad. Las monedas con saldo y sin tasa quedan fuera y se avisan.
  function totalPesos(d, rates) {
    let total = balances(d, 'peso').total;
    const missing = [];
    for (const c of ['usd', 'eur']) {
      const value = balances(d, c).total;
      if (!value) continue;
      if (rates[c]) total += Math.round(value * rates[c]); else missing.push(c);
    }
    return { total, missing };
  }

  const daysBetween = (a, b) => Math.round((Date.UTC(...ymd(b)) - Date.UTC(...ymd(a))) / 864e5);
  const ymd = (s) => { const [y, m, d] = parts(s); return [y, m - 1, d]; };
  function reminders(d, lastBackup, now) {
    const last = d.movements.reduce((max, x) => (x.date > max && x.date <= now ? x.date : max), '');
    const idle = last ? daysBetween(last, now) : 0;
    return { backup: d.movements.length >= 5 && (!lastBackup || daysBetween(lastBackup, now) >= 14), idle: idle >= 3 ? idle : 0 };
  }

  function csv(d) {
    const name = (list, id) => list.find((x) => x.id === id)?.name || '';
    // El apóstrofo evita que Excel ejecute como fórmula un texto escrito por la persona.
    const text = (s) => `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
    const num = (c) => (c / 100).toFixed(2);
    const TYPES = { in: 'Entrada', out: 'Gasto', transfer: 'Transferencia' };
    const rows = [...d.movements].sort(newest).map((x) => [x.date, TYPES[x.type], text(name(d.categories, x.category)), text(x.note),
      text(name(d.accounts, x.account)), curOf(d, x.account), num(x.amount), x.to ? text(name(d.accounts, x.to)) : '', x.received ? num(x.received) : ''].join(','));
    return '\ufeff' + ['Fecha,Tipo,Categoría,Nota,Cuenta,Moneda,Monto,Hacia,Recibido', ...rows].join('\r\n');
  }

  const api = {
    calendar, compare, dailyAllowance, totalPesos, reminders, csv,
    keypad, ACCENTS, BLOCKS, prefs,
    COLORS, FIXED, defaultData, parseAmount, today, shiftMonth, nextDate, load, balances, summary,
    BUDGET, view, curOf, spentByKind, windowEnd, lastMonths, search, budgets, debtPaid, payRecurring, removeCategory, removeAccount,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Logic = api;
})(this);
