# Contributing

Use Node.js 24. Run `npm ci`, then `npm run preview` to work on the interface without X or a TypeSafe key.

Use `npm run dev` or `npm run dev:firefox` to test the extension in a browser. Use synthetic posts and mocked responses in automated tests. Never commit API keys, browser profiles, private drafts, or screenshots from a signed-in account.

Before submitting a change, run:

```sh
npm run release
```

This runs type checking, tests, both package builds, Firefox validation, and release checks. API tests do not use paid requests.

Keep changes focused. Add a regression test for behavior changes. For UI changes, inspect light and dark themes, narrow layouts, and keyboard focus. Include a screenshot with synthetic content when it helps explain the change.

X reuses post elements and changes routes without reloading. Preserve its editor, focus, and native controls. Results must belong to the current post or draft. Do not apply stale results after navigation, settings changes, or edits.

Keep model scores on the integer 1–5 scale. Mark untested heuristics and visual defaults as unvalidated. Changes to transmitted data need matching consent and privacy-policy updates.

Use short semantic commit messages, such as `fix: preserve reply focus`. Explain the problem, the resulting behavior, and the checks in the pull request.

Code and asset contributions use the repository's MIT license. Include license notices for any third-party material you add.

## UI previews and assets

Open `/tools/preview.html` on the local Vite server. Add `?view=options`, `?view=feed`, `?view=draft`, or `?view=reply` for the other surfaces. Previews use the actual components with synthetic data and no TypeSafe requests. Changes reset on reload. Check system light and dark themes and narrow widths.

Edit UI styles in `assets/ui.css` and `entrypoints/feed.content/*.css`. The full-size logo is `assets/logo.png`; runtime icons are in `public/icon/`. To export icons with ImageMagick:

```sh
for size in 16 32 48 128; do
  convert assets/logo.png -resize "${size}x${size}" -strip "public/icon/${size}.png"
done
```

`/tools/store.html` renders the 1280×800 store artboard. Add `?draft` for the draft scorer or `?promo` for the 440×280 promotional tile. Capture the artboard without stretching it and save screenshots in `assets/store/`. Keep the sample-content label visible. Do not use private content in artwork. Normal builds use the checked-in icons and do not need ImageMagick.
