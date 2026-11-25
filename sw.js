// Guarda la app para usarla sin internet. Al cambiar cualquier archivo, sube VERSION.
const VERSION = 'dinero-2.3';
const FILES = ['./', 'index.html', 'style.css', 'logic.js', 'ui.js', 'app.js', 'plans.js', 'lock.js', 'web.js', 'manifest.webmanifest',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'fonts/space-grotesk-latin-400-normal.woff2', 'fonts/space-grotesk-latin-500-normal.woff2', 'fonts/space-grotesk-latin-700-normal.woff2'];

self.addEventListener('install', (e) => e.waitUntil(
  caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))));

// Solo borra cachés propias: en un mismo dominio pueden vivir otras páginas.
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('dinero-') && k !== VERSION).map((k) => caches.delete(k))))));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (c) => await c.match(e.request, { ignoreSearch: true }) || fetch(e.request)));
});
