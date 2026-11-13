// Service worker de Atril: guarda la app para abrirla sin internet
// y siempre intenta traer la versión más nueva primero. No toca tus datos.
const CACHE = "atril-shell-v1";
const SHELL = ["./", "./index.html", "./config.js", "./vendor/supabase.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png",
  "./fonts/newsreader-latin-400-normal.woff2", "./fonts/newsreader-latin-500-normal.woff2", "./fonts/newsreader-latin-400-italic.woff2",
  "./fonts/instrument-sans-latin-400-normal.woff2", "./fonts/instrument-sans-latin-500-normal.woff2", "./fonts/instrument-sans-latin-600-normal.woff2"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase: directo a la red
  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === "navigate" ? caches.match("./index.html") : undefined)))
  );
});
