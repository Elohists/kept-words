/* Words of Life (repository: kept-words) — app logic.
   Quotes (and sermons, from a second doc) come from the owner's Google Docs through a private
   Apps Script web app (see apps-script/Code.gs). Sermons open with a PIN kept on the device.
   The connection link is kept only on the device (localStorage), never in this code.
   Favorites, hidden quotes, settings and your own photos also stay on the device. */
(() => {
"use strict";

const APP_VERSION = "1.2.8";
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

/* The stage: one screen-sized base that holds the whole app (see styles.css).
   With a see-through status bar (the page starts under the clock), iPhones cut off anything pinned to
   the screen a status bar's height above the bottom, but draw the page itself all the way down.
   So the stage is made as tall as the real screen. With a solid status bar it's just the page height. */
function standaloneMode() { return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; }
function probeBox() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;left:0;width:1px;height:100%;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);box-sizing:content-box";
  document.documentElement.appendChild(probe);
  const cs = getComputedStyle(probe), r = { h: Math.round(parseFloat(cs.height)), top: parseFloat(cs.paddingTop) || 0 };
  probe.remove();
  return r;
}
function boxHeight() { return probeBox().h; }
let stageH = 0;
// Right after launch (or when opened from a notification) iOS can report the status bar's height as 0
// for a moment. The status bar style is fixed when the app is added to the Home Screen, so once this
// copy has seen its page under the status bar, remember it, and check again shortly after starting.
function underStatusBar() {
  if (!standaloneMode() || !/iPhone|iPad|iPod/.test(navigator.userAgent)) return false;
  if (probeBox().top > 0) { store.set("underBar", true); return true; }
  return store.get("underBar", false);
}
function fitStage() {
  let h = window.innerHeight;
  if (underStatusBar()) {
    const portrait = window.matchMedia("(orientation: portrait)").matches;
    const full = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    h = Math.max(full, window.innerHeight);
  }
  if (h !== stageH) { stageH = h; document.documentElement.style.setProperty("--stage-h", h + "px"); }
}
fitStage();
[100, 400, 1200, 3000].forEach(ms => setTimeout(fitStage, ms));
window.addEventListener("resize", fitStage);
window.addEventListener("pageshow", fitStage);
window.addEventListener("orientationchange", () => setTimeout(fitStage, 300));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { fitStage(); setTimeout(fitStage, 400); } });
// the page is a little taller than iOS's view of the screen; keep it from sliding up (except while typing in a panel)
window.addEventListener("scroll", () => { if (window.scrollY && !document.querySelector("dialog.sheet[open]")) window.scrollTo(0, 0); }, { passive: true });

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
  mode: ({ all: "quotes" })[store.get("mode", "quotes")] || store.get("mode", "quotes"),
  sermons: new Map(),                   // key -> {id, s: true, title, topic, lines, i}
  sdoc: null,                           // last sermons doc answer, kept in IndexedDB: {key, text, hash, name, url, at}
  sloading: false, serror: "", snone: false,
  unlocked: false,                      // Sermons open until the app goes to the background
  bg: store.get("bg", "painted"),
  font: store.get("font", "random"),
  online: store.get("online", true),
  loading: false, error: "",
};
const saveFavs = () => store.set("favs", [...S.favs]);
const saveHidden = () => { store.set("hidden", [...S.hidden]); if (typeof saveForNotifications === "function") saveForNotifications(); };
const isFav = q => !!q && S.favs.has(q.id);

