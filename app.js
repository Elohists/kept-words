/* Kept Words — app logic.
   Quotes come from the owner's Google Doc through a private Apps Script web app (see apps-script/Code.gs).
   The connection link is kept only on the device (localStorage), never in this code.
   Favorites, hidden quotes, settings and your own photos also stay on the device. */
(() => {
"use strict";

const APP_VERSION = "1.0.1";
// public half of the notification signing key; the private half is a GitHub secret (VAPID_PRIVATE_KEY)
const VAPID_PUBLIC = "BBAwooJ8Jzujy0fpCuCps1YyIE0aIaeAS2H8fawmGUpYjWLUONTyV3tOKAjhF56P4EDaUy-6V-q-dwyEj5AnZlA";

/* ============ small helpers ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = n => n.toLocaleString("en-US");
const store = {
  get(k, d) { try { const v = localStorage.getItem("kw." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("kw." + k, JSON.stringify(v)); return true; } catch { return false; } }
};
const rid = (n = 10) => { const a = "abcdefghijkmnopqrstuvwxyz23456789"; let s = ""; const b = new Uint32Array(n); crypto.getRandomValues(b); for (const x of b) s += a[x % a.length]; return s; };
const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const HEART = '<svg class="h" viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.7 3.6 4.5 7 4.5c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.4 0 5.6 3.2 4.3 6.6-1.8 4.8-9.3 9.4-9.3 9.4z"/></svg>';

let toastTimer;
function toast(msg, ms = 2200) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}
function copyText(text, okMsg = "Copied") {
  const fallback = () => { const ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch {} ta.remove(); toast(ok ? okMsg : "Couldn't copy that."); };
  try { navigator.clipboard.writeText(text).then(() => toast(okMsg, 1300), fallback); } catch { fallback(); }
}
const ago = t => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24); return d < 30 ? `${d} day${d === 1 ? "" : "s"} ago` : new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/* film grain tile */
(function makeGrain() {
  try {
    const c = document.createElement("canvas"); c.width = c.height = 160;
    const x = c.getContext("2d"); const d = x.createImageData(160, 160);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 26; }
    x.putImageData(d, 0, 0);
    document.documentElement.style.setProperty("--grain", `url(${c.toDataURL()})`);
  } catch {}
})();

/* ============ state ============ */
const EXAMPLES = [
  { id: "ex1", t: "Not all those who wander are lost.", a: "J.R.R. Tolkien" },
  { id: "ex2", t: "Hope is the thing with feathers that perches in the soul.", a: "Emily Dickinson" },
  { id: "ex3", t: "Act as if what you do makes a difference. It does.", a: "William James" },
  { id: "ex4", t: "Well done is better than well said.", a: "Benjamin Franklin" },
  { id: "ex5", t: "The best way out is always through.", a: "Robert Frost" },
].map(q => ({ ...q, ex: true }));

const S = {
  src: store.get("src", ""),            // Apps Script web app link (private)
  doc: store.get("doc", null),          // last good answer: {text, name, url, at}
  quotes: new Map(),                    // key -> {id, t, a, i}
  favs: new Set(store.get("favs", [])), // keys
  hidden: new Set(store.get("hidden", [])),
  photos: [],                           // [{id, url}] from IndexedDB
  mode: store.get("mode", "all"),
  bg: store.get("bg", "painted"),
  font: store.get("font", "serif"),
  online: store.get("online", true),
  loading: false, error: "",
};
const saveFavs = () => store.set("favs", [...S.favs]);
const saveHidden = () => { store.set("hidden", [...S.hidden]); if (typeof saveForNotifications === "function") saveForNotifications(); };
const isFav = q => !!q && S.favs.has(q.id);

/* ============ Google Doc connection ============ */
const validSrc = v => /^https:\/\/script\.google(usercontent)?\.com\/.+/.test(String(v || "").trim());
async function callScript(opts = {}) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    const res = await fetch(S.src, { ...opts, signal: ctl.signal, cache: "no-store", redirect: "follow" });
    const body = await res.text();
    let j; try { j = JSON.parse(body); } catch { throw { code: /<html/i.test(body) ? "access" : "bad" }; }
    if (!j.ok) throw { code: "script", message: j.error || "" };
    return j;
  } catch (e) {
    if (e && e.name === "AbortError") throw { code: "timeout" };
    if (e instanceof TypeError) throw { code: navigator.onLine === false ? "offline" : "network" };
    throw e;
  } finally { clearTimeout(timer); }
}
function errText(e) {
  const c = e && e.code;
  if (c === "offline") return "You're offline. Showing the quotes saved on this phone.";
  if (c === "access") return "Google asked for a sign-in. In Apps Script, set the web app's access to “Anyone”, deploy again, and paste the new link.";
  if (c === "script") return "Your script answered with an error: " + (e.message || "unknown") + ".";
  if (c === "timeout") return "Google took too long to answer. Try Refresh in a minute.";
  if (c === "bad") return "That link didn't answer like the Kept Words script. Check that you pasted the web app link that ends in /exec.";
  // Google answers a link it won't serve publicly with a sign-in page, which the browser blocks; it looks like a network error
  if (c === "network") return "Google didn't hand over your quotes. Open your connection link in Safari: if it shows a sign-in page, set the web app's access to “Anyone” (Deploy → Manage deployments → edit → New version), and check the link ends in /exec.";
  return "Couldn't reach your Google Doc. Check your connection and try Refresh.";
}
function acceptDoc(j) {
  S.doc = { text: j.text || "", name: j.name || "", url: j.url || "", at: Date.now() };
  if (!store.set("doc", S.doc)) console.warn("Couldn't cache the doc on this device");
  applyQuotes(parseDocText(S.doc.text));
}
async function refresh(manual) {
  if (!S.src || S.loading) return;
  S.loading = true; renderSync();
  try {
    const j = await callScript();
    const before = S.quotes.size;
    acceptDoc(j);
    S.error = "";
    flushPending();
    const diff = S.quotes.size - before;
    if (manual) toast(diff > 0 && before ? `${fmt(diff)} new quote${diff === 1 ? "" : "s"}` : "Up to date with your Google Doc");
    else if (diff > 0 && before) toast(`${fmt(diff)} new quote${diff === 1 ? "" : "s"} from your Google Doc`, 2600);
  } catch (e) {
    console.warn("refresh", e);
    S.error = errText(e);
    if (manual || !S.quotes.size) toast(S.error, 4200);
    if (!S.quotes.size) resetFeed();
  } finally { S.loading = false; renderSync(); }
}
async function addQuote(t, a) {
  const j = await callScript({ method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "add", t, a }) });
  acceptDoc(j);
}
/* quotes written while offline wait on the phone and go to the doc once it's reachable */
const pending = () => store.get("pending", []);
const isNetErr = e => e && ["offline", "network", "timeout"].includes(e.code);
let flushing = false;
async function flushPending() {
  if (flushing || !S.src) return;
  let list = pending(); if (!list.length) return;
  flushing = true;
  let sent = 0;
  try {
    while (list.length) {
      const q = list[0];
      if (!S.quotes.has(norm(q.t))) await addQuote(q.t, q.a);
      list = pending().slice(1); store.set("pending", list); sent++;
    }
  } catch (e) { console.warn("pending", e); }
  finally { flushing = false; }
  if (sent) toast(`${fmt(sent)} quote${sent === 1 ? "" : "s"} written offline ${sent === 1 ? "is" : "are"} now in your Google Doc`, 3000);
}
window.addEventListener("online", () => { refresh(false); });

