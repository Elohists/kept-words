# Words of Life (repository: kept-words) — notes for Claude

The app is called **Words of Life** (renamed from Kept Words). The repository, web address `/kept-words/`, storage keys (`kw.*`) and cache names keep the old name on purpose: changing them would wipe what's saved on the phone.

Read README.md first for the architecture and the owner's setup.

## Rules that must hold
- **Never commit quotes, the Apps Script web app URL, the doc ID, or the VAPID private key.** The repository is public (GitHub Pages). Private values live on the phone (localStorage `kw.src`) or in repository secrets (`SCRIPT_URL`, `VAPID_PRIVATE_KEY`).
- **The cutoff:** nothing from the heading "Longer Quotes and Father's Handwritten Notes and Letters" down may appear in the app. It's cut in `apps-script/Code.gs` (before anything leaves Google) and again in `docparse.js`.
- **Author names are replaced for display** in `docparse.js` (`AUTHOR_NAMES`): Father → Father Ahnsahnghong, Mother → Heavenly Mother, K Ellen and Kwansanim Ellen → Elderess Ellen. Exact matches only. Quotes with no author line show no attribution. The doc itself is never changed.
- **The doc's format:** each quote is a line in quotation marks, followed by a line starting with "- " for the author. Several fully quoted lines in one block are separate quotes; only the last gets the author line. Lyrics that run over two lines are one quote, and their line breaks are kept.
- Quote identity is `norm(text)` (lowercase letters and digits). Favorites and hidden quotes are stored by that key on the phone.
- No quote numbers are shown in the app.
- The doc is newest first: the app's + button inserts new quotes at the top of the doc, above the first quote and below the "Words of Life" title (`doPost` in `apps-script/Code.gs`).

## The quotes doc's title
- The script keeps the title in the form "1,795 Quotes || 20261120" (`updateTitle_` in `apps-script/Code.gs`): the count is every line in the **whole** doc (letters section included) that starts with a quotation mark — that's how the owner counts, and it matched exactly — and the date (yyyyMMdd, script time zone) is the day the text last changed. It runs on every doGet (each app open and the hourly job) and after the + button adds a quote. Titles in any other format are left alone.

## Sermons
- A second doc of ~915 sermon outlines, read by `sermons_()` in `apps-script/Code.gs` (`?doc=sermons&have=<md5>`; answers `unchanged` when the phone's copy matches). Its ID goes in `SERMONS_DOC_ID` in the owner's Apps Script only, never in this repo.
- `parseSermonText` in `docparse.js`: a title is a line ending in a label with a dash and a digit or "Preface" — "(1-19)", "(Transcription-237)", "(Sermon Collection 1-6)". Scripture refs like "(Mt 10:40–42)" have a colon and never count. Topic headings ("Prayer and the Spiritual Life") sit right above a title.
- **The codes in brackets are never shown in the app**; they stay in the doc. **Topics aren't shown either** (the parser still reads them).
- Sermons always sit on a papyrus / parchment / old-paper background (`paintPaper` in `painter.js`), in dark ink with red scripture tags, whatever the quotes' background setting.
- Sermon cards size their text to fit the panel (`fitSermon`, 11.5–17.5 px); ~4% of very long ones scroll inside the panel. No tap-to-expand.
- Tabs: Quotes · Favorites · Sermons, by tapping the top bar or swiping sideways. **Each tab has its own feed** (`views` in `app.js`: cards, shuffle deck, current place) in `#track`; switching tabs never resets a tab. **Each feed is one screen wide and sits in place; only while sliding are the active and neighbouring feeds moved, each with its own transform, and at rest the active feed has no transform.** Don't put the feeds on one wide shifted strip: on iPhone the text inside them wasn't drawn (sermons showed only paper). The globals `feed / cards / deck / current / io` are the *active* tab's — use `showTab(m)` to switch, `withView(m, fn)` / `eachView(fn)` / `resetTabs([...])` to act on other tabs. The drag follows the finger (`placeTrack`), commits past 25% of the width or on a flick, and resists past the ends. Only locking Sermons (leaving the app) resets the Sermons feed, and Favorites if it showed a sermon. One Favorites tab holds both; favorite sermons only show while Sermons is unlocked.
- **The Sermons PIN is fixed by the owner and can't be set, changed or reset in the app.** It is 6 digits. Only its salted SHA-256 fingerprint is in `app.js` (`PIN_HASH`, with `PIN_LENGTH`); to change it, compute `sha256("kw-sermons:" + pin)`, and match the dots in `index.html` to the length. Sermons lock whenever the app goes to the background. It's a privacy screen, not encryption — the repo is public, so a short PIN's fingerprint can be worked out by anyone determined.
- The library's item panel has **View in feed**, which restarts the feed on that quote or sermon (switching tabs if needed).
- Hourly notifications are quotes only. Sermons are shared as text, not pictures.

## The full-screen layout (iPhone)
- Tested on an iPhone 16 Pro Max Home Screen app (lab/ screen test): with the see-through status bar
  (`black-translucent`), anything `position: fixed` (and built-in modal `<dialog>`s) is clipped 62 pt
  (the status bar height) above the bottom; `innerHeight` is 894 on a 956 pt screen. Content in the
  page's normal flow does paint to the bottom.
- So the whole app lives in `#stage` (absolute, height `--stage-h` = the real screen height when the page
  starts under the status bar), and sheets are opened with `dialog.show()` inside the stage with our own
  `#sheetScrim`. Don't reintroduce `position: fixed` or `showModal()` for anything that must reach the bottom.
- iOS remembers the status bar style from when the app was added to the Home Screen; changing the meta tag
  only affects new installs.

## Making a change
- `docparse.js` is shared by the app (browser) and `scripts/notify.cjs` (Node). Keep it plain JS that works in both.
- **Bump `VERSION` in `sw.js` (and `APP_VERSION` in `app.js`) on every change to app files**, or phones keep serving the old copy.
- If `apps-script/Code.gs` changes, the owner has to paste it into Apps Script and deploy a new version (README step 1). Say so clearly; nothing else updates it.
- Painted backgrounds are drawn by `painter.js` from a seed (8 scene types). Photos are only the owner's own (IndexedDB). Online photos were removed: the random photo service can't be limited to nature.
- Test by serving the folder (`python3 -m http.server`) and faking the script in Playwright with `page.route('https://script.google.com/**', …)`, answering `{ok, name, url, text}`.