/* ============ Google Doc connection ============ */
const validSrc = v => /^https:\/\/script\.google(usercontent)?\.com\/.+/.test(String(v || "").trim());
async function callScript(opts = {}, url = S.src) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 45000);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal, cache: "no-store", redirect: "follow" });
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
  if (c === "bad") return "That link didn't answer like the Words of Life script. Check that you pasted the web app link that ends in /exec.";
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
  updateCount(); saveForNotifications();
  const showing = S.mode !== "sermons";
  if (showing && (wasEmpty || S.quotes.size === 0 || (openFirst && S.quotes.has(openFirst)))) { resetFeed(); return; }
  mergeIntoFeed(before, S.quotes);
}
/* new and removed items slot into the running feed without starting it over */
function mergeIntoFeed(before, now) {
  const added = [...now.keys()].filter(k => !before.has(k));
  const gone = new Set([...before].filter(k => !now.has(k)));
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

/* ============ your photos (IndexedDB, on this device) ============ */
const idb = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open("keptwords", 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "id" });
      if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs", { keyPath: "key" });
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const run = async (mode, fn, store = "photos") => {
    const db = await open();
    return new Promise((res, rej) => { const t = db.transaction(store, mode); const req = fn(t.objectStore(store)); t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); });
  };
  return {
    all: () => run("readonly", s => s.getAll()), put: o => run("readwrite", s => s.put(o)), del: id => run("readwrite", s => s.delete(id)),
    getDoc: key => run("readonly", s => s.get(key), "docs"), putDoc: o => run("readwrite", s => s.put(o), "docs"),
  };
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
  const visible = m => [...m.values()].filter(q => !S.hidden.has(q.id));
  if (S.mode === "sermons") return S.unlocked ? visible(S.sermons) : [];
  if (S.mode !== "fav") return visible(S.quotes);
  // one Favorites tab for both; favorite sermons only while Sermons is unlocked
  return visible(S.quotes).concat(S.unlocked ? visible(S.sermons) : []).filter(isFav);
}
const exampleMode = () => S.mode !== "sermons" && S.quotes.size === 0;
const getQ = id => S.quotes.get(id) || S.sermons.get(id) || EXAMPLES.find(e => e.id === id);
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
  // your own photos come first; online photos only fill in a quarter of the time
  const own = S.photos.length, useOwn = own && (!S.online || Math.random() < .75);
  if (useOwn) {
    let p = S.photos[Math.floor(Math.random() * own)];
    if (own > 1 && p.id === lastPhoto) p = S.photos[(S.photos.indexOf(p) + 1) % own];
    lastPhoto = p.id; return { own: p.id };
  }
  return { online: seed.toString(36) };
}
function assignBg(c) {
  const item = c.qid && getQ(c.qid);
  if (item && item.s) { c.kind = "paper"; c.seed = (Math.random() * 2 ** 32) >>> 0; return; }
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
const FONTS = ["serif", "italic", "sans", "script"];
let lastFont = "";
function pickFont() {
  if (S.font !== "random") return S.font;
  const choices = FONTS.filter(f => f !== lastFont);
  return (lastFont = choices[Math.floor(Math.random() * choices.length)]);
}
const QUOTE_HTML = '<figure class="q"><blockquote class="q-text"></blockquote><figcaption class="q-meta"><span class="q-author"></span><span class="q-no"></span></figcaption></figure>';
const SERMON_HTML = '<article class="s"><h2 class="s-title"></h2><div class="s-body"></div></article>';
function fillCard(c) {
  const q = getQ(c.qid); if (!q) return;
  const el = c.el, type = q.s ? "sermon" : "quote";
  if (c.type !== type) {
    el.querySelectorAll(".q, .s").forEach(n => n.remove());
    el.classList.toggle("sermon", type === "sermon");
    if (sermonSizes) el.querySelectorAll(".s").forEach(n => sermonSizes.unobserve(n));
    el.insertAdjacentHTML("beforeend", type === "sermon" ? SERMON_HTML : QUOTE_HTML);
    if (type === "sermon" && sermonSizes) { const art = el.querySelector(".s"); art._card = c; sermonSizes.observe(art); }
    // a card switching between quote and sermon needs the other kind of background
    if (c.type && (c.kind === "paper") !== (type === "sermon")) { releaseBg(c); assignBg(c); if (typeof schedule === "function") schedule(); }
    c.type = type;
  }
  if (q.s) { fillSermon(c, q); return; }
  const tx = el.querySelector(".q-text");
  tx.textContent = q.t; tx.style.setProperty("--fs", fontSize(q.t) + "px");
  const au = el.querySelector(".q-author"); au.textContent = q.a || ""; au.hidden = !q.a;
  el.querySelector(".q-no").innerHTML = q.ex ? '<span class="tag">Example</span>' : "";
}
function fillSermon(c, q) {
  const el = c.el;
  el.querySelector(".s-title").textContent = q.title;
  const body = el.querySelector(".s-body"); body.textContent = "";
  for (const l of q.lines) {
    const p = document.createElement("p"); p.className = "s-line";
    if (l.r) { const r = document.createElement("span"); r.className = "ref"; r.textContent = l.r; p.appendChild(r); }
    p.appendChild(document.createTextNode(l.t));
    body.appendChild(p);
  }
  fitSermon(c);
  // a card built before it's on the page (e.g. the first one after View in feed) is measured once it is
  if (!c.el.isConnected) requestAnimationFrame(() => fitSermon(c));
}
/* size the sermon's text so the whole outline fits its panel; very long ones scroll inside the panel */
// When a sermon's panel changes size after it was fitted — iOS can report the clock and home-bar areas a moment
// after launch, which shrinks the panel; hiding or showing the buttons changes it too — fit it again.
const sermonSizes = "ResizeObserver" in window ? new ResizeObserver(entries => {
  for (const e of entries) {
    const c = e.target._card;
    if (c && c.type === "sermon" && Math.abs((c.fitH || 0) - e.target.clientHeight) > 1) fitSermon(c);
  }
}) : null;
function fitSermon(c) {
  const art = c.el.querySelector(".s");
  if (!art || !c.el.isConnected || !c.el.clientHeight) return;
  const body = art.querySelector(".s-body");
  art.classList.remove("scrolls");
  c.fitH = art.clientHeight;
  // fits when the last line ends at least 3 px above the panel's bottom edge (measured from where the lines
  // really are, not scrollHeight, and with a margin so "only just fits" can't round the wrong way)
  const fits = px => {
    art.style.setProperty("--ss", px + "px");
    const last = body.lastElementChild; if (!last) return true;
    return last.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom - 3;
  };
  body.scrollTop = 0;
  const MAX = 17.5, MIN = 11.5;
  if (fits(MAX)) return;
  if (!fits(MIN)) { art.classList.add("scrolls"); art.classList.remove("at-end"); fits(12.5); body.scrollTop = 0; return; }
  let lo = MIN, hi = MAX;
  for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
  fits(Math.floor(lo * 4) / 4);
}
function makeCard(qid) {
  const el = document.createElement("section");
  el.className = "card";
  el.innerHTML = '<div class="scrim"></div>';
  const c = { el, qid, painted: false, font: pickFont() };
  el.dataset.font = c.font;
  assignBg(c); fillCard(c);
  return c;
}
function appendCards(n) {
  for (let i = 0; i < n; i++) {
    const id = drawId(); if (!id) break;
    const c = makeCard(id); cards.push(c); feed.appendChild(c.el); io.observe(c.el);
    if (c.type === "sermon") fitSermon(c);
  }
}
function introCard(kind) {
  const el = document.createElement("section");
  el.className = "card";
  const fig = document.createElement("div");
  fig.className = "q intro";
  if (kind === "loading") {
    fig.innerHTML = "<h1>Words of Life</h1><p>Opening your quotes…</p>";
  } else if (kind === "connect") {
    fig.innerHTML = `<h1>Words of Life</h1>
      <p>Connect your Google Doc and every quote in it comes back to you here, one at a time.</p>
      <input type="url" id="f-connect" placeholder="Paste your connection link" autocomplete="off" spellcheck="false" aria-label="Connection link">
      <div class="row"><button class="btn solid" data-act="connect">Connect</button></div>
      <span class="hint">Swipe up to see a few examples first</span>`;
  } else if (kind === "error") {
    fig.innerHTML = `<h1>Couldn't open your quotes</h1><p></p><div class="row"><button class="btn solid" data-act="retry">Try again</button><button class="btn" data-act="settings">Settings</button></div>`;
    fig.querySelector("p").textContent = S.error;
  } else if (kind === "nofav") {
    fig.innerHTML = `<h1>No favorites yet</h1><p>Double-tap any quote or sermon, or tap the heart below it, to keep it here.</p><div class="row"><button class="btn solid" data-act="all">Show all quotes</button></div>`;
  } else if (kind === "locked") {
    fig.innerHTML = `<h1>Sermons</h1><p>Enter your PIN to open them.</p><div class="row"><button class="btn solid" data-act="unlock">Unlock</button></div>`;
  } else if (kind === "sloading") {
    fig.innerHTML = "<h1>Sermons</h1><p>Opening your sermons…</p>";
  } else if (kind === "serror") {
    fig.innerHTML = `<h1>Couldn't open your sermons</h1><p></p><div class="row"><button class="btn solid" data-act="sretry">Try again</button></div>`;
    fig.querySelector("p").textContent = S.serror;
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
  if (openFirst && getQ(openFirst) && !getQ(openFirst).ex && (S.unlocked || !getQ(openFirst).s)) { deck = [openFirst]; }
  let lead = null;
  if (!S.src) lead = "connect";
  else if (S.mode === "sermons") lead = !S.unlocked ? "locked" : S.sermons.size ? null : (S.serror ? "serror" : "sloading");
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
  if (c.kind === "paper") {
    try { paintPaper(cv, c.seed); } catch (e) { console.error(e); }
    if (c !== cards[current]) cv.classList.add("fade");
    c.el.prepend(cv); c.bgEl = cv;
    return;
  }
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
  const cc = cards[current];
  if (cc && cc.type === "sermon" && cc.el.querySelector(".s") && Math.abs((cc.fitH || 0) - cc.el.querySelector(".s").clientHeight) > 1) fitSermon(cc);
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
  const n = S.mode === "sermons" ? S.sermons.size : S.quotes.size;
  $("#btnLibrary").setAttribute("aria-label", `Open your library, ${fmt(n)} ${S.mode === "sermons" ? "sermons" : "quotes"}`);
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
    else if (a === "all") setMode("quotes");
    else if (a === "unlock") askPin(() => setMode("sermons"));
    else if (a === "sretry") { S.serror = ""; resetFeed(); refreshSermons(true); }
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
const quoteText = q => q.s
  ? [q.title, ...q.lines.map(l => (l.r ? `(${l.r}) ` : "") + l.t)].join("\n")
  : `“${q.t}”${q.a ? "\n— " + q.a : ""}`;
$("#btnFav").onclick = () => { const q = curQuote(); if (q && !isFav(q)) burst(); toggleFav(q); };
$("#btnShare").onclick = async () => {
  const c = cards[current]; if (!c || !c.qid) return;
  const q = getQ(c.qid);
  if (!q || !q.s) { sharePicture(c); return; }
  // sermons are shared as text
  if (navigator.share) { try { await navigator.share({ text: quoteText(q) }); } catch {} return; }
  copyText(quoteText(q));
};

/* ============ the quote as a picture ============ */
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
async function photoForCanvas(src) {
  if (src.startsWith("blob:")) return loadImage(src);
  // online photos need a CORS copy to be drawn into a picture
  const r = await fetch(src, { mode: "cors" }); if (!r.ok) throw new Error("photo");
  const url = URL.createObjectURL(await r.blob());
  try { return await loadImage(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}
function drawCover(x, img, W, H) {
  const k = Math.max(W / img.naturalWidth, H / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
  x.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}
// split the on-screen text into its actual lines, so the picture breaks lines exactly like the screen
function screenLines(el) {
  const node = el.firstChild; if (!node || node.nodeType !== 3) return [];
  const text = node.textContent, lines = [], range = document.createRange();
  let line = null;
  for (const m of text.matchAll(/\S+/g)) {
    range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
    const r = range.getClientRects()[0]; if (!r) continue;
    if (!line || Math.abs(r.top - line.top) > r.height * .5) { line = { words: [], top: r.top, bottom: r.bottom, left: r.left, right: r.right }; lines.push(line); }
    line.words.push(m[0]); line.right = Math.max(line.right, r.right); line.left = Math.min(line.left, r.left); line.bottom = Math.max(line.bottom, r.bottom);
  }
  return lines.map(l => ({ text: l.words.join(" "), mid: (l.top + l.bottom) / 2, center: (l.left + l.right) / 2 }));
}
async function renderPicture(c) {
  const box = c.el.getBoundingClientRect();
  const W = 1080, k = W / box.width, H = Math.round(box.height * k);
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const x = cv.getContext("2d");
  // background: the same photo, or the same painted scene redrawn at full size from its seed
  let done = false;
  if (c.bgEl && c.bgEl.tagName === "IMG") { try { drawCover(x, await photoForCanvas(c.bgEl.src), W, H); done = true; } catch {} }
  if (!done) paint(cv, c.seed, c.scene || chooseScene(rng(c.seed), ""));
  // the same darkening as on screen
  const scrim = parseFloat(getComputedStyle(c.el).getPropertyValue("--scrim")) || .34;
  x.save(); x.translate(W * .5, H * .46); x.scale((1.2 * W) / (.7 * H), 1);
  const rg = x.createRadialGradient(0, 0, 0, 0, 0, .7 * H);
  rg.addColorStop(0, `rgba(0,0,0,${scrim})`); rg.addColorStop(.55, `rgba(0,0,0,${scrim * .55})`); rg.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = rg; x.fillRect(-W, -H, W * 4, H * 2); x.restore();
  const lg = x.createLinearGradient(0, 0, 0, H);
  lg.addColorStop(0, "rgba(0,0,0,.28)"); lg.addColorStop(.22, "rgba(0,0,0,0)"); lg.addColorStop(.72, "rgba(0,0,0,0)"); lg.addColorStop(1, "rgba(0,0,0,.38)");
  x.fillStyle = lg; x.fillRect(0, 0, W, H);
  // the quote, in the same lettering and line breaks as the screen
  const tx = c.el.querySelector(".q-text"), ts = getComputedStyle(tx);
  const font = `${ts.fontStyle} ${ts.fontWeight} ${parseFloat(ts.fontSize) * k}px ${ts.fontFamily}`;
  try { await document.fonts.load(font); } catch {}
  x.font = font; x.fillStyle = "#f7f2ea"; x.textAlign = "center"; x.textBaseline = "middle";
  x.shadowColor = "rgba(0,0,0,.4)"; x.shadowBlur = 18 * k; x.shadowOffsetY = 2 * k;
  for (const l of screenLines(tx)) x.fillText(l.text, (l.center - box.left) * k, (l.mid - box.top) * k);
  // the author, with the short rules either side
  const au = c.el.querySelector(".q-author");
  if (!au.hidden && au.textContent) {
    const as = getComputedStyle(au), r = au.getBoundingClientRect(), size = parseFloat(as.fontSize) * k;
    x.font = `600 ${size}px ${as.fontFamily}`;
    try { x.letterSpacing = `${size * .16}px`; } catch {}
    const label = au.textContent.toUpperCase(), cy = (r.top + r.height / 2 - box.top) * k, cx = (r.left + r.width / 2 - box.left) * k;
    x.fillText(label, cx, cy);
    const tw = x.measureText(label).width, gap = 12 * k, rule = 18 * k;
    x.shadowBlur = 0; x.shadowOffsetY = 0;
    x.fillStyle = "rgba(247,242,234,.68)";
    x.fillRect(cx - tw / 2 - gap - rule, cy - k / 2, rule, Math.max(1, k));
    x.fillRect(cx + tw / 2 + gap - size * .16, cy - k / 2, rule, Math.max(1, k));
  }
  return new Promise(res => cv.toBlob(res, "image/jpeg", .92));
}
let shotFile = null, shotUrl = "";
async function shareFile(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return true; }
  return false;
}
async function sharePicture(c) {
  const btn = $("#btnShare"); if (btn.disabled) return;
  btn.disabled = true;
  try {
    const blob = await renderPicture(c);
    const q = getQ(c.qid);
    const name = "words-of-life-" + (q ? norm(q.t).split(" ").slice(0, 5).join("-") : "quote") + ".jpg";
    shotFile = new File([blob], name, { type: "image/jpeg" });
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    shotUrl = URL.createObjectURL(blob);
    try { if (await shareFile(shotFile)) return; }
    catch (e) { if (e && e.name === "AbortError") return; }  // the share sheet was closed
    // the phone wouldn't open the share sheet straight away (or can't share files): show the picture instead
    $("#shotImg").src = shotUrl; openSheet($("#sheetShot"));
  } catch (e) { console.warn("picture", e); toast("Couldn't make the picture. Try again."); }
  finally { btn.disabled = false; }
}
$("#shotShare").onclick = async () => {
  if (!shotFile) return;
  try { if (!(await shareFile(shotFile))) toast("Press and hold the picture to save it."); }
  catch (e) { if (!e || e.name !== "AbortError") toast("Press and hold the picture to save it."); }
};
$("#btnMore").onclick = () => { const q = curQuote(); if (q && !q.ex) openQuote(q); };
$("#btnAdd").onclick = () => openAdd();
$("#btnLibrary").onclick = () => openLibrary();
$("#btnSettings").onclick = () => openSettings();
function updateTabs() {
  $("#modeQuotes").setAttribute("aria-pressed", String(S.mode === "quotes"));
  $("#modeFav").setAttribute("aria-pressed", String(S.mode === "fav"));
  $("#modeSermons").setAttribute("aria-pressed", String(S.mode === "sermons"));
  document.body.classList.toggle("unlocked", S.unlocked);
  $("#modeSermons").setAttribute("aria-label", S.unlocked ? "Sermons" : "Sermons, locked");
}
function setMode(m) {
  S.mode = m; store.set("mode", m);
  updateTabs(); updateCount();
  resetFeed();
  if (m === "sermons" && S.unlocked && !S.sermons.size) refreshSermons(false);
}
$("#modeQuotes").onclick = () => S.mode !== "quotes" && setMode("quotes");
$("#modeFav").onclick = () => S.mode !== "fav" && setMode("fav");
$("#modeSermons").onclick = () => { if (S.mode === "sermons" && S.unlocked) return; if (S.unlocked) setMode("sermons"); else askPin(() => setMode("sermons")); };

/* swipe left or right on the feed to move between Quotes · Favorites · Sermons (Sermons still asks for the PIN) */
const TABS = ["quotes", "fav", "sermons"];
function slideIn(dir) {
  if (!feed.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  feed.animate([{ transform: `translateX(${dir * 56}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
}
function goTab(m, dir) {
  const show = () => { setMode(m); slideIn(dir); };
  if (m === "sermons" && !S.unlocked) askPin(show); else show();
}
let swipe = null;
feed.addEventListener("touchstart", e => {
  const t = e.touches[0];
  swipe = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, at: Date.now() } : null;
}, { passive: true });
feed.addEventListener("touchend", e => {
  if (!swipe) return;
  const t = e.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y, dt = Date.now() - swipe.at;
  swipe = null;
  // a clear sideways flick: far enough, mostly horizontal, not a slow drag
  if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6 || dt > 700) return;
  if (document.querySelector("dialog.sheet[open]")) return;
  const next = TABS.indexOf(S.mode) + (dx < 0 ? 1 : -1);
  if (next < 0 || next >= TABS.length) return;
  clearTimeout(tapTimer); lastTap = 0; // a swipe isn't a tap
  goTab(TABS[next], dx < 0 ? 1 : -1);
}, { passive: true });
feed.addEventListener("touchcancel", () => { swipe = null; }, { passive: true });

/* ============ Sermons: second doc and PIN ============ */
function applySermons(parsed) {
  const before = new Set(S.sermons.keys());
  S.sermons = new Map(parsed.map((p, i) => [p.k, { id: p.k, s: true, title: p.title, topic: p.topic, lines: p.lines, i }]));
  updateCount();
  if (S.mode === "sermons" && (!before.size || !S.sermons.size || cards.some(c => c.intro))) { resetFeed(); return; }
  if (S.mode === "sermons" || S.mode === "fav") mergeIntoFeed(before, S.sermons);
}
async function loadSermonsCache() {
  try { const d = await idb.getDoc("sermons"); if (d && d.text) { S.sdoc = d; applySermons(parseSermonText(d.text)); } }
  catch (e) { console.warn("sermons cache", e); }
}
async function refreshSermons(manual) {
  if (!S.src || S.sloading) return;
  S.sloading = true; renderSync();
  try {
    const have = (S.sdoc && S.sdoc.hash) || "";
    const url = S.src + (S.src.includes("?") ? "&" : "?") + "doc=sermons&have=" + encodeURIComponent(have);
    const j = await callScript({}, url);
    if (j.unchanged && S.sdoc) { S.sdoc.at = Date.now(); idb.putDoc(S.sdoc).catch(() => {}); if (manual) toast("Sermons are up to date"); }
    else {
      const count = S.sermons.size;
      S.sdoc = { key: "sermons", text: j.text || "", hash: j.hash || "", name: j.name || "", url: j.url || "", at: Date.now() };
      try { await idb.putDoc(S.sdoc); } catch (e) { console.warn("couldn't keep sermons on this phone", e); }
      applySermons(parseSermonText(S.sdoc.text));
      const diff = S.sermons.size - count;
      if (manual) toast(count && diff > 0 ? `${fmt(diff)} new sermon${diff === 1 ? "" : "s"}` : "Sermons are up to date");
    }
    S.serror = ""; S.snone = false;
  } catch (e) {
    console.warn("sermons", e);
    S.snone = e && e.code === "script" && /sermons doc/i.test(e.message || "");
    S.serror = S.snone ? "Your sermons doc isn't connected yet: add its ID to SERMONS_DOC_ID in your Apps Script and deploy a new version." : errText(e).replace(/quotes/g, "sermons");
    if (manual) toast(S.serror, 4500);
  } finally {
    S.sloading = false; renderSync();
    if (S.mode === "sermons" && !S.sermons.size) resetFeed();
  }
}

/* PIN: fixed (chosen by the owner) and not changeable in the app. Only its salted SHA-256 fingerprint is
   kept here, not the digits. It keeps Sermons private in the app; it isn't encryption.
   Unlocked until the app goes to the background. */
const PIN_SALT = "kw-sermons", PIN_HASH = "6ec71d32e53fa271cc0a820c2aaf92e9cc1874485d67779d1ff560f15bb701f6", PIN_LENGTH = 6;
async function pinHash(pin) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(PIN_SALT + ":" + pin));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}
let pinDigits = "", pinDone = null;
function drawPin() { $$("#pinDots i").forEach((d, i) => d.classList.toggle("on", i < pinDigits.length)); }
function pinWrong(msg) {
  const dots = $("#pinDots"); dots.classList.remove("shake"); void dots.offsetWidth; dots.classList.add("shake");
  pinDigits = ""; drawPin(); if (msg) $("#pinNote").textContent = msg;
}
function askPin(onDone) {
  pinDone = onDone; pinDigits = ""; drawPin();
  $("#pinNote").textContent = "Enter your PIN";
  openSheet($("#sheetPin"));
}
async function pinEntered() {
  if (await pinHash(pinDigits) === PIN_HASH) unlockSermons();
  else pinWrong("That's not it. Try again.");
}
function unlockSermons() {
  S.unlocked = true; updateTabs();
  $("#sheetPin").close();
  const done = pinDone; pinDone = null;
  if (done) done();
  if (!S.sermons.size || !S.sdoc || Date.now() - (S.sdoc.at || 0) > 10 * 60e3) refreshSermons(false);
}
function lockSermons() {
  if (!S.unlocked) return;
  S.unlocked = false; updateTabs();
  $$("dialog.sheet[open]").forEach(d => d.close());
  if (S.mode === "sermons" || (S.mode === "fav" && cards.some(c => c.qid && getQ(c.qid) && getQ(c.qid).s))) resetFeed();
}
$("#pinPad").addEventListener("click", e => {
  const b = e.target.closest("button[data-k]"); if (!b) return;
  if (b.dataset.k === "del") { pinDigits = pinDigits.slice(0, -1); drawPin(); return; }
  if (pinDigits.length >= PIN_LENGTH) return;
  pinDigits += b.dataset.k; drawPin();
  if (pinDigits.length === PIN_LENGTH) setTimeout(pinEntered, 120);
});
$("#sermonRefresh").onclick = () => { if (!S.unlocked) { askPin(() => refreshSermons(true)); return; } refreshSermons(true); };
// lock Sermons whenever the app goes to the background (this also hides them from the app switcher)
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") lockSermons(); });

/* ============ sheets ============ */
/* panels open inside the stage (not as built-in modal dialogs, which iPhones pin to the screen and cut off) */
function openSheet(d) {
  document.body.classList.remove("bare");
  $$("dialog.sheet[open]").forEach(o => { if (o !== d) o.close(); });
  $("#sheetScrim").hidden = false;
  if (!d.open) d.show();
  // opening a panel focuses its first button (often Cancel), which iOS outlines like keyboard focus;
  // focus the panel itself instead, so nothing is highlighted (panels that need typing focus their field after)
  const f = document.activeElement;
  if (f && d.contains(f) && f.matches("button, a")) { d.tabIndex = -1; d.focus({ preventScroll: true }); }
}
$$("dialog.sheet").forEach(d => {
  d.addEventListener("click", e => { if (e.target.closest("[data-close]")) d.close(); });
  d.addEventListener("close", () => {
    if (!document.querySelector("dialog.sheet[open]")) { $("#sheetScrim").hidden = true; if (window.scrollY) window.scrollTo(0, 0); }
  });
});
$("#sheetScrim").addEventListener("click", () => $$("dialog.sheet[open]").forEach(d => d.close()));
document.addEventListener("keydown", e => { if (e.key === "Escape") $$("dialog.sheet[open]").forEach(d => d.close()); });

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
function openQuote(q, fromLibrary) {
  viewing = q;
  $("#qvFeed").hidden = !fromLibrary;
  $("#qvText").textContent = q.s ? quoteText(q) : q.t;
  $("#qvText").classList.toggle("sermon-view", !!q.s);
  $("#qvAuthor").textContent = q.s ? "" : (q.a || "");
  $("#quoteTitle").textContent = q.s ? "This sermon" : "This quote";
  $("#qvFav").textContent = isFav(q) ? "Unfavorite" : "Favorite";
  const hide = $("#qvHide"); hide.classList.remove("armed"); hide.textContent = S.hidden.has(q.id) ? "Show in my feed again" : "Hide from my feed";
  const d = q.s ? S.sdoc : S.doc;
  const docA = $("#qvDoc"); docA.hidden = !(d && d.url); if (d && d.url) docA.href = d.url;
  openSheet($("#sheetQuote"));
}
$("#qvFav").onclick = () => { toggleFav(viewing); $("#qvFav").textContent = isFav(viewing) ? "Unfavorite" : "Favorite"; };
$("#qvCopy").onclick = () => viewing && copyText(quoteText(viewing));
// start the feed on this quote or sermon; the rest stays random
$("#qvFeed").onclick = () => {
  const q = viewing; if (!q) return;
  $$("dialog.sheet[open]").forEach(d => d.close());
  const tab = q.s ? "sermons" : (S.mode === "fav" && isFav(q) ? "fav" : "quotes");
  openFirst = q.id;
  if (S.mode !== tab) { S.mode = tab; store.set("mode", tab); updateTabs(); updateCount(); }
  resetFeed();
};
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
  const sermons = S.mode === "sermons" && S.unlocked, word = sermons ? "sermons" : "quotes";
  $("#libTitle").textContent = sermons ? "Sermons" : "Library";
  $("#libNoAuthor").hidden = sermons;
  if (sermons && libFilter === "noa") libFilter = "all";
  let list = [...(sermons ? S.sermons : S.quotes).values()];
  const total = list.length;
  if (libFilter === "fav") list = list.filter(isFav);
  if (libFilter === "noa") list = list.filter(q => !q.a);
  if (qs) list = list.filter(q => norm(q.s ? q.title + " " + q.lines.map(l => l.r + " " + l.t).join(" ") : q.t + " " + q.a).includes(qs));
  $("#libCount").textContent = qs || libFilter !== "all" ? `${fmt(list.length)} of ${fmt(total)} ${word}` : `${fmt(total)} ${word}, in your doc's order`;
  const box = $("#libList"); box.innerHTML = "";
  if (!list.length) box.innerHTML = `<div class="lib-empty">${total ? "Nothing matches that." : `No ${word} yet.`}</div>`;
  const frag = document.createDocumentFragment();
  for (const q of list.slice(0, libShown)) {
    const b = document.createElement("button"); b.className = "lib-row"; b.dataset.id = q.id;
    const t = document.createElement("span"); t.className = "t"; t.textContent = q.s ? q.title : q.t;
    const a = document.createElement("span"); a.className = "a"; a.textContent = (q.s ? "Sermon" : (q.a || "No author")) + (S.hidden.has(q.id) ? " · hidden" : "");
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
  const q = getQ(row.dataset.id); if (!q) return;
  $("#sheetLibrary").close(); openQuote(q, true);
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
  if (!pushSupported() || !standalone()) { renderNotif(); toast("Add Words of Life to your Home Screen first, then turn this on from there.", 4000); return; }
  notifBusy = true; renderNotif();
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { toast("Notifications are off for this app. You can allow them in iPhone Settings → Notifications.", 4500); return; }
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
  if (!pushSupported() || !standalone()) t = "On iPhone, notifications work once Words of Life is on your Home Screen: in Safari tap Share, then Add to Home Screen, and open it from there.";
  else if (Notification.permission === "denied") t = "Notifications are blocked for this app. Allow them in iPhone Settings → Notifications, under the name shown on its Home Screen icon.";
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
  // sermons
  let st;
  if (S.sloading) st = "Checking your sermons doc…";
  else if (S.serror) st = S.serror;
  else if (S.sdoc && S.sdoc.at) st = `Reading “${S.sdoc.name || "your sermons doc"}”. ${fmt(S.sermons.size)} sermons, checked ${ago(S.sdoc.at)}. They update when you open Sermons.`;
  else st = "Your sermons load the first time you open the Sermons tab.";
  $("#sermonNote").textContent = st + " Sermons lock again whenever you leave the app.";
  $("#sermonRefresh").disabled = S.sloading || !S.src;
}
$("#syncNow").onclick = () => refresh(true);
$("#srcSave").onclick = () => { if (connect($("#f-src").value)) { $("details").open = false; renderSync(); } };
function syncSettings() {
  $$("[data-bg]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.bg === S.bg)));
  $$("[data-font]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.font === S.font)));
  $("#f-online").checked = S.online;
  const np = S.photos.length;
  const src = [np ? `your ${fmt(np)} photo${np === 1 ? "" : "s"}` : "", S.online ? "online nature photos" : ""].filter(Boolean).join(" and ");
  $("#bgNote").textContent = S.bg === "painted" ? "Every quote gets a freshly painted scene: mountains, lakes, oceans, night skies, auroras, misty forests, dunes and clouds."
    : !src ? "Add a few photos below or turn on online photos. Until then you'll see painted scenes."
    : S.bg === "mix" ? `About half your quotes show ${src}; the rest get painted scenes.` : `Each quote shows one of ${src}.`;
  const hidden = [...S.hidden].filter(k => S.quotes.has(k) || S.sermons.has(k)).length;
  $("#hiddenField").hidden = !hidden;
  $("#hiddenNote").textContent = `${fmt(hidden)} item${hidden === 1 ? " is" : "s are"} hidden from your feed on this phone.`;
  const favs = [...S.quotes.values()].filter(isFav).length, au = new Set([...S.quotes.values()].map(q => q.a).filter(Boolean)).size;
  $("#setStats").textContent = S.quotes.size ? `${fmt(S.quotes.size)} quotes from ${fmt(au)} people · ${fmt(favs)} favorites` : "";
  // screen measurements help when something doesn't fill the screen
  $("#version").textContent = `Words of Life ${APP_VERSION} · screen ${screen.width}×${screen.height} · page ${window.innerWidth}×${window.innerHeight} · box ${boxHeight()} · stage ${stageH} · top ${probeBox().top}${standaloneMode() ? " · home screen" : ""}`;
}
function rebg(all) { cards.forEach((c, i) => { if ((all || i !== current) && c.qid && c.kind !== "paper") { releaseBg(c); assignBg(c); } }); schedule(); }
$$("[data-bg]").forEach(b => b.onclick = () => { S.bg = b.dataset.bg; store.set("bg", S.bg); syncSettings(); rebg(); });
$("#f-online").onchange = e => { S.online = e.target.checked; store.set("online", S.online); syncSettings(); rebg(); };
$$("[data-font]").forEach(b => b.onclick = () => {
  S.font = b.dataset.font; store.set("font", S.font); syncSettings();
  // a fixed style applies everywhere; Random re-picks every quote except the one on screen
  cards.forEach((c, i) => { if (c.qid && (S.font !== "random" || i !== current)) { c.font = pickFont(); c.el.dataset.font = c.font; } });
});
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
  await loadPhotos(); renderPhotos();
  if (ok && S.bg === "painted") { S.bg = "photos"; store.set("bg", S.bg); }
  syncSettings(); rebg();
  if (ok) toast(`Added ${ok} photo${ok === 1 ? "" : "s"}. Your next quotes will use them.`, 2600);
}

/* ============ boot ============ */
if (!["quotes", "fav", "sermons"].includes(S.mode)) S.mode = "quotes";
updateTabs();
if (S.doc && S.doc.text) S.quotes = new Map(parseDocText(S.doc.text).map((p, i) => [p.k, { id: p.k, t: p.t, a: p.a, i }]));
takeHashQuote();
updateCount(); resetFeed();
// photos load after the first screens are built, so give those screens a fresh pick once they're in
loadPhotos().then(() => {
  if (!S.photos.length) return;
  // photos added before version 1.0.4 left the style on Painted; switch unless Painted was picked on purpose
  if (S.bg === "painted" && store.get("bg", null) === null) { S.bg = "photos"; store.set("bg", "photos"); }
  if (S.bg !== "painted") rebg(true);
});
refresh(false);
// sermons come from IndexedDB right away; the doc itself is checked when Sermons is unlocked
loadSermonsCache();
document.fonts && document.fonts.ready.then(() => cards.forEach(c => { if (c.type === "sermon") fitSermon(c); }));

// check the doc again when the app comes back to the foreground after a while
window.addEventListener("hashchange", () => { if (takeHashQuote()) resetFeed(); });
navigator.serviceWorker && navigator.serviceWorker.addEventListener("message", e => { if (e.data && e.data.open) { openFirst = e.data.open; resetFeed(); } });
let lastCheck = Date.now();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastCheck > 10 * 60e3) { lastCheck = Date.now(); refresh(false); }
});
let rz;
window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { cards.forEach(c => { if (c.qid) fillCard(c); releaseBg(c); }); schedule(); }, 250); });
// a long sermon's fade goes away once it's scrolled to the end (scroll events don't bubble, so listen while capturing)
feed.addEventListener("scroll", e => {
  const b = e.target; if (!b.classList || !b.classList.contains("s-body")) return;
  b.parentElement.classList.toggle("at-end", b.scrollTop + b.clientHeight >= b.scrollHeight - 4);
}, true);
// tapping hides the buttons, which gives a sermon's panel more room: fit it again
if (!sermonSizes) new MutationObserver(() => setTimeout(() => cards.forEach((c, i) => { if (c.type === "sermon" && Math.abs(i - current) <= 2) fitSermon(c); }), 260))
  .observe(document.body, { attributes: true, attributeFilter: ["class"] });

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(e => console.warn("sw", e));
  // when a new version takes over, reload: right away if the app just opened, otherwise the next time it comes back
  const openedAt = Date.now(); let pendingReload = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (Date.now() - openedAt < 8000) location.reload(); else pendingReload = true;
  });
  document.addEventListener("visibilitychange", () => { if (pendingReload && document.visibilityState === "visible") location.reload(); });
}
$("#updateNow").onclick = async () => {
  const b = $("#updateNow"); b.textContent = "Checking…"; b.disabled = true;
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) await reg.update();
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => /^kw-\d/.test(k)).map(k => caches.delete(k)));
  } catch (e) { console.warn("update", e); }
  location.reload();
};
})();
