// Presupuestos, pagos fijos, metas y deudas.
const FREQ = { week: 'Cada semana', half: 'Quincenal (15 y fin de mes)', month: 'Cada mes' };
const BAD_AMOUNT = 'Escribe un monto mayor que 0.';
const drop = (key, id, done) => () => update((d) => { d[key] = d[key].filter((x) => x.id !== id); }, done);

/* ---------- Presupuestos ---------- */
function budgetForm(c) {
  const field = L.BUDGET[cur];
  openForm({
    title: c ? `Límite de ${c.name}` : 'Nuevo límite mensual',
    values: c ? { category: c.id, amount: asInput(c[field]) } : {},
    fields: [
      { key: 'category', label: 'Categoría', type: 'chips', options: categoryOptions('out'), show: () => !c },
      { key: 'amount', label: `Máximo a gastar cada mes (${symbol()})`, type: 'money' },
    ],
    onSave: (v) => {
      const amount = L.parseAmount(v.amount);
      if (!amount) return BAD_AMOUNT;
      return update((d) => { d.categories.find((x) => x.id === v.category)[field] = amount; }, 'Límite guardado');
    },
    onDelete: c && (() => update((d) => { d.categories.find((x) => x.id === c.id)[field] = 0; }, 'Límite quitado')),
    deleteText: 'Quitar límite',
  });
}

function budgetRow(b) {
  const c = category(b.id);
  const [text, tone, color] = b.level === 'over' ? [`⚠ Te pasaste por ${money(b.spent - b.limit)}`, 'neg', 'var(--coral)']
    : b.level === 'warn' ? [`⚠ Cerca del límite: quedan ${money(b.limit - b.spent)}`, 'warn', 'var(--warn)']
    : [`Quedan ${money(b.limit - b.spent)}`, 'dim', c.color];
  return el('div', {}, line({ lead: badge(c.icon, c.color), title: c.name, sub: `${money(b.spent)} de ${money(b.limit)}`, onclick: () => budgetForm(c) }),
    track(b.ratio, color), el('p', { className: tone + ' dim', textContent: text }));
}

/* ---------- Pagos fijos ---------- */
function recurringForm(r) {
  const first = data.accounts.find((a) => a.currency === cur);
  if (!r && !first) { toast(`Primero crea una cuenta en ${CUR[cur][0].toLowerCase()}.`); accountForm(); return; }
  openForm({
    title: r ? 'Editar pago fijo' : 'Nuevo pago fijo',
    values: r ? { ...r, amount: asInput(r.amount) } : { type: 'out', freq: 'month', account: first.id, next: L.today() },
    fields: [
      { key: 'type', label: 'Tipo', type: 'seg', options: [['out', 'Pago'], ['in', 'Cobro']] },
      { key: 'name', label: 'Nombre', type: 'text', placeholder: 'Ej. Alquiler, Sueldo' },
      { key: 'amount', label: (v) => `Monto (${symbol(curOf(v.account))})`, type: 'money' },
      { key: 'category', label: 'Categoría', type: 'chips', options: (v) => categoryOptions(v.type) },
      { key: 'account', label: 'Cuenta', type: 'select', options: () => accountOptions() },
      { key: 'freq', label: 'Se repite', type: 'select', options: Object.entries(FREQ) },
      { key: 'next', label: 'Próxima fecha', type: 'date' },
    ],
    onSave: (v) => {
      const amount = L.parseAmount(v.amount);
      if (!v.name.trim()) return 'Ponle un nombre.';
      if (!amount) return BAD_AMOUNT;
      if (!v.next) return 'Elige la próxima fecha.';
      // Si no cambias la fecha se conserva el día original (p. ej. 31 aunque este mes sea 28).
      const day = r && r.next === v.next ? r.day : Number(v.next.slice(8));
      return update((d) => upsert(d.recurring, { id: r?.id || uid(), name: v.name.trim(), type: v.type, amount, account: v.account, category: v.category, freq: v.freq, day, next: v.next }), 'Pago fijo guardado');
    },
    onDelete: r && drop('recurring', r.id, 'Pago fijo borrado'),
  });
}

