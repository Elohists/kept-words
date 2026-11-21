/* Kept Words — hourly notification sender, run by .github/workflows/hourly-quote.yml.
   Reads the phones that turned on hourly quotes from the private Apps Script,
   picks a random quote from the Google Doc and pushes it to each phone outside its quiet hours.
   Needs the secrets SCRIPT_URL and VAPID_PRIVATE_KEY. */
const fs = require("fs");
const path = require("path");
const webpush = require("web-push");
const { parseDocText } = require("../docparse.js");

const SCRIPT_URL = process.env.SCRIPT_URL;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "https://github.com";
const PUBLIC = (fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8").match(/VAPID_PUBLIC = "([^"]+)"/) || [])[1];

function quietNow(tz, quiet) {
  let hour;
  try { hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date())); }
  catch { hour = new Date().getUTCHours(); }
  const [from, to] = (quiet || []).map(Number);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return false;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}
async function getJson(url, opts) {
  const res = await fetch(url, { redirect: "follow", ...opts });
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error(`The script didn't answer with JSON (HTTP ${res.status}). Is the web app deployed with access set to "Anyone"?`); }
}

(async () => {
  if (!SCRIPT_URL || !PRIVATE || !PUBLIC) {
    console.log("Notifications aren't set up yet: add the SCRIPT_URL and VAPID_PRIVATE_KEY repository secrets.");
    return;
  }
  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
  const s = await getJson(SCRIPT_URL + (SCRIPT_URL.includes("?") ? "&" : "?") + "action=subs");
  if (!s.ok) throw new Error("Script error: " + s.error);
  const due = (s.subs || []).filter(x => !quietNow(x.tz, x.quiet));
  console.log(`${(s.subs || []).length} phone(s) signed up, ${due.length} outside quiet hours.`);
  if (!due.length) return;

  const d = await getJson(SCRIPT_URL);
  if (!d.ok) throw new Error("Script error: " + d.error);
  const quotes = parseDocText(d.text);
  if (!quotes.length) throw new Error("No quotes found in the doc.");
  const q = quotes[Math.floor(Math.random() * quotes.length)];
  const payload = JSON.stringify({ k: q.k, t: q.t.length > 2500 ? q.t.slice(0, 2497) + "…" : q.t, a: q.a });

  for (const x of due) {
    try {
      await webpush.sendNotification(x.sub, payload, { TTL: 3000, urgency: "normal", topic: "hourly-quote" });
      console.log("Sent to one phone.");
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        console.log("A phone's subscription has expired; removing it.");
        await getJson(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "unsubscribe", endpoint: x.sub.endpoint }) }).catch(() => {});
      } else console.log("Couldn't send to one phone:", e.statusCode || "", e.body || e.message);
    }
  }
})().catch(e => { console.error(e.message || e); process.exit(1); });
