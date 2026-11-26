/**
 * Kept Words — the private connection between your Google Doc and the app.
 *
 * Paste this into Extensions → Apps Script in your quotes doc, then
 * Deploy → New deployment → Web app, Execute as: Me, Who has access: Anyone.
 * Keep the web app link private: anyone who has it can read your quotes
 * section, add quotes to it, and see which phones get the hourly notifications.
 *
 * Only the quotes section leaves Google. Everything from the heading
 * "Longer Quotes and Father's Handwritten Notes and Letters" down is cut off here.
 *
 * Sermons: put your sermons doc's ID in SERMONS_DOC_ID below (the long part of its link
 * between /d/ and /edit), run testSermons once to approve access, then deploy a new version.
 */

// Leave empty when this script is opened from the doc itself (Extensions → Apps Script).
// Only a standalone script needs the doc's ID (the long part of its link between /d/ and /edit).
const DOC_ID = '';
const CUTOFF = /^\s*longer quotes and father.?s handwritten notes/i;
// Paste your sermons doc's ID between the quotes. It stays in your Apps Script, never in the app's code.
const SERMONS_DOC_ID = '';

function doGet(e) {
  try {
    // the hourly notification job asks for the phones that turned notifications on
    if (e && e.parameter && e.parameter.action === 'subs') return reply_({ ok: true, subs: subs_() });
    if (e && e.parameter && e.parameter.doc === 'sermons') return reply_(sermons_(e.parameter.have || ''));
    return reply_(readQuotes_());
  } catch (err) { return reply_({ ok: false, error: String(err.message || err) }); }
}

/* ---- sermons: the whole doc, unless the phone already has this exact version ---- */
function sermons_(have) {
  if (!SERMONS_DOC_ID) return { ok: false, error: 'no sermons doc connected' };
  const doc = DocumentApp.openById(SERMONS_DOC_ID);
  const text = doc.getBody().getText();
  const hash = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text, Utilities.Charset.UTF_8));
  if (have && have === hash) return { ok: true, unchanged: true, hash: hash };
  return { ok: true, hash: hash, name: doc.getName(), url: doc.getUrl(), text: text };
}

/** Run this once from the editor (select it and press Run) to approve reading the sermons doc. */
function testSermons() {
  const r = sermons_('');
  Logger.log(r.ok ? r.name + ': ' + r.text.length + ' characters of sermons' : r.error);
}

/* ---- phones that turned on hourly quotes (stored in this script's properties) ---- */
function subs_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('subs') || '[]'); } catch (e) { return []; }
}
function saveSubs_(list) {
  PropertiesService.getScriptProperties().setProperty('subs', JSON.stringify(list.slice(-10)));
}

/** The app's "+" button sends {action: "add", t: "quote", a: "author"}. */
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return reply_({ ok: false, error: 'bad request' }); }
  if (body.action === 'subscribe') {
    const sub = body.sub || {};
    if (!sub.endpoint || !/^https:\/\//.test(sub.endpoint)) return reply_({ ok: false, error: 'bad subscription' });
    const list = subs_().filter(function (s) { return s.sub.endpoint !== sub.endpoint; });
    const quiet = Array.isArray(body.quiet) ? body.quiet.map(Number) : [22, 7];
    list.push({ sub: sub, tz: String(body.tz || 'UTC'), quiet: quiet, at: Date.now() });
    saveSubs_(list);
    return reply_({ ok: true });
  }
  if (body.action === 'unsubscribe') {
    saveSubs_(subs_().filter(function (s) { return s.sub.endpoint !== body.endpoint; }));
    return reply_({ ok: true });
  }
  if (body.action !== 'add') return reply_({ ok: false, error: 'unknown action' });
  const t = String(body.t || '').trim();
  const a = String(body.a || '').trim();
  if (!t || t.length > 5000 || a.length > 200) return reply_({ ok: false, error: 'quote is empty or too long' });

  const lock = LockService.getDocumentLock() || LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const doc = doc_();
    const body_ = doc.getBody();
    const paras = body_.getParagraphs();
    // newest first: insert above the first quote in the doc (below any title such as "Words of Life")
    let first = -1;
    for (let i = 0; i < paras.length; i++) {
      if (CUTOFF.test(paras[i].getText())) break;
      if (/^\s*["\u201C\u201D]/.test(paras[i].getText())) { first = i; break; }
    }
    const idx = first >= 0 ? body_.getChildIndex(paras[first]) : body_.getNumChildren();
    const quoteLine = '\u201C' + t.replace(/^["\u201C\u201D]+|["\u201C\u201D]+$/g, '') + '\u201D';

    // Use the quote now at the top as the pattern: its quote line, its "- Author" line and
    // exactly the blank lines under it, so a new quote has the same look and spacing as the rest.
    const isPara = p => p && p.getType() === DocumentApp.ElementType.PARAGRAPH;
    let quoteLook = null, authorLook = null;
    const blanks = [];
    if (first >= 0) {
      quoteLook = paras[first];
      let i = first + 1;
      if (i < paras.length && /^\s*[-\u2013\u2014]/.test(paras[i].getText())) { authorLook = paras[i]; i++; }
      while (i < paras.length && paras[i].getText().trim() === '' && !CUTOFF.test(paras[i].getText())) { blanks.push(paras[i]); i++; }
    }
    const make = (look, text) => {
      if (isPara(look)) { const p = look.copy(); p.setText(text); return p; }
      const p = body_.insertParagraph(0, text); p.removeFromParent();
      p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
      return p;
    };
    const out = [make(quoteLook, quoteLine)];
    if (a) out.push(make(authorLook || quoteLook, '- ' + a));
    if (blanks.length) blanks.forEach(b => out.push(isPara(b) ? b.copy() : make(null, '')));
    else out.push(make(null, ''));
    out.forEach((p, i) => body_.insertParagraph(idx + i, p));
    return reply_(quotesFrom_(doc));
  } catch (err) {
    return reply_({ ok: false, error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function doc_() {
  const active = DocumentApp.getActiveDocument();
  if (active) return active;
  if (DOC_ID) return DocumentApp.openById(DOC_ID);
  throw new Error('Open this script from your quotes doc (Extensions → Apps Script), or fill in DOC_ID.');
}

function readQuotes_() {
  return quotesFrom_(doc_());
}

function quotesFrom_(doc) {
  const lines = doc.getBody().getText().split('\n');
  const cut = lines.findIndex(function (l) { return CUTOFF.test(l); });
  const text = (cut >= 0 ? lines.slice(0, cut) : lines).join('\n');
  return { ok: true, name: doc.getName(), url: doc.getUrl(), text: text };
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run this once from the editor (select it and press Run) to approve access and check it works. */
function test() {
  const r = readQuotes_();
  Logger.log(r.name + ': ' + r.text.length + ' characters of quotes');
}
