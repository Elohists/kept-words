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
 */

// Leave empty when this script is opened from the doc itself (Extensions → Apps Script).
// Only a standalone script needs the doc's ID (the long part of its link between /d/ and /edit).
const DOC_ID = '';
const CUTOFF = /^\s*longer quotes and father.?s handwritten notes/i;

function doGet(e) {
  try {
    // the hourly notification job asks for the phones that turned notifications on
    if (e && e.parameter && e.parameter.action === 'subs') return reply_({ ok: true, subs: subs_() });
    return reply_(readQuotes_());
  } catch (err) { return reply_({ ok: false, error: String(err.message || err) }); }
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
    // insert just above the "Longer Quotes…" heading, after the blank lines that precede it
    let at = paras.length;
    for (let i = 0; i < paras.length; i++) {
      if (CUTOFF.test(paras[i].getText())) { at = i; break; }
    }
    let idx = at < paras.length ? body_.getChildIndex(paras[at]) : body_.getNumChildren();
    while (idx > 0) {
      const prev = body_.getChild(idx - 1);
      if (prev.getType() === DocumentApp.ElementType.PARAGRAPH && prev.asParagraph().getText().trim() === '') idx--;
      else break;
    }
    const lines = ['', '', '“' + t.replace(/^["“”]+|["“”]+$/g, '') + '”'];
    if (a) lines.push('- ' + a);
    lines.forEach((line, i) => body_.insertParagraph(idx + i, line).setHeading(DocumentApp.ParagraphHeading.NORMAL));
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
