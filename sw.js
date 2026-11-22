/* Sudoku Schrift service worker: de app werkt ook zonder internet.
   Verhoog VERSION bij elke wijziging aan de bestanden hieronder. */
const VERSION = "v18";
const CACHE = "sudoku-" + VERSION;
const SHELL = [
  "./",
  "./index.html",
  "./ocr.js?v=18",
  "./manifest.webmanifest",
  "./vendor/anthropic-sdk-1.6.0.mjs",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (e) => {
  // cache: "reload" haalt elk bestand vers op, niet uit de tijdelijke opslag van de browser
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("sudoku-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;               // API-aanvragen (POST) gaan altijd direct naar internet
  const url = new URL(req.url);

  // De pagina zelf: eerst internet (voor updates), anders de bewaarde versie.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("./index.html", copy)); return res; })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Lettertypen: bewaarde versie gebruiken en op de achtergrond verversen.
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(CACHE).then((c) => c.match(req).then((hit) => {
        const net = fetch(req).then((res) => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      }))
    );
    return;
  }

  // Gratis herkenning (groot): pas bewaren als je hem voor het eerst gebruikt.
  if (url.origin === self.location.origin && url.pathname.includes("/vendor/tesseract/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }

  // Eigen bestanden: eerst de bewaarde versie.
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});
