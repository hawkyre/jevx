# jevx

A small, open-source extension for finding posts worth replying to on X.

Save searches. Tell Jev what interests you. Relevant posts stay expanded with a quiet highlight. Other posts collapse into a single row.

## Install locally

Use Node.js 24, Chrome 116 or later, or Firefox 140 or later.

```sh
npm ci
npm run build
npm run build:firefox
```

**Chrome:** Open `chrome://extensions`. Enable Developer mode. Select **Load unpacked**, then select `.output/chrome-mv3`.

**Firefox:** Open `about:debugging#/runtime/this-firefox`. Select **Load Temporary Add-on**, then select `.output/firefox-mv3/manifest.json`. Firefox removes temporary add-ons after a restart. Allow access to X when Firefox requests it.

Reload existing X tabs after installation.

## Use it

1. Open jevx, then select **Settings**.
2. Enter your interests. Add your background, audience, and exclusions if useful.
3. Enable Jev assessment and save your profile.
4. Enter your own TypeSafe API key. The next assessment checks the key.
5. Add phrases, hashtags, or X search expressions in the popup.
6. Select searches and click **Find posts**.

Searches open in X's Latest view with replies excluded. The extension reuses its search tabs if they still show that search. It does not navigate tabs that you moved elsewhere.

The filter runs automatically on X Home, including **For you** and **Following**, and on loaded posts across X tabs. Saved searches are optional. Use **Settings** in the feed toolbar to set up your profile and key without opening the extension popup.

**Show** reveals a collapsed post. **Show all** reveals the current tab. **Filter off** pauses filtering across tabs. **Explore** opens an author search or a related search you enter. Add that search in the popup if you want to save it.

Posts expire at exactly 60 minutes. Reposts use the original post's date. Quote posts use their own date and include available quoted text. Replies and expired posts bypass Jev.

## Data and cost

| Data | Storage or destination |
| --- | --- |
| Profile, saved searches, filter preference, consent | This browser's local extension storage |
| TypeSafe key | Extension-origin IndexedDB; persists across restarts until you disconnect or remove the extension |
| Assessments and Show/Hide choices | Session storage; entries expire with the post |
| Managed search tab IDs | Session storage |
| Eligible post text, quoted text, author, profile | TypeSafe, only after you enable assessment |

The extension has no subscription, server, analytics, or X API dependency. TypeSafe charges for API use. Check [current pricing](https://docs.typesafe.ai/models). Your key never enters X's page scripts. Post text is not persisted by jevx.

Assessments are shared across tabs. The cache includes the post content, profile, model, and criteria version. Profile edits invalidate previous matches. A service failure stops further requests until you pause and resume or update settings. Failed or uncertain assessments remain visible.

## Development

```sh
npm run dev
npm run dev:firefox
npm run typecheck
npm test
npm run build:firefox
npm run lint:firefox
npm run zip
npm run zip:firefox
```

For a local interface preview with synthetic posts and mocked assessments:

```sh
npx vite --host 127.0.0.1
```

Open `/tests/preview.html`, `/tests/preview.html?view=options`, or `/tests/preview.html?view=feed`. Preview data does not persist. Preview files are not included in extension builds.

## Current limits

- The extension reads only posts X loads. It does not crawl, scroll automatically, or guarantee complete search coverage.
- Reply detection supports the observed English layout. Other languages remain unassessed. X can change its markup; ambiguous or missing dates remain visible.
- Thread pages can omit reply markers. The opened post stays unassessed when its type is unclear. Other thread posts are excluded.
- Collapsed rows remain separate. X's virtualized feed can affect spacing and scrolling; use **Show all** if the layout behaves incorrectly.
- Jev sees text, not images or videos. Missing context can keep a post visible without a highlight.
- The API contract, background flow, and UI use automated tests with mocked responses. Real Jev relevance quality requires a user key and review of actual matches.
- The request timeout and initial visual tokens are explicitly unvalidated settings. Adjust them from measured behavior.

MIT licensed.