/* ============ quotes ============ */
function applyQuotes(parsed) {
  const wasEmpty = S.quotes.size === 0;
  const before = new Set(S.quotes.keys());
  S.quotes = new Map(parsed.map((p, i) => [p.k, { id: p.k, t: p.t, a: p.a, i }]));
  updateCount(); refreshAuthors(); saveForNotifications();
  if (wasEmpty || S.quotes.size === 0 || (openFirst && S.quotes.has(openFirst))) { resetFeed(); return; }
  const added = [...S.quotes.keys()].filter(k => !before.has(k));
  const gone = new Set([...before].filter(k => !S.quotes.has(k)));
  const pool = new Set(realPool().map(q => q.id));
  deck = deck.filter(id => pool.has(id));
  for (const id of added) if (pool.has(id)) deck.splice(Math.floor(Math.random() * (deck.length + 1)), 0, id);
  cards.forEach((c, i) => {
    if (!c.qid) return;
    if (gone.has(c.qid) && i >= current) { const id = drawId(); if (id) c.qid = id; }
    fillCard(c);
  });
  if (cards.length - current < 4) appendCards(4);
  updateDock();
  if ($("#sheetLibrary").open) renderLibrary();
}
/* the service worker picks notification quotes from this copy, so hidden quotes stay out of notifications */
let saveT;
function saveForNotifications() {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    try {
      if (!("caches" in window) || !S.quotes.size) return;
      const list = [...S.quotes.values()].filter(q => !S.hidden.has(q.id)).map(q => [q.id, q.t, q.a]);
      const c = await caches.open("kw-data");
      await c.put("quotes.json", new Response(JSON.stringify(list), { headers: { "Content-Type": "application/json" } }));
    } catch (e) { console.warn("save quotes", e); }
  }, 800);
}
function refreshAuthors() {
  const m = new Map(); for (const q of S.quotes.values()) if (q.a) m.set(q.a, (m.get(q.a) || 0) + 1);
  const dl = $("#authorList"); dl.innerHTML = "";
  for (const [a] of [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 300)) { const o = document.createElement("option"); o.value = a; dl.appendChild(o); }
}

/* ============ your photos (IndexedDB, on this device) ============ */
const idb = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open("keptwords", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("photos", { keyPath: "id" });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => { const t = db.transaction("photos", mode); const req = fn(t.objectStore("photos")); t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); });
  };
  return { all: () => run("readonly", s => s.getAll()), put: o => run("readwrite", s => s.put(o)), del: id => run("readwrite", s => s.delete(id)) };
})();
async function loadPhotos() {
  try {
    const rows = (await idb.all()) || [];
    S.photos.forEach(p => URL.revokeObjectURL(p.url));
    S.photos = rows.sort((a, b) => a.c - b.c).map(r => ({ id: r.id, url: URL.createObjectURL(r.blob) }));
  } catch (e) { console.warn("photos", e); S.photos = []; }
}

