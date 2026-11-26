# Kept Words

A home-screen web app for iPhone that shows the quotes you keep, one at a time, in random order, over painted scenes or photos. The quotes come from a private Google Doc. The app can add new quotes to the doc and sends a random quote every hour.

## How it fits together

- **The app** (`index.html`, `app.js`, `styles.css`, `painter.js`, `docparse.js`) is a static site hosted on GitHub Pages. It contains no quotes and no private links.
- **The Google Doc** is the master list. Everything from the heading "Longer Quotes and Father's Handwritten Notes and Letters" down is never sent anywhere.
- **The Apps Script** (`apps-script/Code.gs`) lives inside the Google Doc. It reads the quotes section, adds quotes from the app's + button, and keeps the list of phones that turned on hourly quotes. Its web app link is private and is pasted into the app once.
- **The hourly job** (`.github/workflows/hourly-quote.yml` + `scripts/notify.cjs`) runs on GitHub every hour and sends a push notification with a random quote.
- **Offline:** the service worker (`sw.js`) keeps the app's files, and the app keeps the last copy of the quotes on the phone. Quotes added offline wait on the phone and go to the doc once it's back online.

## One-time setup

### 1. Put the script in your Google Doc
1. Open the quotes doc → **Extensions → Apps Script**.
2. Delete what's in the editor and paste everything from `apps-script/Code.gs`. Press **Save**.
3. Choose the function `test` at the top and press **Run**. Google asks you to approve access: choose your account → **Advanced** → **Go to … (unsafe)** → **Allow**. It's "unsafe" only because it's your own script and not one Google has reviewed.
4. **Deploy → New deployment →** gear icon **→ Web app**. Set **Execute as: Me** and **Who has access: Anyone**. Press **Deploy** and copy the **Web app URL** (it ends in `/exec`). This is your connection link. Keep it private.

If you edit the script later: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The link stays the same.

### 2. Put the app on your iPhone
1. Open the app's address in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open **Kept Words** from the Home Screen and paste the connection link. (The Home Screen app has its own storage, separate from Safari, so paste it there.)

### 3. Hourly quotes
1. In the repository's **Settings → Secrets and variables → Actions**, add two secrets: `SCRIPT_URL` (the connection link) and `VAPID_PRIVATE_KEY` (the notification key).
2. In the app: **Settings → Notifications → Turn on hourly quotes**, and allow notifications. Set quiet hours if you like.
3. To test it, go to the repository's **Actions** tab → **Hourly quote** → **Run workflow**.

### 4. Sermons (a second doc, behind a PIN)
1. In Apps Script, paste the latest `apps-script/Code.gs`, then put your sermons doc's ID between the quotes in `const SERMONS_DOC_ID = '';` (the ID is the long part of the doc's link between `/d/` and `/edit`). Press **Save**.
2. Choose **testSermons** in the function menu and press **Run**. Google asks again for access, because the script now reads a second doc: **Advanced → Go to … (unsafe) → Allow**.
3. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy.** The link stays the same.
4. In the app, tap **Sermons** and choose a 4-digit PIN. Sermons lock again whenever you leave the app. Forgot the PIN? Tap **Forgot your PIN?** and paste your connection link to choose a new one.

The PIN keeps Sermons private inside the app on that phone. It isn't encryption: anyone who has your connection link can still read the sermons doc through the script.
