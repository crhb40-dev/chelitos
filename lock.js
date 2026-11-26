// Bloqueo con PIN, huella (Android) o Face ID (web). Tapa la pantalla; no cifra los datos.
const LOCK = 'lock';
const bioPlugin = plugins?.BiometricAuthNative;
let lockData = null, asking = false, hiddenAt = 0, canFace = false;
const FACE = /iPhone|iPad/.test(navigator.userAgent) ? 'Face ID' : 'huella o cara';
const random = (n) => crypto.getRandomValues(new Uint8Array(n));
const toText = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const toBytes = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/* Face ID en la web: una llave de acceso del propio teléfono (WebAuthn). No hay servidor,
   así que solo se comprueba que el teléfono verificó a la persona. Safari exige un toque. */
async function enableFace() {
  try {
    const key = await navigator.credentials.create({ publicKey: {
      challenge: random(32), rp: { name: 'Chelitos' }, user: { id: random(16), name: 'Chelitos', displayName: 'Chelitos' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' }, timeout: 60000,
    } });
    const next = { ...lockData, face: toText(key.rawId) };
    await store.set(LOCK, JSON.stringify(next));
    lockData = next;
    render(true);
    toast(`${FACE} activado`);
  } catch (e) { console.warn(e.message); toast(`No se activó ${FACE}. Tu PIN sigue funcionando.`); }
}

async function disableFace() {
  const { face, ...next } = lockData;
  try { await store.set(LOCK, JSON.stringify(next)); } catch { toast('No se pudo guardar.'); return; }
  lockData = next;
  render(true);
  toast(`${FACE} desactivado`);
}

async function faceUnlock(error) {
  if (asking || !window.locked) return;
  asking = true;
  try {
    const result = await navigator.credentials.get({ publicKey: {
      challenge: random(32), userVerification: 'required', timeout: 60000,
      allowCredentials: [{ type: 'public-key', id: toBytes(lockData.face), transports: ['internal'] }],
    } });
    // Bit 2 de las marcas: el teléfono verificó la cara, huella o código.
    if (!(new Uint8Array(result.response.authenticatorData)[32] & 4)) throw new Error('sin verificar');
    unlock();
  } catch (e) { console.warn(e.message); error.textContent = `No se pudo usar ${FACE}. Escribe tu PIN.`; }
  asking = false;
}

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
    await bioPlugin.internalAuthenticate({ androidTitle: 'Desbloquear Chelitos', cancelTitle: 'Usar PIN', allowDeviceCredential: false });
    unlock();
  } catch (e) { console.warn(e.message); }
  asking = false;
}

function lockNow() {
  if (!lockData || window.locked) return;
  window.locked = true;
  if ($('sheet').open) $('sheet').close();
  if ($('viewer').open) $('viewer').close();
  $('view').inert = $('nav').inert = true;
  const input = el('input', { type: 'password', inputMode: 'numeric', maxLength: 6, ariaLabel: 'PIN', placeholder: 'PIN', autocomplete: 'off' });
  const error = el('p', { className: 'error', role: 'alert' });
  const form = el('form', { onsubmit: async (e) => {
    e.preventDefault();
    const problem = await tryPin(input.value);
    if (problem) { error.textContent = problem; input.value = ''; } else unlock();
  } }, el('img', { src: 'icons/icon-192.png', alt: '', className: 'applogo' }), el('h2', { textContent: 'Chelitos está bloqueado' }), input, error,
    el('button', { className: 'primary', textContent: 'Desbloquear' }),
    lockData.bio && bioPlugin ? button('Usar huella', fingerprint) : null,
    lockData.face && canFace ? button(`Desbloquear con ${FACE}`, () => faceUnlock(error)) : null);
  document.body.append(el('div', { id: 'lock' }, form));
  if (lockData.bio && bioPlugin) fingerprint();
}

window.gate = async () => {
  if (!plugins) canFace = await window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false) || false;
  const saved = await store.get(LOCK);
  if (saved) { lockData = JSON.parse(saved); lockNow(); }
};

// Vuelve a bloquear según lo elegido: al salir, o tras 1 o 5 minutos fuera.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else {
    // Si salió desde la propia app (compartir, foto, elegir archivo) se da un minuto.
    const grace = window.skipLock ? Math.max(prefs.lockAfter, 60) : prefs.lockAfter;
    window.skipLock = false;
    if (hiddenAt && Date.now() - hiddenAt >= grace * 1000) lockNow();
  }
});

async function lockForm() {
  let hasBio = false;
  try { hasBio = Boolean(bioPlugin && (await bioPlugin.checkBiometry()).isAvailable); } catch (e) { console.warn(e.message); }
  openForm({
    title: lockData ? 'Cambiar PIN' : 'Activar bloqueo',
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
      const next = { salt, hash: await pinHash(salt, v.pin), bio: hasBio && v.bio === 'yes', fails: 0, until: 0, ...(lockData?.face && { face: lockData.face }) };
      try { await store.set(LOCK, JSON.stringify(next)); } catch { return 'No se pudo guardar.'; }
      lockData = next;
      render(true);
      window.syncNotices?.();
      toast('Bloqueo guardado');
    },
  });
}

function removeLockForm() {
  openForm({
    title: 'Quitar bloqueo', save: 'Quitar bloqueo',
    text: [`La app se abrirá sin pedir PIN${lockData.face || lockData.bio ? ' ni huella o cara' : ''}.`],
    fields: [{ key: 'old', label: 'Escribe tu PIN actual', type: 'pin' }],
    onSave: async (v) => {
      const problem = await tryPin(v.old);
      if (problem) return problem;
      try { await store.remove(LOCK); } catch { return 'No se pudo guardar.'; }
      lockData = null;
      render(true);
      window.syncNotices?.();
      toast('Bloqueo quitado');
    },
  });
}