/* ============ feed ============ */
const feed = $("#feed");
let cards = [], deck = [], current = 0, lastScene = "", lastPhoto = "";

function realPool() {
  const all = [...S.quotes.values()].filter(q => !S.hidden.has(q.id));
  return S.mode === "fav" ? all.filter(isFav) : all;
}
const exampleMode = () => S.quotes.size === 0;
const getQ = id => S.quotes.get(id) || EXAMPLES.find(e => e.id === id);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function drawId() {
  if (!deck.length) {
    const pool = exampleMode() ? EXAMPLES : realPool();
    if (!pool.length) return null;
    deck = shuffle(pool.map(q => q.id));
    const recent = cards.slice(-3).map(c => c.qid);
    if (deck.length > 3 && recent.includes(deck[0])) deck.push(deck.shift());
  }
  return deck.shift();
}
function photoPool() { return S.photos.length + (S.online ? 1 : 0); }
function bgKind() {
  if (!photoPool()) return "paint";
  if (S.bg === "photos") return "photo";
  if (S.bg === "mix") return Math.random() < .5 ? "photo" : "paint";
  return "paint";
}
function pickPhoto(seed) {
  const own = S.photos.length, useOwn = own && (!S.online || Math.random() < .5);
  if (useOwn) {
    let p = S.photos[Math.floor(Math.random() * own)];
    if (own > 1 && p.id === lastPhoto) p = S.photos[(S.photos.indexOf(p) + 1) % own];
    lastPhoto = p.id; return { own: p.id };
  }
  return { online: seed.toString(36) };
}
function assignBg(c) {
  c.kind = bgKind();
  c.seed = (Math.random() * 2 ** 32) >>> 0;
  if (c.kind === "photo") c.photo = pickPhoto(c.seed);
  else { c.scene = chooseScene(rng(c.seed), lastScene); lastScene = c.scene; }
}
function fontSize(t) {
  const len = t.length, w = Math.min(feed.clientWidth || 390, 640);
  let px = 46 - Math.sqrt(len) * 1.65;
  if (len > 420) px -= Math.min(4, (len - 420) / 80);
  px = Math.max(15, Math.min(38, px));
  return px * Math.max(.85, Math.min(1.3, w / 390));
}
function fillCard(c) {
  const q = getQ(c.qid); if (!q) return;
  const el = c.el, tx = el.querySelector(".q-text");
  tx.textContent = q.t; tx.style.setProperty("--fs", fontSize(q.t) + "px");
  const au = el.querySelector(".q-author"); au.textContent = q.a || ""; au.hidden = !q.a;
  el.querySelector(".q-no").innerHTML = q.ex ? '<span class="tag">Example</span>' : "";
}
function makeCard(qid) {
  const el = document.createElement("section");
  el.className = "card";
  el.innerHTML = '<div class="scrim"></div><figure class="q"><blockquote class="q-text"></blockquote><figcaption class="q-meta"><span class="q-author"></span><span class="q-no"></span></figcaption></figure>';
  const c = { el, qid, painted: false };
  assignBg(c); fillCard(c);
  return c;
}
function appendCards(n) {
  for (let i = 0; i < n; i++) {
    const id = drawId(); if (!id) break;
    const c = makeCard(id); cards.push(c); feed.appendChild(c.el); io.observe(c.el);
  }
}
function introCard(kind) {
  const el = document.createElement("section");
  el.className = "card";
  const fig = document.createElement("div");
  fig.className = "q intro";
  if (kind === "loading") {
    fig.innerHTML = "<h1>Kept Words</h1><p>Opening your quotes…</p>";
  } else if (kind === "connect") {
    fig.innerHTML = `<h1>Kept Words</h1>
      <p>Connect your Google Doc and every quote in it comes back to you here, one at a time.</p>
      <input type="url" id="f-connect" placeholder="Paste your connection link" autocomplete="off" spellcheck="false" aria-label="Connection link">
      <div class="row"><button class="btn solid" data-act="connect">Connect</button></div>
      <span class="hint">Swipe up to see a few examples first</span>`;
  } else if (kind === "error") {
    fig.innerHTML = `<h1>Couldn't open your quotes</h1><p></p><div class="row"><button class="btn solid" data-act="retry">Try again</button><button class="btn" data-act="settings">Settings</button></div>`;
    fig.querySelector("p").textContent = S.error;
  } else if (kind === "nofav") {
    fig.innerHTML = `<h1>No favorites yet</h1><p>Double-tap any quote, or tap the heart below it, to keep it here.</p><div class="row"><button class="btn solid" data-act="all">Show all quotes</button></div>`;
  }
  el.appendChild(document.createElement("div")).className = "scrim";
  el.appendChild(fig);
  const c = { el, qid: null, intro: kind, painted: false, kind: "paint", seed: (Math.random() * 2 ** 32) >>> 0 };
  c.scene = chooseScene(rng(c.seed), lastScene); lastScene = c.scene;
  return c;
}
let openFirst = null;
function takeHashQuote() {
  const m = location.hash.match(/^#q=(.+)$/);
  if (!m) return false;
  const k = decodeURIComponent(m[1]).replace(/-/g, " ");
  history.replaceState(null, "", location.pathname);
  if (!S.quotes.has(k)) { openFirst = k; return false; }
  openFirst = k; return true;
}
function resetFeed() {
  cards.forEach(c => { io.unobserve(c.el); releaseBg(c); });
  feed.innerHTML = ""; cards = []; deck = []; current = 0;
  if (openFirst && S.quotes.has(openFirst) && !S.hidden.has(openFirst)) { deck = [openFirst]; }
  let lead = null;
  if (!S.src) lead = "connect";
  else if (!S.quotes.size) lead = S.error ? "error" : "loading";
  else if (S.mode === "fav" && !realPool().length) lead = "nofav";
  if (lead) { const c = introCard(lead); cards.push(c); feed.appendChild(c.el); io.observe(c.el); }
  if (deck.length && deck[0] === openFirst) { openFirst = null; const first = drawId(); const c = makeCard(first); cards.push(c); feed.appendChild(c.el); io.observe(c.el); }
  if (lead === "connect") appendCards(5);
  else if (!lead) appendCards(6);
  feed.scrollTop = 0;
  updateDock(); schedule();
}

/* background rendering — only near the current card */
const SCALE = Math.min(window.devicePixelRatio || 1, 1.5);
const queue = new Set(); let busy = false;
function ensureBg(c) {
  if (c.painted) return;
  c.painted = true;
  const w = c.el.clientWidth || window.innerWidth, h = c.el.clientHeight || window.innerHeight;
  if (c.kind === "photo" && c.photo) {
    const img = document.createElement("img");
    img.className = "bg fade"; img.alt = ""; img.decoding = "async";
    img.onerror = () => { img.remove(); c.kind = "paint"; c.scene = chooseScene(rng(c.seed), ""); c.painted = false; ensureBg(c); };
    if (c.photo.own) { const p = S.photos.find(x => x.id === c.photo.own); if (!p) { img.onerror(); return; } img.src = p.url; }
    else { const dpr = Math.min(window.devicePixelRatio || 1, 2); img.src = `https://picsum.photos/seed/kw${c.photo.online}/${Math.round(w * dpr)}/${Math.round(h * dpr)}`; }
    c.el.style.setProperty("--scrim", ".44");
    c.el.prepend(img); c.bgEl = img;
    return;
  }
  const cv = document.createElement("canvas");
  cv.className = "bg";
  cv.width = Math.round(w * SCALE); cv.height = Math.round(h * SCALE);
  let lum = .4;
  try { lum = paint(cv, c.seed, c.scene); } catch (e) { console.error(e); }
  c.el.style.setProperty("--scrim", String(Math.min(.62, Math.max(.22, .18 + lum * .6)).toFixed(2)));
  if (c !== cards[current]) cv.classList.add("fade");
  c.el.prepend(cv); c.bgEl = cv;
}
function releaseBg(c) {
  if (!c.painted) return;
  if (c.bgEl) { if (c.bgEl.tagName === "CANVAS") c.bgEl.width = c.bgEl.height = 0; c.bgEl.remove(); }
  c.bgEl = null; c.painted = false;
}
function schedule() {
  cards.forEach((c, i) => { const d = i - current; if (d >= -1 && d <= 2) { if (!c.painted) queue.add(c); } else if (d < -3 || d > 5) { queue.delete(c); releaseBg(c); } });
  if (!busy) pump();
}
function pump() {
  if (!queue.size) { busy = false; return; }
  busy = true;
  const next = [...queue].sort((a, b) => Math.abs(cards.indexOf(a) - current) - Math.abs(cards.indexOf(b) - current))[0];
  queue.delete(next);
  if (cards.includes(next)) ensureBg(next);
  requestAnimationFrame(() => setTimeout(pump, 16));
}
const io = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (e.isIntersecting && e.intersectionRatio > .55) {
      const i = cards.findIndex(c => c.el === e.target);
      if (i >= 0 && i !== current) { current = i; onCurrent(); }
    }
  }
}, { root: feed, threshold: [.55, .9] });
function onCurrent() {
  if (cards.length - current < 4 && cards.some(c => c.qid)) appendCards(6);
  updateDock(); schedule();
}
function curQuote() { const c = cards[current]; return c && c.qid ? getQ(c.qid) : null; }
function updateDock() {
  const q = curQuote();
  const dock = $("#dock");
  if (q) dock.removeAttribute("data-off"); else dock.setAttribute("data-off", "");
  const fav = isFav(q);
  $("#btnFav").setAttribute("aria-pressed", String(fav));
  $("#btnFav").setAttribute("aria-label", fav ? "Remove from favorites" : "Add to favorites");
  $("#btnFav").disabled = !q || !!q.ex;
  $("#btnMore").disabled = !q || !!q.ex;
}
function updateCount() {
  const n = S.quotes.size;
  $("#countLabel").textContent = n ? fmt(n) : S.src && !S.error ? "…" : "0";
  $("#btnLibrary").setAttribute("aria-label", `Open your library, ${fmt(n)} quotes`);
}

