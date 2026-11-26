/* DOCPARSE:BEGIN */
const DOC_CUTOFF = /^\s*longer quotes and father.?s handwritten notes/i;
const OPENQ = /^["“”„«‘']/;
const INVIS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
function cleanText(t) {
  return String(t || "").replace(INVIS, "").split("\n").map(l => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean).join("\n")
    .replace(/^["“”„«]+|["“”»]+$/g, "").trim();
}
const AUTHOR_NAMES = { "father": "Father Ahnsahnghong", "mother": "Heavenly Mother", "k ellen": "Elderess Ellen", "kwansanim ellen": "Elderess Ellen" };
function cleanAuthor(a) {
  const c = String(a || "").replace(INVIS, "").replace(/\s+/g, " ").trim().replace(/^[-–—―~•*]+\s*/, "").replace(/[,;]+$/, "").trim();
  return AUTHOR_NAMES[c.toLowerCase()] || c;
}
const norm = t => String(t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/* Reads the Google Doc's plain text: quotes in quotation marks, each followed by a "- Author" line.
   Everything from the "Longer Quotes and Father's Handwritten Notes and Letters" heading down is left out. */
function parseDocText(raw) {
  let lines = String(raw || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/\u000b/g, "\n").split("\n");
  const cut = lines.findIndex(l => DOC_CUTOFF.test(l));
  if (cut >= 0) lines = lines.slice(0, cut);
  const start = lines.findIndex(l => OPENQ.test(l.trim()));
  if (start > 0) lines = lines.slice(start);
  const dash = /^[-–—―]+\s*/;
  const out = [];
  let buf = [], authors = [];
  const emit = () => {
    if (!buf.length) { buf = []; authors = []; return; }
    const author = cleanAuthor(authors.join(", "));
    // several fully-quoted lines in one block are separate quotes; only the last one has its author line
    const whole = buf.length > 1 && buf.every(l => OPENQ.test(l) && /["”’]\s*$/.test(l));
    if (whole) buf.forEach((l, i) => out.push({ t: cleanText(l), a: i === buf.length - 1 ? author : "" }));
    else out.push({ t: cleanText(buf.join("\n")), a: author });
    buf = []; authors = [];
  };
  for (const l of lines) {
    const s = l.trim();
    if (!s) continue;
    if (dash.test(s) && (buf.length || authors.length)) { authors.push(s.replace(dash, "")); continue; }
    if (authors.length) emit();
    buf.push(s);
  }
  emit();
  const seen = new Set(), res = [];
  let dupes = 0;
  for (const q of out) { const k = norm(q.t); if (!k) continue; if (seen.has(k)) { dupes++; continue; } seen.add(k); res.push({ ...q, k }); }
  res.dupes = dupes;
  return res;
}
/* Sermons doc: outlines, each starting with a title line that ends in a label with a dash,
   e.g. "Lord, to Whom Shall We Go? (1-19)", "Faith Is Salvation (Transcription-237)",
   "Double Salvation (Sermon Collection 1-6)". Scripture references like "(Mt 10:40–42)" contain a colon,
   so they never count as titles. Topic headings ("Prayer and the Spiritual Life") sit right above a title. */
const SERMON_TITLE = /^([^(\[].*?)\s*\(([^():]*?-[^():]*)\)\s*([?.!]?)$/;
function sermonTitle(l) {
  const m = l.match(SERMON_TITLE);
  if (!m || !/\d|preface/i.test(m[2])) return null;
  return { title: (m[1] + m[3]).trim(), label: m[2].trim() };
}
function isTopicHeading(l) {
  if (l.length > 60 || l.startsWith("(") || /[.:;!?)\]]$/.test(l)) return false;
  const words = l.replace(/,/g, "").split(/\s+/);
  const small = /^(and|the|of|in|for|with|by|to|a|an|on|or|at)$/;
  if (!words.every((w, i) => (i > 0 && small.test(w)) || /^[A-Z]/.test(w))) return false;
  return / and /.test(l) || words.length <= 3;
}
function parseSermonText(raw) {
  const lines = String(raw || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/\u000b/g, "\n").split("\n")
    .map(l => l.replace(INVIS, "").replace(/[ \t ]+/g, " ").trim()).filter(Boolean);
  const out = [], seen = new Map();
  let cur = null, topic = "";
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], t = sermonTitle(l);
    if (t) {
      let k = "s " + norm(l);
      const n = (seen.get(k) || 0) + 1; seen.set(k, n);
      if (n > 1) k += " " + n;
      cur = { k, title: t.title, label: t.label, topic, lines: [] };
      out.push(cur);
      continue;
    }
    if (i + 1 < lines.length && sermonTitle(lines[i + 1]) && isTopicHeading(l)) { topic = l; continue; }
    if (!cur) continue;
    // "(Isa 14:24–27) Jehovah has purposed it" → reference + text
    const m = l.match(/^\(([^()]*\d+:\d[^()]*)\)\s*(.*)$/);
    cur.lines.push(m ? { r: m[1], t: m[2] } : { r: "", t: l });
  }
  return out;
}
/* DOCPARSE:END */
if (typeof module !== "undefined") module.exports = { parseDocText, parseSermonText, norm, cleanText, cleanAuthor };
