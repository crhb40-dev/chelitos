// Solo para la versión web (iPhone). En Android la app ya viene instalada.
if (!plugins) {
  navigator.serviceWorker?.register('sw.js').catch((e) => console.warn(e.message));
  navigator.storage?.persist?.(); // pide que el navegador no borre los datos por falta de espacio
  document.addEventListener('touchstart', () => {}, { passive: true }); // activa :active en iOS
}

// En iPhone, fuera de la pantalla de inicio Safari puede borrar los datos tras días sin abrir la web.
if (!plugins && /iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone) {
  homeNotices.unshift((view) => view.append(el('div', { className: 'card notice' },
    el('span', { textContent: 'Añade Chelitos a tu pantalla de inicio (Compartir › Añadir a pantalla de inicio) para que tus datos no se borren. Lo de esta pestaña no pasa a la app.' }))));
}

