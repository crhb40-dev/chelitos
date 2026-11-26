// Ajustes: grupos en tarjetas, como en los ajustes del teléfono.
const openParts = {}; // grupos desplegados (secciones del inicio, categorías)
const chevron = ({ open, danger, title, ...rest }) => line({ ...rest, title: danger ? el('span', { className: 'neg', textContent: title }) : title, value: '›', valueClass: open ? 'chev open' : 'chev' });
const group = (title, ...rows) => [el('h2', { className: 'group', textContent: title }), el('div', { className: 'card list' }, ...rows.flat().filter(Boolean))];
// Interruptor de sí/no.
const switchRow = (label, on, onclick) => el('button', { type: 'button', className: 'switchrow', role: 'switch', ariaChecked: String(on), onclick },
  el('span', { textContent: label }), el('i', { className: 'switch', ariaHidden: 'true' }));
const flip = (key) => { openParts[key] = !openParts[key]; render(true); };

function homeOrder() {
  const set = async (change) => { await savePrefs(change); render(true); };
  const move = (i, step) => { const order = [...prefs.order]; [order[i], order[i + step]] = [order[i + step], order[i]]; set({ order }); };
  const arrow = (textContent, ariaLabel, disabled, onclick) => el('button', { className: 'mini', textContent, ariaLabel, disabled, onclick });
  return el('div', { className: 'nested' }, ...prefs.order.map((id, i) => {
    const name = homeBlocks[id][0], off = prefs.off.includes(id);
    return el('div', { className: 'order' }, el('span', { textContent: name, className: off ? 'dim' : '' }),
      arrow('↑', `Subir ${name}`, i === 0, () => move(i, -1)),
      arrow('↓', `Bajar ${name}`, i === prefs.order.length - 1, () => move(i, 1)),
      el('button', { className: 'mini wideb', textContent: off ? 'Mostrar' : 'Ocultar', ariaLabel: `${off ? 'Mostrar' : 'Ocultar'} ${name}`,
        onclick: () => set({ off: off ? prefs.off.filter((x) => x !== id) : [...prefs.off, id] }) }));
  }));
}

function currencyToggles() {
  return el('div', { className: 'field choice', role: 'group', ariaLabel: 'Monedas que usas' }, 'Monedas que usas (puedes elegir varias)',
    el('div', { className: 'seg checks' }, ...Object.entries(CUR).map(([k, [name]]) => el('button', { type: 'button', textContent: `${prefs.currencies.includes(k) ? '✓ ' : ''}${name}`, ariaPressed: String(prefs.currencies.includes(k)),
      onclick: async () => {
        const on = prefs.currencies.includes(k);
        if (on && prefs.currencies.length === 1) { toast('Deja al menos una moneda.'); return; }
        const currencies = Object.keys(CUR).filter((c) => (c === k ? !on : prefs.currencies.includes(c)));
        const start = currencies.includes(prefs.start) ? prefs.start : currencies[0];
        await savePrefs({ currencies, start });
        if (!currencies.includes(cur)) cur = start;
        render(true);
      } }))));
}

function swatches() {
  return el('div', { className: 'field choice', role: 'group', ariaLabel: 'Color principal' }, 'Color',
    el('div', { className: 'dots' }, ...L.ACCENTS.map(([color, name]) => {
      const b = el('button', { type: 'button', ariaLabel: name, ariaPressed: String(prefs.accent === color), onclick: async () => { await savePrefs({ accent: color }); render(true); } });
      b.style.background = color;
      return b;
    })));
}

function notifyRows() {
  if (!notifier) return null;
  const yesNo = (label, key) => switchRow(label, prefs.notify[key], () => setNotify({ [key]: !prefs.notify[key] }));
  return group('Notificaciones',
    yesNo('Avisar pagos fijos (el día antes y el mismo día, 9:00)', 'payments'),
    yesNo('Recordatorio diario para anotar', 'daily'),
    prefs.notify.daily ? chevron({ lead: badge('bell', '#c98500'), title: 'Hora del recordatorio', sub: prefs.notify.time, onclick: timeForm }) : null);
}

function securityRows() {
  const pin = bioPlugin ? 'PIN o huella' : 'PIN';
  if (!lockData) {
    return group('Seguridad', chevron({ lead: badge('lock', '#3987e5'), title: `Activar bloqueo con ${pin}`,
      sub: canFace ? `Pide tu PIN al abrir. Después puedes usar ${FACE}.` : 'Pide tu PIN al abrir la app', onclick: lockForm }));
  }
  return group('Seguridad',
    chevron({ lead: badge('lock', '#3987e5'), title: `Cambiar ${pin}`, sub: 'Bloqueo activado', onclick: lockForm }),
    canFace ? chevron({ lead: badge('face', '#9085e9'), title: lockData.face ? `Quitar ${FACE}` : `Usar ${FACE}`,
      sub: lockData.face ? 'Activado' : 'Desbloquea sin escribir el PIN', onclick: lockData.face ? disableFace : enableFace }) : null,
    choice('Pedir el bloqueo', prefs.lockAfter, [[0, 'Al salir'], [60, '1 minuto'], [300, '5 minutos']], 'lockAfter'),
    chevron({ lead: badge('lock', '#e66767'), title: 'Quitar bloqueo', danger: true, onclick: removeLockForm }));
}

