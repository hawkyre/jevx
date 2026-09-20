# Store submission

## Listing text

Name: **jevx**

Summary: **Find posts worth your reply on X. Rank by your interests and recency, and collapse irrelevant posts.**

Description:

jevx helps you find conversations worth joining on X. Tell it what interests you, connect your own TypeSafe API key, and browse as usual.

- Filter loaded posts on Home and search pages.
- Collapse irrelevant posts into a small row. Select Show to reveal them.
- Rank matches from 1 to 5 using relevance and recency. Adjust the weights in Settings.
- Open searches from phrases or hashtags. Reuse existing search tabs.
- Explore an author's posts or search a related topic from the post menu.
- Keep your profile, settings, and key in your browser.

The extension is free and MIT licensed. AI assessment requires your own TypeSafe account and API key. TypeSafe API usage can incur charges. X access requires your own account where X requires sign-in.

Assessment sends your profile, eligible post text, quoted text, and author handles to TypeSafe. This occurs only after you enable assessment and connect a key. jevx has no developer-operated server or analytics.

jevx reads only posts that X loads. It does not crawl X, scroll automatically, write replies, or publish posts. Reply detection supports the observed English desktop layout and can miss replies when X omits markers. Images and videos are not assessed. Scores are AI judgments and can be wrong. X layout changes can affect filtering.

Independent project. Not affiliated with or endorsed by X or TypeSafe.

## Chrome privacy fields

Single purpose: Help users find relevant X posts to reply to by filtering and ranking loaded posts against their profile.

Permission explanations:

| Permission | Purpose |
| --- | --- |
| storage | Save profile, searches, consent, preferences, session assessments, and post overrides. |
| https://x.com/* | Read loaded posts, add filtering controls, and find/reuse X search tabs. |
| https://api.typesafe.ai/* | Send consented assessment requests using the user's own API key. |

Remote code: **No**. JavaScript is bundled in the extension. The external API returns JSON choices and scores.

Declare **Personally identifiable information**, **Authentication information**, **Personal communications**, and **Website content**. These cover freeform profiles, API keys, social posts, and author handles. Search terms are sent to X when users open searches; disclose this in any applicable search/browsing field presented by the dashboard. Do not select “no data collected.”

The developer does not sell data, use it for unrelated purposes, or use it for credit decisions. Confirm the dashboard certifications against the submitted version.

## Firefox

Choose a listed desktop extension, English locale, MIT license. Supply the Firefox extension ZIP and the separate source ZIP. Copy the policy from `public/privacy.html` into the privacy-policy field. Include `docs/BUILD.md` in reviewer notes or refer to it in the source archive.

The manifest declares website content, authentication information, personally identifying information, personal communications, and search terms. jevx also requires explicit consent in its settings before assessment.

## Reviewer test instructions

1. Install the extension and allow access to X.
2. Open Settings. Enter interests such as “language learning tools and vocabulary retention.” Save with assessment disabled.
3. Add a search in the popup and select Find posts. Confirm that X Latest search opens. Run it again and confirm tab reuse.
4. For live AI testing, use a dedicated TypeSafe review key supplied privately by the publisher. Never put that key in the package, source archive, listing, or repository. The key must have enough credit for review.
5. Enable assessment in Settings, save, and connect the review key. Open an English X feed and scroll to load posts.
6. Confirm that assessed matches have score buttons and filtered posts have Show controls. Open a score to inspect its breakdown.
7. Show or hide a post. Other posts must keep their controls. Open a reply composer; filtering waits until it closes.
8. Pause filtering, then disconnect. Confirm that new API assessments stop. Disconnect deletes the local key.

X and TypeSafe can require accounts. The publisher must provide any review access required by the stores through private reviewer fields. Mock interface previews in the repository do not prove live API behavior.

## Submission checklist

- [ ] Set the public repository URL and support contact in the listings.
- [ ] Host `public/privacy.html` at a public HTTPS URL and use it in Chrome's privacy field.
- [ ] Confirm that `jevx@extensions.local` is the permanent Firefox ID before the first submission. An email-shaped ID need not be a mailbox.
- [ ] Capture a live smoke test on Chrome and Firefox with the release package and a dedicated TypeSafe key.
- [ ] Supply review access privately if requested.
- [ ] Confirm publisher account details and store declarations.
- [ ] Upload `.output/jevx-0.1.0-chrome.zip` to Chrome.
- [ ] Upload `.output/jevx-0.1.0-firefox.zip` and `.output/jevx-0.1.0-sources.zip` to Firefox.
- [ ] Use `store/screenshot-1280x800.png`, `store/promo-440x280.png`, and `public/icon/128.png` as listing assets.

## Requirements checked

- [Chrome listing fields and screenshots](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Chrome privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Firefox data declarations](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [Firefox source submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)
