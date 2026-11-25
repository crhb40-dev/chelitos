// Solo para la versión web (iPhone). En Android la app ya viene instalada.
if (!plugins) {
  navigator.serviceWorker?.register('sw.js').catch((e) => console.warn(e.message));
  navigator.storage?.persist?.(); // pide que el navegador no borre los datos por falta de espacio
  document.addEventListener('touchstart', () => {}, { passive: true }); // activa :active en iOS
}