async function pay(r) {
  if (!confirm(`¿Anotar ${r.name} por ${money(r.amount)}?`)) return;
  const problem = await update((d) => L.payRecurring(d, r.id, L.today(), uid()), 'Anotado. Se programó la siguiente fecha.');
  if (problem) toast(problem);
}

function recurringRow(r) {
  const c = category(r.category), late = r.next <= L.today();
  return el('div', { className: 'duo-row' },
    line({ lead: badge(c.icon, c.color), title: r.name, sub: `${money(r.amount)} · ${late ? '⚠ Toca anotar: ' : ''}${dayName(r.next)}`, onclick: () => recurringForm(r) }),
    button('Anotar', () => pay(r), 'chip'));
}
const upcoming = () => [...mine().recurring].sort((a, b) => a.next.localeCompare(b.next));

/* ---------- Metas ---------- */
function goalForm(g) {
  openForm({
    title: g ? 'Editar meta' : 'Nueva meta de ahorro',
    values: g ? { name: g.name, target: asInput(g.target), saved: asInput(g.saved) } : { saved: '0' },
    fields: [
      { key: 'name', label: 'Nombre', type: 'text', placeholder: 'Ej. Moto' },
      { key: 'target', label: `Quiero juntar (${symbol()})`, type: 'money' },
      { key: 'saved', label: `Ya tengo (${symbol()})`, type: 'money' },
    ],
    onSave: (v) => {
      const target = L.parseAmount(v.target), saved = L.parseAmount(v.saved, { zero: true });
      if (!v.name.trim()) return 'Ponle un nombre.';
      if (!target || saved === null) return 'Revisa los montos.';
      return update((d) => upsert(d.goals, { id: g?.id || uid(), name: v.name.trim(), target, saved, currency: g?.currency || cur }), 'Meta guardada');
    },
    onDelete: g && drop('goals', g.id, 'Meta borrada'),
  });
}

function goalDeposit(g) {
  openForm({
    title: g.name, save: 'Guardar',
    values: { dir: 'add' },
    fields: [
      { key: 'dir', label: 'Qué hacer', type: 'seg', options: [['add', 'Apartar'], ['take', 'Retirar']] },
      { key: 'amount', label: `Monto (${symbol()}). Solo lleva la cuenta, no mueve tus cuentas.`, type: 'money' },
    ],
    onSave: (v) => {
      const amount = L.parseAmount(v.amount);
      if (!amount) return BAD_AMOUNT;
      const saved = g.saved + (v.dir === 'add' ? amount : -amount);
      if (saved < 0) return `Solo tienes ${money(g.saved)} apartados.`;
      return update((d) => upsert(d.goals, { ...g, saved }), saved >= g.target ? '¡Meta cumplida!' : 'Guardado');
    },
    actions: [['Editar meta', () => goalForm(g)]],
  });
}

/* ---------- Deudas ---------- */
function debtForm(x) {
  openForm({
    title: x ? 'Editar deuda' : 'Nueva deuda',
    values: x ? { ...x, total: asInput(x.total), paid: asInput(x.paid) } : { dir: 'owe', paid: '0' },
    fields: [
      { key: 'dir', label: 'Tipo', type: 'seg', options: [['owe', 'Yo debo'], ['owed', 'Me deben']], show: () => !x },
      { key: 'name', label: 'A quién o de qué', type: 'text', placeholder: 'Ej. Juan, préstamo' },
      { key: 'total', label: `Total (${symbol()})`, type: 'money' },
      { key: 'paid', label: `Ya abonado antes, sin mover cuentas (${symbol()})`, type: 'money' },
    ],
    onSave: (v) => {
      const total = L.parseAmount(v.total), paid = L.parseAmount(v.paid, { zero: true });
      if (!v.name.trim()) return 'Ponle un nombre.';
      if (!total || paid === null) return 'Revisa los montos.';
      return update((d) => upsert(d.debts, { id: x?.id || uid(), name: v.name.trim(), dir: v.dir, total, paid, currency: x?.currency || cur }), 'Deuda guardada');
    },
    // Los movimientos ya anotados se conservan; solo se sueltan de la deuda.
    onDelete: x && (() => update((d) => {
      for (const m of d.movements) if (m.debt === x.id) delete m.debt;
      d.debts = d.debts.filter((y) => y.id !== x.id);
    }, 'Deuda borrada')),
  });
}

