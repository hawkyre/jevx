# Build instructions

Use Node.js 24 and npm. The lockfile pins the dependency graph.

From the source archive root:

```sh
npm ci
npm run build
npm run build:firefox
```

Chrome output: `.output/chrome-mv3`. Firefox output: `.output/firefox-mv3`.
No credentials or environment variables are needed to build. npm needs network access to download dependencies.

WXT compiles TypeScript and bundles and minifies JavaScript with Vite. All executable code is in the package. TypeSafe returns JSON assessment data, not executable code.

The source archive includes the PNG icons used at runtime. The full-size logo is in `assets/logo.png`. Icon conversion is not part of the build.

The full repository also includes tests. To validate and package a release from the repository, run `npm ci` then `npm run release`. WXT creates the Chrome ZIP, Firefox ZIP, and Firefox source ZIP in `.output`.