/* ============ gestures and buttons ============ */
let tapTimer = null, lastTap = 0;
feed.addEventListener("click", e => {
  const act = e.target.closest("[data-act]");
  if (act) {
    const a = act.dataset.act;
    if (a === "connect") connect($("#f-connect").value);
    else if (a === "retry") { S.error = ""; resetFeed(); refresh(true); }
    else if (a === "settings") openSettings();
    else if (a === "all") setMode("all");
    return;
  }
  if (e.target.closest("input")) return;
  const now = Date.now();
  if (now - lastTap < 320) {
    clearTimeout(tapTimer); lastTap = 0;
    const q = curQuote(); if (q && !q.ex) { burst(); if (!isFav(q)) toggleFav(q, true); }
    return;
  }
  lastTap = now;
  tapTimer = setTimeout(() => document.body.classList.toggle("bare"), 320);
});
function burst() { const b = $("#burst"); b.classList.remove("go"); void b.offsetWidth; b.classList.add("go"); }
function toggleFav(q, force) {
  if (!q || q.ex) return;
  const f = force ?? !isFav(q);
  if (f) S.favs.add(q.id); else S.favs.delete(q.id);
  saveFavs(); updateDock();
  if (S.mode === "fav" && !f) deck = deck.filter(id => id !== q.id);
  toast(f ? "Added to favorites" : "Removed from favorites", 1300);
}
const quoteText = q => `“${q.t}”${q.a ? "\n— " + q.a : ""}`;
$("#btnFav").onclick = () => { const q = curQuote(); if (q && !isFav(q)) burst(); toggleFav(q); };
$("#btnShare").onclick = async () => {
  const q = curQuote(); if (!q) return;
  if (navigator.share) { try { await navigator.share({ text: quoteText(q) }); } catch {} return; }
  copyText(quoteText(q));
};
$("#btnMore").onclick = () => { const q = curQuote(); if (q && !q.ex) openQuote(q); };
$("#btnAdd").onclick = () => openAdd();
$("#btnLibrary").onclick = () => openLibrary();
$("#btnSettings").onclick = () => openSettings();
function setMode(m) {
  S.mode = m; store.set("mode", m);
  $("#modeAll").setAttribute("aria-pressed", String(m === "all"));
  $("#modeFav").setAttribute("aria-pressed", String(m === "fav"));
  resetFeed();
}
$("#modeAll").onclick = () => S.mode !== "all" && setMode("all");
$("#modeFav").onclick = () => S.mode !== "fav" && setMode("fav");

