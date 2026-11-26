/* Words of Life — service worker: makes the app open with no internet.
   Bump VERSION whenever any app file changes so phones pick up the new files. */
const VERSION = "kw-1.3.2";
const SHELL = ["./", "index.html", "styles.css", "app.js", "painter.js", "docparse.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
const RUNTIME = "kw-runtime";
const PHOTOS = "kw-photos";
const MAX_PHOTOS = 80;

self.addEventListener("install", e => {
  // "reload" skips the browser's own 10-minute copy so a new version never installs old files
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => ![VERSION, RUNTIME, PHOTOS, "kw-data"].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(name, max) {
  const c = await caches.open(name); const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // the Google Doc connection is never cached here; the app keeps its own copy of the quotes
  if (/(^|\.)script\.google(usercontent)?\.com$/.test(url.hostname)) return;

  // app files: try the network first so updates arrive, fall back to the saved copy offline
  if (url.origin === location.origin) {
    e.respondWith(fetch(req, { cache: "no-cache" }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
    return;
  }
  // fonts: saved copy first
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      const copy = res.clone(); caches.open(RUNTIME).then(c => c.put(req, copy)); return res;
    })));
    return;
  }
  // online photos: keep the most recent ones so a few still work offline
  if (url.hostname.endsWith("picsum.photos")) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(PHOTOS).then(c => c.put(req, copy)).then(() => trim(PHOTOS, MAX_PHOTOS)); }
      return res;
    })));
  }
});

/* ---------- hourly quote notifications ----------
   The hourly GitHub job sends a push with a random quote. If the app has saved its own list
   (which leaves out quotes hidden on this phone), a quote is picked from that list instead. */
async function pickSaved() {
  try {
    const c = await caches.open("kw-data");
    const r = await c.match("quotes.json");
    if (!r) return null;
    const list = await r.json();
    if (!list.length) return null;
    const [k, t, a] = list[Math.floor(Math.random() * list.length)];
    return { k, t, a };
  } catch { return null; }
}
self.addEventListener("push", e => {
  e.waitUntil((async () => {
    let sent = null;
    try { sent = e.data ? e.data.json() : null; } catch {}
    const q = (await pickSaved()) || sent || { t: "Open Words of Life for a quote.", a: "", k: "" };
    // iPhones cut a notification's title to one line but show several lines of body (all of it when
    // pressed and held), so the quote goes in the body with the author underneath, and the title stays empty
    await self.registration.showNotification("", {
      body: q.t + (q.a ? "\n— " + q.a : ""),
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      tag: "kept-words-hourly",
      data: { k: q.k || "" },
    });
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const k = (e.notification.data && e.notification.data.k) || "";
  const target = "./" + (k ? "#q=" + encodeURIComponent(k.replace(/ /g, "-")) : "");
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) { if (k) w.postMessage({ open: k }); return w.focus(); }
    return self.clients.openWindow(target);
  })());
});
