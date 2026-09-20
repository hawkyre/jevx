# Design files

The interface, logo, and promotional assets are included with the source code under the repository's [MIT license](../LICENSE). Third-party names and services are not part of jevx's branding.

## Open the previews

```sh
npm ci
npm run preview
```

Open the address printed by Vite, followed by one of these paths:

| Surface | Path |
| --- | --- |
| Popup | `/design/preview.html` |
| Settings and profile editor | `/design/preview.html?view=options` |
| Feed and Top matches | `/design/preview.html?view=feed` |
| Draft scorer | `/design/preview.html?view=draft` |
| Inline reply layout | `/design/preview.html?view=reply` |
| Store screenshot | `/design/store.html` |
| Draft store screenshot | `/design/store.html?draft` |
| Promotional tile | `/design/store.html?promo` |

Previews use the actual UI components with synthetic posts and mock scores. They need no accounts or API keys and make no TypeSafe requests. Settings changes stay in memory and reset on reload.

## Editable sources

| File | Purpose |
| --- | --- |
| `assets/ui.css` | Popup and settings layout, light/dark colors, spacing |
| `entrypoints/feed.content/style.css` | Post highlights, gold time pills, menus, ranking |
| `entrypoints/feed.content/draft.css` | Composer panel, score breakdown, goal selector |
| `lib/ui.ts`, `lib/draft-settings-ui.ts` | Settings and popup markup |
| `lib/post-actions.ts`, `lib/draft-composer.ts` | Post controls and draft panel markup |
| `design/preview.ts` | Synthetic fixtures and preview layouts |
| `design/store.html` | Editable store-art composition |
| `assets/logo.png` | Full-size raster logo source |
| `public/icon/*.png` | Runtime icon exports |
| `store/*.png` | Store screenshots and promotional tile |

The logo was generated with Imagegen. Its prompts are in `store/logo-prompts.txt`. The supplied source is raster, not an editable vector.

The extension follows the system's light/dark preference. Preview both themes using browser appearance controls. Green intensity follows the displayed 1–5 post score. Gold marks post timestamps under one hour old. Draft details expand on demand. Visual tokens remain unvalidated until tested with users.

## Export

Icon generation requires ImageMagick in addition to Node.js:

```sh
for size in 16 32 48 128; do
  convert assets/logo.png -resize "${size}x${size}" -strip "public/icon/${size}.png"
done
```

For store screenshots, capture the rendered artboard in `design/store.html` at its native 1280×800 size. The `promo` artboard is 440×280. Crop to the artboard without stretching it. Keep the sample-content label visible. Do not use real user drafts or account details in public artwork.

The design previews are not shipped as extension pages. Normal extension builds use the checked-in icons and do not need ImageMagick.