/* ============ sheets ============ */
function openSheet(d) { document.body.classList.remove("bare"); if (!d.open) d.showModal(); }
$$("dialog.sheet").forEach(d => d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-close]")) d.close(); }));

/* connect */
function connect(v) {
  v = String(v || "").trim();
  if (!validSrc(v)) { toast("Paste the web app link from Apps Script. It starts with https://script.google.com/"); return false; }
  S.src = v; store.set("src", v); S.error = "";
  resetFeed(); refresh(true);
  return true;
}

/* add a quote — written into the Google Doc */
function openAdd() {
  if (!S.src) { toast("Connect your Google Doc first."); return; }
  openSheet($("#sheetAdd"));
  setTimeout(() => $("#f-text").focus(), 60);
}
let adding = false;
async function submitAdd(e) {
  e && e.preventDefault();
  if (adding) return;
  const t = cleanText($("#f-text").value), a = String($("#f-author").value || "").replace(/\s+/g, " ").trim();
  if (!t) { $("#f-text").focus(); toast("Write the quote first."); return; }
  if (S.quotes.has(norm(t))) { toast("That quote is already in your doc."); return; }
  adding = true; const btn = $("#addSubmit"); btn.disabled = true; btn.textContent = "Saving…";
  try {
    await addQuote(t, a);
    $("#f-text").value = ""; $("#f-author").value = "";
    $("#sheetAdd").close();
    const k = norm(t), nxt = cards[current + 1];
    if (S.quotes.has(k) && nxt && nxt.qid) { deck = deck.filter(id => id !== k); deck.unshift(nxt.qid); nxt.qid = k; fillCard(nxt); toast("Saved to your doc. It's next in your feed.", 2200); }
    else toast("Saved to your Google Doc");
  } catch (err) {
    if (isNetErr(err)) {
      const list = pending(); list.push({ t, a, at: Date.now() }); store.set("pending", list);
      $("#f-text").value = ""; $("#f-author").value = ""; $("#sheetAdd").close();
      toast("No connection right now. It's saved on this phone and will go into your doc when you're back online.", 4200);
    } else toast(errText(err) + " Your quote wasn't saved yet.", 4500);
  } finally { adding = false; btn.disabled = false; btn.textContent = "Save to my Google Doc"; }
}
$("#addForm").addEventListener("submit", submitAdd);
$("#addSave").onclick = submitAdd;

