// Bloqueo con PIN y huella. Tapa la pantalla; no cifra los datos.
const LOCK = 'lock';
const bioPlugin = plugins?.BiometricAuthNative;
let lockData = null, asking = false, hiddenAt = 0;

async function pinHash(salt, pin) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + pin));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Devuelve un texto de error, o nada si el PIN es correcto. Tras 5 fallos obliga a esperar.
async function tryPin(pin) {
  const wait = Math.ceil((lockData.until - Date.now()) / 1000);
  if (wait > 0) return `Demasiados intentos. Espera ${Math.min(wait, 30)} segundos.`;
  const ok = await pinHash(lockData.salt, pin) === lockData.hash;
  lockData.fails = ok ? 0 : lockData.fails + 1;
  if (lockData.fails >= 5) { lockData.fails = 0; lockData.until = Date.now() + 30000; }
  await store.set(LOCK, JSON.stringify(lockData));
  if (!ok) return 'PIN incorrecto.';
}

function unlock() {
  $('lock')?.remove();
  window.locked = false;
  $('view').inert = $('nav').inert = false;
}

async function fingerprint() {
  if (asking || !window.locked) return;
  asking = true;
  try {
    await bioPlugin.internalAuthenticate({ androidTitle: 'Desbloquear Dinero', cancelTitle: 'Usar PIN', allowDeviceCredential: false });
    unlock();
  } catch (e) { console.warn(e.message); }
  asking = false;
}

function lockNow() {
  if (!lockData || window.locked) return;
  window.locked = true;
  if ($('sheet').open) $('sheet').close();
  $('view').inert = $('nav').inert = true;
  const input = el('input', { type: 'password', inputMode: 'numeric', maxLength: 6, ariaLabel: 'PIN', placeholder: 'PIN', autocomplete: 'off' });
  const error = el('p', { className: 'error', role: 'alert' });
  const form = el('form', { onsubmit: async (e) => {
    e.preventDefault();
    const problem = await tryPin(input.value);
    if (problem) { error.textContent = problem; input.value = ''; } else unlock();
  } }, badge('home', '#C6F24E'), el('h2', { textContent: 'Dinero está bloqueado' }), input, error,
    el('button', { className: 'primary', textContent: 'Desbloquear' }),
    lockData.bio && bioPlugin ? button('Usar huella', fingerprint) : null);
  document.body.append(el('div', { id: 'lock' }, form));
  if (lockData.bio && bioPlugin) fingerprint();
}

window.gate = async () => {
  const saved = await store.get(LOCK);
  if (saved) { lockData = JSON.parse(saved); lockNow(); }
};

// Vuelve a bloquear si la app estuvo más de un minuto en segundo plano.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 60000) lockNow();
});

async function lockForm() {
  let hasBio = false;
  try { hasBio = Boolean(bioPlugin && (await bioPlugin.checkBiometry()).isAvailable); } catch (e) { console.warn(e.message); }
  openForm({
    title: lockData ? 'Cambiar bloqueo' : 'Activar bloqueo',
    values: { bio: hasBio && (lockData ? lockData.bio : true) ? 'yes' : 'no' },
    fields: [
      { key: 'old', label: 'PIN actual', type: 'pin', show: () => Boolean(lockData) },
      { key: 'pin', label: 'PIN nuevo (4 a 6 números). Si lo olvidas no se puede recuperar: guarda una copia.', type: 'pin' },
      { key: 'again', label: 'Repite el PIN', type: 'pin' },
      { key: 'bio', label: 'Usar huella', type: 'seg', titled: true, options: [['yes', 'Sí'], ['no', 'No']], show: () => hasBio },
    ],
    onSave: async (v) => {
      if (lockData) { const problem = await tryPin(v.old); if (problem) return problem; }
      if (!/^\d{4,6}$/.test(v.pin)) return 'El PIN debe tener de 4 a 6 números.';
      if (v.pin !== v.again) return 'Los dos PIN no coinciden.';
      const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
      const next = { salt, hash: await pinHash(salt, v.pin), bio: hasBio && v.bio === 'yes', fails: 0, until: 0 };
      try { await store.set(LOCK, JSON.stringify(next)); } catch { return 'No se pudo guardar.'; }
      lockData = next;
      render(true);
      toast('Bloqueo guardado');
    },
    onDelete: lockData && (async (v) => {
      const problem = await tryPin(v.old);
      if (problem) return problem === 'PIN incorrecto.' ? 'Escribe tu PIN actual para quitar el bloqueo.' : problem;
      await store.remove(LOCK);
      lockData = null;
      render(true);
      toast('Bloqueo quitado');
    }),
    deleteText: 'Quitar bloqueo',
  });
}

settingsSections.push((view) => view.append(section('Seguridad'),
  el('div', {}, button(lockData ? 'Cambiar o quitar el bloqueo' : `Activar bloqueo con PIN${bioPlugin ? ' o huella' : ''}`, lockForm))));