function debtPayment(x) {
  const left = x.total - L.debtPaid(data, x);
  if (left <= 0) { debtForm(x); return; }
  openForm({
    title: `Abono: ${x.name}`, save: 'Guardar abono',
    values: { account: mine().accounts[0]?.id || '', date: L.today() },
    fields: [
      { key: 'amount', label: `Monto (${symbol()}). Falta ${money(left)}`, type: 'money' },
      { key: 'account', label: x.dir === 'owe' ? 'Sale de' : 'Entra a', type: 'select', options: [...accountOptions(x.currency), ['', 'No mover ninguna cuenta']] },
      { key: 'date', label: 'Fecha', type: 'date', show: (v) => v.account !== '' },
    ],
    onSave: (v) => {
      const amount = L.parseAmount(v.amount);
      if (!amount) return BAD_AMOUNT;
      if (amount > left) return `El abono no puede pasar de ${money(left)}.`;
      if (v.account && !v.date) return 'Elige una fecha.';
      return update((d) => {
        if (!v.account) { d.debts.find((y) => y.id === x.id).paid += amount; return; }
        d.movements.push({ id: uid(), type: x.dir === 'owe' ? 'out' : 'in', category: x.dir === 'owe' ? 'deudas' : 'cobros', amount, account: v.account, note: x.name, date: v.date, debt: x.id });
      }, amount === left ? '¡Deuda saldada!' : 'Abono guardado');
    },
    actions: [['Editar deuda', () => debtForm(x)]],
  });
}

function debtRow(x) {
  const paid = L.debtPaid(data, x), left = x.total - paid, owe = x.dir === 'owe';
  return el('div', {}, line({ lead: badge('card', owe ? '#d95926' : '#199e70'), title: x.name, sub: `${owe ? 'Debes' : 'Te deben'} · abonado ${money(paid)} de ${money(x.total)}`, value: left > 0 ? money(left) : 'Saldada', onclick: () => debtPayment(x) }),
    track(paid / x.total, owe ? '#d95926' : '#199e70'));
}

/* ---------- Pantalla e inicio ---------- */
screens.plans = (view) => {
  const block = (title, action, add, rows, none) => view.append(section(title, rows.length ? action : '', add),
    el('div', { className: 'card' }, ...(rows.length ? rows : [empty(none), button(`Crear ${action.slice(2).toLowerCase()}`, add, 'wide add')])));
  const here = mine();
  view.append(el('div', { className: 'head' }, el('h1', { textContent: 'Planes' })), curSwitch());
  block('Presupuestos del mes', '+ Límite', () => budgetForm(), L.budgets(here, L.today().slice(0, 7)).map(budgetRow), 'Pon un límite a una categoría y te aviso cuando te acerques.');
  block('Pagos fijos', '+ Pago', () => recurringForm(), upcoming().map(recurringRow), 'Alquiler, internet o sueldo: anótalos con un toque.');
  block('Metas de ahorro', '+ Meta', () => goalForm(), here.goals.map((g) => el('div', {},
    line({ lead: badge('gift', '#9085e9'), title: g.name, sub: g.saved >= g.target ? 'Cumplida' : `Faltan ${money(g.target - g.saved)}`, value: `${Math.floor(g.saved * 100 / g.target)}%`, onclick: () => goalDeposit(g) }),
    track(g.saved / g.target, '#9085e9'), el('p', { className: 'dim', textContent: `${money(g.saved)} de ${money(g.target)}` }))), 'Crea una meta y mira cuánto te falta.');
  block('Deudas', '+ Deuda', () => debtForm(), here.debts.map(debtRow), 'Apunta lo que debes y lo que te deben.');
};

homeBlocks.budgets = ['Presupuestos', (view, { here }) => {
  const budgets = L.budgets(here, L.today().slice(0, 7)).slice(0, 3);
  if (budgets.length) view.append(section('Presupuestos', 'Ver planes', () => go('plans')), el('div', { className: 'card' }, ...budgets.map(budgetRow)));
}];

homeBlocks.upcoming = ['Próximos pagos', (view) => {
  const next = upcoming().slice(0, 3);
  if (next.length) view.append(section('Próximos pagos', 'Ver planes', () => go('plans')), el('div', { className: 'card' }, ...next.map(recurringRow)));
}];