/* one quote */
let viewing = null;
function openQuote(q) {
  viewing = q;
  $("#qvText").textContent = q.t;
  $("#qvAuthor").textContent = q.a || "";
  $("#qvFav").textContent = isFav(q) ? "Unfavorite" : "Favorite";
  const hide = $("#qvHide"); hide.classList.remove("armed"); hide.textContent = S.hidden.has(q.id) ? "Show in my feed again" : "Hide from my feed";
  const docA = $("#qvDoc"); docA.hidden = !(S.doc && S.doc.url); if (S.doc && S.doc.url) docA.href = S.doc.url;
  openSheet($("#sheetQuote"));
}
$("#qvFav").onclick = () => { toggleFav(viewing); $("#qvFav").textContent = isFav(viewing) ? "Unfavorite" : "Favorite"; };
$("#qvCopy").onclick = () => viewing && copyText(quoteText(viewing));
$("#qvHide").onclick = () => {
  const q = viewing; if (!q) return;
  if (S.hidden.has(q.id)) { S.hidden.delete(q.id); saveHidden(); $("#sheetQuote").close(); toast("It'll show in your feed again"); return; }
  const b = $("#qvHide");
  if (!b.classList.contains("armed")) { b.classList.add("armed"); b.textContent = "Tap again to hide it"; return; }
  S.hidden.add(q.id); saveHidden();
  deck = deck.filter(id => id !== q.id);
  cards.forEach((c, i) => { if (c.qid === q.id && i >= current) { const id = drawId(); if (id) { c.qid = id; fillCard(c); } } });
  $("#sheetQuote").close(); updateDock();
  toast("Hidden from your feed on this phone");
};

/* library */
let libFilter = "all", libShown = 80;
function openLibrary() { libShown = 80; $("#f-search").value = ""; renderLibrary(); openSheet($("#sheetLibrary")); }
function renderLibrary() {
  const qs = norm($("#f-search").value);
  let list = [...S.quotes.values()];
  const total = list.length;
  if (libFilter === "fav") list = list.filter(isFav);
  if (libFilter === "noa") list = list.filter(q => !q.a);
  if (qs) list = list.filter(q => norm(q.t + " " + q.a).includes(qs));
  $("#libCount").textContent = qs || libFilter !== "all" ? `${fmt(list.length)} of ${fmt(total)} quotes` : `${fmt(total)} quotes, in your doc's order`;
  const box = $("#libList"); box.innerHTML = "";
  if (!list.length) box.innerHTML = `<div class="lib-empty">${total ? "Nothing matches that." : "No quotes yet. Connect your Google Doc in Settings."}</div>`;
  const frag = document.createDocumentFragment();
  for (const q of list.slice(0, libShown)) {
    const b = document.createElement("button"); b.className = "lib-row"; b.dataset.id = q.id;
    const t = document.createElement("span"); t.className = "t"; t.textContent = q.t;
    const a = document.createElement("span"); a.className = "a"; a.textContent = (q.a || "No author") + (S.hidden.has(q.id) ? " · hidden" : "");
    b.append(t, a); if (isFav(q)) b.insertAdjacentHTML("beforeend", HEART);
    frag.appendChild(b);
  }
  box.appendChild(frag);
  const more = $("#libMore"); more.hidden = list.length <= libShown;
  more.textContent = `Show more (${fmt(list.length - libShown)} left)`;
}
let searchT;
$("#f-search").addEventListener("input", () => { clearTimeout(searchT); searchT = setTimeout(() => { libShown = 80; renderLibrary(); }, 150); });
$("#libMore").onclick = () => { libShown += 150; renderLibrary(); };
[["#libAll", "all"], ["#libFav", "fav"], ["#libNoAuthor", "noa"]].forEach(([sel, v]) => $(sel).onclick = () => {
  libFilter = v; ["#libAll", "#libFav", "#libNoAuthor"].forEach(s => $(s).setAttribute("aria-pressed", String(s === sel))); libShown = 80; renderLibrary();
});
$("#libList").addEventListener("click", e => {
  const row = e.target.closest(".lib-row"); if (!row) return;
  const q = S.quotes.get(row.dataset.id); if (!q) return;
  $("#sheetLibrary").close(); openQuote(q);
});

