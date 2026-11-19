# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Nothing yet — add your entry above this line under the relevant heading
  (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`).

## [2.0.0] - 2026-11-19

Repository and application restructuring. Behaviour, visual design and prompts are
unchanged from v1; everything around them is new.

### Added

- **Layered source tree** under `src/`: `config.js`, `core/` (13 primitives),
  `api/`, `services/`, `ui/`, `modules/` and a single `main.js` entry point —
  replacing one 1,647-line HTML file.
- **Credential flow.** An in-app settings dialog for the Gemini API key and model,
  persisted in `localStorage`; a sidebar status chip (`SET` / `MISSING` /
  `INJECTED`) and a live engine label. The app is now usable straight after
  `git clone`, instead of depending on a host that injects a key at runtime.
- **Host configuration** via `window.NEXUS_CONFIG` / `window.NEXUS_API_KEY`, deep
  merged over `DEFAULT_CONFIG` (`src/js/config.js`).
- **Build pipeline**: `scripts/build.mjs` compiles Tailwind and assembles a
  dependency-free `dist/`; `scripts/dev.mjs` builds, serves and watches;
  `scripts/serve.mjs` is a traversal-safe static server bound to `0.0.0.0`.
- **Static integrity checks** (`scripts/verify.mjs`, `npm run verify`): DOM ids
  referenced from JS must exist in the markup, relative imports must resolve,
  named imports must really be exported, bus actions must be registered, and
  key-shaped literals are rejected.
- **Test suite**: 80 tests (`node:test`) covering prompts, escaping, URL
  safety, formatting, history trimming, config merging, credential precedence and
  the API client (header auth, retries, timeouts, error mapping) with a stubbed
  `fetch` — plus a jsdom boot smoke test (`tests/boot.test.js`) that loads the real
  `index.html` and `main.js`, drives the tabs, theme, settings dialog and module
  forms, and asserts that the `els` map agrees with the markup.
- **CI/CD**: `ci.yml` (format → lint → verify → test → build → secret scan →
  artifact) and `pages.yml` (GitHub Pages deployment on push to `main`).
- **Community files**: README, this changelog, CONTRIBUTING, SECURITY,
  CODE_OF_CONDUCT, MIT LICENSE, issue forms, PR template, CODEOWNERS and
  Dependabot config.
- **Tooling configs**: ESLint flat config with per-layer globals, Prettier,
  EditorConfig, `.gitattributes`, `.gitignore`, PostCSS and Tailwind config.
- **Brand assets**: SVG sources in `assets/brand/`, plus generated favicon, PWA
  icons (`icon-192.png`, `icon-512.png`), `site.webmanifest`, `robots.txt`,
  `og-image.png` and a self-contained `404.html`.
- **UI/UX**: `<noscript>` notice, Open Graph/Twitter metadata, `theme-color`,
  print stylesheet for archiving briefings, `prefers-reduced-motion` support,
  slim scrollbars, keyboard focus rings, Escape/backdrop close and a focus trap in
  the settings dialog, `data-nexus-ready` boot flag.

### Changed

- **Tailwind Play CDN → compiled CSS.** The browser no longer downloads a ~300 KB
  JIT runtime; the shipped stylesheet is purged and minified (~31 KB).
- **Inline `<script>` → ES modules.** The single IIFE is now 24 modules with an
  explicit dependency direction and an action bus (`core/bus.js`) for the
  cross-module calls (archive → briefing, briefing → matrix, API client → dialog).
- **Prompts extracted** from event handlers into `src/js/core/prompts.js`.
- **Signal Matrix schema** hoisted to an exported `MATRIX_RESPONSE_SCHEMA`
  constant, and its `JSON.parse` is now guarded with a readable error.
- **API client** (`api/gemini.js`): factory-injected key/model providers,
  `x-goog-api-key` header authentication, `AbortController` timeout,
  `NexusApiError` with machine-readable codes, `firstText()` handling multi-part
  responses, and `blockReason()` surfacing `SAFETY`/`RECITATION` finishes instead
  of an empty panel.
- **Clipboard**: async Clipboard API first, `execCommand` fallback second.
- **Chat history** is trimmed to `config.limits.chatHistoryMaxMessages` after each
  turn; the in-flight typing bubble is tracked by reference instead of a DOM
  lookup.
- **Upload limits, toast lifetime, storage keys** and the model id now come from
  `config.js` rather than inline literals.
- Theme is applied by an inline bootstrap in `<head>`, removing the flash of the
  wrong theme on load.

### Fixed

- Missing `showToast` import in the dossier archive (found by ESLint during the
  split) — deleting a saved dossier would have thrown.
- Self-referential `backoffBaseMs` initialisation in the API client (found by the
  test suite).
- Citation links could previously carry an arbitrary scheme; they now pass through
  `safeUrl()`.

### Removed

- `nexus_intelligence_web_app.html` — the v1 single-file build. It is preserved in
  the git history and tagged `v1.0.0-single-file` (commit `32a0bbb`).
- The Tailwind Play CDN script and its inline `tailwind.config` object.
- The `?key=` query-string authentication pattern.

### Security

- No credentials are stored in the repository; CI fails on key-shaped strings.
- Model output is HTML-escaped before rendering, and generated URLs are restricted
  to safe schemes. See [SECURITY.md](SECURITY.md).

## [1.0.0] - 2026-11-19

### Added

- Initial upload: `nexus_intelligence_web_app.html`, a single-file NEXUS build with
  four modules (OSINT Briefing, Signal Matrix, Visual Intel, Analyst Comms),
  Tailwind Play CDN styling, localStorage dossier archive and dark/light themes.

[unreleased]: https://github.com/AliB11/Nexus/commits/main
[2.0.0]: https://github.com/AliB11/Nexus/compare/v1.0.0-single-file...main
[1.0.0]: https://github.com/AliB11/Nexus/tree/v1.0.0-single-file
