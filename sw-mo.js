// Service worker del módulo Registro de Mano de Obra: deja abierta la pantalla aunque no haya señal.
// Solo toca la pantalla del módulo y sus archivos; el resto de la intranet y la API pasan sin cambios.
const CACHE = 'mo-shell-v1';
const PROPIOS = /\/(registro-mo(\.html)?|manifest-mo\.json|icon-mo-\d+\.png)$/;
const LIBRERIAS = /^https:\/\/(cdn\.jsdelivr\.net\/npm\/@azure\/msal-browser|fonts\.googleapis\.com|fonts\.gstatic\.com)/;
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const mio = (u.origin === location.origin && PROPIOS.test(u.pathname)) || LIBRERIAS.test(r.url);
  if (!mio) return;
  e.respondWith(
    fetch(r).then(resp => { if (resp.ok) { const c = resp.clone(); caches.open(CACHE).then(ca => ca.put(r, c)); } return resp; })
      .catch(() => caches.match(r, { ignoreSearch: true }))
  );
});