/* ============ hourly notifications ============ */
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const b64url = s => { const p = "=".repeat((4 - s.length % 4) % 4); const b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, c => c.charCodeAt(0)); };
let notifBusy = false;
async function currentSub() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(); if (!reg) return null;
  return reg.pushManager.getSubscription();
}
function quietHours() { return [Number($("#f-quietFrom").value), Number($("#f-quietTo").value)]; }
async function sendSub(sub) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  await callScript({ method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "subscribe", sub: sub.toJSON(), tz, quiet: quietHours() }) });
}
async function turnOnNotifications() {
  if (notifBusy) return;
  if (!S.src) { toast("Connect your Google Doc first."); return; }
  if (!pushSupported() || !standalone()) { renderNotif(); toast("Add Kept Words to your Home Screen first, then turn this on from there.", 4000); return; }
  notifBusy = true; renderNotif();
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { toast("Notifications are off for Kept Words. You can allow them in iPhone Settings → Notifications.", 4500); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64url(VAPID_PUBLIC) });
    await sendSub(sub);
    store.set("notif", { on: true, quiet: quietHours() });
    toast("Hourly quotes are on");
  } catch (e) { console.warn("notif", e); toast(e && e.code ? errText(e) : "Couldn't turn on notifications. Try again.", 4000); }
  finally { notifBusy = false; renderNotif(); }
}
async function turnOffNotifications() {
  if (notifBusy) return;
  notifBusy = true; renderNotif();
  try {
    const sub = await currentSub();
    if (sub) {
      try { await callScript({ method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "unsubscribe", endpoint: sub.endpoint }) }); } catch {}
      await sub.unsubscribe();
    }
    store.set("notif", { on: false, quiet: quietHours() });
    toast("Hourly quotes are off");
  } catch (e) { toast("Couldn't turn them off. Try again."); }
  finally { notifBusy = false; renderNotif(); }
}
async function renderNotif() {
  const st = store.get("notif", { on: false, quiet: [22, 7] });
  const on = !!st.on && pushSupported() && Notification.permission === "granted";
  $("#notifToggle").textContent = notifBusy ? "One moment…" : on ? "Turn off hourly quotes" : "Turn on hourly quotes";
  $("#notifToggle").disabled = notifBusy;
  $("#notifToggle").classList.toggle("primary", !on);
  $("#quietRow").hidden = !on && !(pushSupported() && standalone());
  let t;
  if (!pushSupported() || !standalone()) t = "On iPhone, notifications work once Kept Words is on your Home Screen: in Safari tap Share, then Add to Home Screen, and open it from there.";
  else if (Notification.permission === "denied") t = "Notifications are blocked for Kept Words. Allow them in iPhone Settings → Notifications → Kept Words.";
  else if (on) t = "A random quote arrives at the top of every hour, except during quiet hours. Times can drift by a few minutes.";
  else t = "Get a random quote from your collection every hour, with quiet hours overnight.";
  $("#notifNote").textContent = t;
}
function fillHours() {
  const st = store.get("notif", { on: false, quiet: [22, 7] });
  const label = h => new Date(2000, 0, 1, h).toLocaleTimeString("en-US", { hour: "numeric" });
  for (const [id, v] of [["#f-quietFrom", st.quiet[0]], ["#f-quietTo", st.quiet[1]]]) {
    const sel = $(id); if (!sel.options.length) for (let h = 0; h < 24; h++) sel.add(new Option(label(h), h));
    sel.value = String(v);
  }
}
$("#notifToggle").onclick = () => (store.get("notif", {}).on && Notification.permission === "granted") ? turnOffNotifications() : turnOnNotifications();
["#f-quietFrom", "#f-quietTo"].forEach(id => $(id).addEventListener("change", async () => {
  const st = store.get("notif", { on: false }); store.set("notif", { ...st, quiet: quietHours() });
  const sub = await currentSub();
  if (st.on && sub) { try { await sendSub(sub); toast("Quiet hours saved"); } catch (e) { toast(errText(e)); } }
}));

