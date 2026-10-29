// Service worker de Correo por voz: permite instalar la pantalla como app y abrirla rápido.
// Solo toca la pantalla del módulo y sus archivos; Microsoft Graph y la API pasan sin cambios.
const CACHE = 'voz-shell-v1';
const PROPIOS = /\/(correo-voz(\.html)?|manifest-voz\.json|icon-mo-\d+\.png)$/;
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (!(u.origin === location.origin && PROPIOS.test(u.pathname))) return;
  e.respondWith(
    fetch(r).then(resp => { if (resp.ok) { const c = resp.clone(); caches.open(CACHE).then(ca => ca.put(r, c)); } return resp; })
      .catch(() => caches.match(r, { ignoreSearch: true }))
  );
});
