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
/* DOCPARSE:END */
if (typeof module !== "undefined") module.exports = { parseDocText, norm, cleanText, cleanAuthor };
