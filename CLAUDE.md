# Kept Words — notes for Claude

Read README.md first for the architecture and the owner's setup.

## Rules that must hold
- **Never commit quotes, the Apps Script web app URL, the doc ID, or the VAPID private key.** The repository is public (GitHub Pages). Private values live on the phone (localStorage `kw.src`) or in repository secrets (`SCRIPT_URL`, `VAPID_PRIVATE_KEY`).
- **The cutoff:** nothing from the heading "Longer Quotes and Father's Handwritten Notes and Letters" down may appear in the app. It's cut in `apps-script/Code.gs` (before anything leaves Google) and again in `docparse.js`.
- **Author names are replaced for display** in `docparse.js` (`AUTHOR_NAMES`): Father → Father Ahnsahnghong, Mother → Heavenly Mother, K Ellen and Kwansanim Ellen → Elderess Ellen. Exact matches only. Quotes with no author line show no attribution. The doc itself is never changed.
- **The doc's format:** each quote is a line in quotation marks, followed by a line starting with "- " for the author. Several fully quoted lines in one block are separate quotes; only the last gets the author line. Lyrics that run over two lines are one quote, and their line breaks are kept.
- Quote identity is `norm(text)` (lowercase letters and digits). Favorites and hidden quotes are stored by that key on the phone.
- No quote numbers are shown in the app.
- The doc is newest first: the app's + button inserts new quotes at the top of the doc, above the first quote and below the "Words of Life" title (`doPost` in `apps-script/Code.gs`).

## Making a change
- `docparse.js` is shared by the app (browser) and `scripts/notify.cjs` (Node). Keep it plain JS that works in both.
- **Bump `VERSION` in `sw.js` (and `APP_VERSION` in `app.js`) on every change to app files**, or phones keep serving the old copy.
- If `apps-script/Code.gs` changes, the owner has to paste it into Apps Script and deploy a new version (README step 1). Say so clearly; nothing else updates it.
- Painted backgrounds are drawn by `painter.js` from a seed (8 scene types). Online photos come from picsum.photos.
- Test by serving the folder (`python3 -m http.server`) and faking the script in Playwright with `page.route('https://script.google.com/**', …)`, answering `{ok, name, url, text}`.