screens.settings = (view) => {
  const n = prefs.order.length, hidden = prefs.off.length;
  const rates = Object.entries(prefs.rates).map(([k, v]) => `${CUR[k][1]}1 = $${v}`).join(' · ');
  const income = data.categories.filter((c) => c.type === 'in').length;
  view.append(
    el('div', { className: 'head' }, el('h1', { textContent: 'Ajustes' }), button('Listo', () => go('home'), 'link')),
    el('button', { className: 'card profile', onclick: nameForm },
      el('span', { className: 'avatar', textContent: prefs.name ? prefs.name[0].toUpperCase() : 'Tú' }),
      el('span', { className: 'mid' }, el('b', { textContent: prefs.name || 'Pon tu nombre' }), el('small', { textContent: 'Aparece en el inicio. Toca para cambiarlo.' })),
      el('span', { className: 'chev', textContent: '›' })),

    ...group('Apariencia',
      choice('Tema', prefs.theme, [['dark', 'Oscuro'], ['light', 'Claro']], 'theme'),
      swatches(),
      choice('Tamaño de letra', prefs.size, [[1, 'Normal'], [1.15, 'Grande'], [1.3, 'Muy grande']], 'size'),
      switchRow('Animaciones', prefs.motion, async () => { await savePrefs({ motion: !prefs.motion }); render(true); })),

    ...group('Inicio',
      chevron({ lead: badge('list', '#3987e5'), title: 'Secciones del inicio', sub: `${hidden ? `${hidden} ocultas · ` : ''}Ordénalas u ocúltalas. Las vacías no se muestran.`,
        open: openParts.blocks, onclick: () => flip('blocks') }),
      openParts.blocks ? homeOrder() : null),

    ...group('Monedas', currencyToggles(),
      choice('Moneda al abrir', prefs.start, prefs.currencies.map((k) => [k, CUR[k][0]]), 'start'),
      chevron({ lead: badge('swap', '#c98500'), title: 'Tasas de cambio', sub: rates || 'Para ver todo junto en pesos', onclick: ratesForm })),

    ...group('Cuentas',
      data.accounts.map((a) => chevron({ lead: badge(KIND[a.kind][1], KIND[a.kind][2]), title: a.name, sub: [a.name !== KIND[a.kind][0] && KIND[a.kind][0], CUR[a.currency][0]].filter(Boolean).join(' · '), onclick: () => accountForm(a) })),
      chevron({ lead: badge('plus', '#199e70'), title: 'Nueva cuenta', onclick: () => accountForm() })),

    ...group('Categorías',
      chevron({ lead: badge('dots', '#d55181'), title: 'Tus categorías', sub: `${data.categories.length - income} de gastos · ${income} de entradas`,
        open: openParts.cats, onclick: () => flip('cats') }),
      openParts.cats ? el('div', { className: 'catgrid' },
        ...[['out', 'Gastos'], ['in', 'Entradas']].flatMap(([type, title]) => [el('p', { className: 'gridlabel', textContent: title }),
          ...data.categories.filter((c) => c.type === type).map((c) => el('button', { type: 'button', onclick: () => categoryForm(c) }, badge(c.icon, c.color), c.name))]),
        el('button', { type: 'button', onclick: () => categoryForm() }, badge('plus', '#199e70'), 'Nueva')) : null),

    ...securityRows(),
    ...(notifyRows() || []),

    ...group('Tus datos',
      chevron({ lead: badge('download', '#199e70'), title: 'Guardar copia', sub: prefs.lastBackup ? `Última: ${dayName(prefs.lastBackup)}` : 'Todavía no has guardado una', onclick: exportBackup }),
      chevron({ lead: badge('upload', '#3987e5'), title: 'Recuperar copia', sub: 'Reemplaza lo que hay ahora', onclick: () => { window.skipLock = true; $('file').click(); } }),
      chevron({ lead: badge('file', '#c98500'), title: 'Exportar a Excel (CSV)', onclick: () => shareFile(`chelitos-${L.today()}.csv`, L.csv(data), 'text/csv') })),
    el('p', { className: 'dim note', textContent: 'Las fotos de recibos no van en la copia.' }),

    ...group('Ayuda', chevron({ lead: badge('help', '#9085e9'), title: 'Ver la guía', onclick: guide })),
    el('p', { className: 'dim foot', textContent: 'Chelitos · tus datos se guardan solo en este teléfono' }));
};