/* settings */
function openSettings() { syncSettings(); renderPhotos(); renderSync(); fillHours(); renderNotif(); openSheet($("#sheetSettings")); }
function renderSync() {
  if (!$("#sheetSettings").open) return;
  const note = $("#syncNote"), btn = $("#syncNow"), open = $("#openDoc");
  btn.disabled = S.loading || !S.src; btn.textContent = S.loading ? "Refreshing…" : "Refresh now";
  open.hidden = !(S.doc && S.doc.url); if (S.doc && S.doc.url) open.href = S.doc.url;
  if (!$("#f-src").matches(":focus")) $("#f-src").value = S.src || "";
  if (!S.src) { note.textContent = "Not connected yet. Paste your connection link below."; return; }
  let t = S.doc && S.doc.at ? `Reading “${S.doc.name || "your Google Doc"}”. Last updated ${ago(S.doc.at)}, ${fmt(S.quotes.size)} quotes.` : "Connected.";
  t += " It checks for new quotes every time you open the app.";
  if (S.error) t += " " + S.error;
  const p = pending().length; if (p) t += ` ${fmt(p)} quote${p === 1 ? "" : "s"} written offline will be added when you're connected.`;
  note.textContent = t;
}
$("#syncNow").onclick = () => refresh(true);
$("#srcSave").onclick = () => { if (connect($("#f-src").value)) { $("details").open = false; renderSync(); } };
function syncSettings() {
  $$("[data-bg]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.bg === S.bg)));
  $$("[data-font]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.font === S.font)));
  document.body.dataset.font = S.font;
  $("#f-online").checked = S.online;
  const np = S.photos.length;
  const src = [np ? `your ${fmt(np)} photo${np === 1 ? "" : "s"}` : "", S.online ? "online nature photos" : ""].filter(Boolean).join(" and ");
  $("#bgNote").textContent = S.bg === "painted" ? "Every quote gets a freshly painted scene: mountains, lakes, oceans, night skies, auroras, misty forests, dunes and clouds."
    : !src ? "Add a few photos below or turn on online photos. Until then you'll see painted scenes."
    : S.bg === "mix" ? `About half your quotes show ${src}; the rest get painted scenes.` : `Each quote shows one of ${src}.`;
  const hidden = [...S.hidden].filter(k => S.quotes.has(k)).length;
  $("#hiddenField").hidden = !hidden;
  $("#hiddenNote").textContent = `${fmt(hidden)} quote${hidden === 1 ? " is" : "s are"} hidden from your feed on this phone.`;
  const favs = [...S.quotes.values()].filter(isFav).length, au = new Set([...S.quotes.values()].map(q => q.a).filter(Boolean)).size;
  $("#setStats").textContent = S.quotes.size ? `${fmt(S.quotes.size)} quotes from ${fmt(au)} people · ${fmt(favs)} favorites` : "";
  $("#version").textContent = `Kept Words ${APP_VERSION}`;
}
function rebg() { cards.forEach((c, i) => { if (i !== current && c.qid) { releaseBg(c); assignBg(c); } }); schedule(); }
$$("[data-bg]").forEach(b => b.onclick = () => { S.bg = b.dataset.bg; store.set("bg", S.bg); syncSettings(); rebg(); });
$("#f-online").onchange = e => { S.online = e.target.checked; store.set("online", S.online); syncSettings(); rebg(); };
$$("[data-font]").forEach(b => b.onclick = () => { S.font = b.dataset.font; store.set("font", S.font); syncSettings(); });
$("#unhideAll").onclick = () => { S.hidden.clear(); saveHidden(); syncSettings(); resetFeed(); toast("All quotes are back in your feed"); };

function renderPhotos() {
  const g = $("#photoGrid"); g.innerHTML = "";
  for (const p of S.photos) {
    const d = document.createElement("div"); d.className = "ph";
    d.innerHTML = `<img alt=""><button aria-label="Remove photo">${ICON_X}</button>`;
    d.querySelector("img").src = p.url;
    d.querySelector("button").onclick = async ev => {
      const b = ev.currentTarget;
      if (!b.classList.contains("armed")) { b.classList.add("armed"); b.setAttribute("aria-label", "Tap again to remove"); setTimeout(() => b.classList.remove("armed"), 3000); return; }
      try { await idb.del(p.id); await loadPhotos(); renderPhotos(); syncSettings(); toast("Photo removed"); } catch { toast("Couldn't remove that photo."); }
    };
    g.appendChild(d);
  }
  const add = document.createElement("label"); add.className = "ph add"; add.setAttribute("aria-label", "Add photos");
  add.innerHTML = ICON_PLUS + '<input type="file" accept="image/*" multiple>';
  add.querySelector("input").onchange = e => uploadPhotos([...e.target.files]);
  g.appendChild(add);
}
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const max = 1800, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close();
  return await new Promise(r => c.toBlob(r, "image/jpeg", .85));
}
async function uploadPhotos(files) {
  let ok = 0;
  for (const [i, f] of files.entries()) {
    $("#photoNote").textContent = `Adding photo ${i + 1} of ${files.length}…`;
    try { await idb.put({ id: "p" + Date.now().toString(36) + rid(4), blob: await shrink(f), c: Date.now() }); ok++; }
    catch (e) { console.warn(e); toast(`Couldn't add ${f.name || "that photo"}.`, 3000); }
  }
  $("#photoNote").textContent = "Add pictures from your camera roll. They stay on this phone.";
  await loadPhotos(); renderPhotos(); syncSettings();
  if (ok) toast(`Added ${ok} photo${ok === 1 ? "" : "s"}`);
}

/* ============ boot ============ */
document.body.dataset.font = S.font;
$("#modeAll").setAttribute("aria-pressed", String(S.mode === "all"));
$("#modeFav").setAttribute("aria-pressed", String(S.mode === "fav"));
if (S.doc && S.doc.text) S.quotes = new Map(parseDocText(S.doc.text).map((p, i) => [p.k, { id: p.k, t: p.t, a: p.a, i }]));
takeHashQuote();
refreshAuthors(); updateCount(); resetFeed();
loadPhotos();
refresh(false);

// check the doc again when the app comes back to the foreground after a while
window.addEventListener("hashchange", () => { if (takeHashQuote()) resetFeed(); });
navigator.serviceWorker && navigator.serviceWorker.addEventListener("message", e => { if (e.data && e.data.open) { openFirst = e.data.open; resetFeed(); } });
let lastCheck = Date.now();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastCheck > 10 * 60e3) { lastCheck = Date.now(); refresh(false); }
});
let rz;
window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { cards.forEach(c => { if (c.qid) fillCard(c); releaseBg(c); }); schedule(); }, 250); });

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(e => console.warn("sw", e));
})();
