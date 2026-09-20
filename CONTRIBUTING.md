# Contributing

Use Node.js 24. Run `npm ci`, then `npm run preview` to work on the interface without X or a TypeSafe key. See [design previews](design/README.md).

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

Code and design contributions use the repository's MIT license. Include license notices for any third-party material you add.
