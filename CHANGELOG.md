# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Chat payloads can no longer open with the assistant's turn.** A history
  trimmed mid-pair used to start on the model's reply, which the Gemini
  transport answers with a 400 — every later Analyst-Comms turn would fail on
  `provider: google` once the conversation outgrew the 30-turn window.
  `trimChatHistory()` now guarantees a user-first payload, and
  `toGeminiRequest()` drops leading model turns as a second line of defence.
- **The Signal Matrix schema is translated to JSON Schema on the OpenAI wire.**
  The Gemini-dialect schema (`OBJECT`/`STRING`, `propertyOrdering`) was sent
  verbatim under `response_format: json_schema`, which strict OpenAI-compatible
  endpoints (OpenAI, OpenRouter, vLLM…) reject. `toOpenAISchema()` now lowers
  the types, strips the Gemini-only hint and closes objects with
  `additionalProperties: false` plus a full `required` list.
- **Untitled web citations survive.** `extractSources()` dropped every
  grounding attribution whose `title` was empty; it now labels the source with
  its hostname instead of losing it.
- **Images follow the last user turn on both transports.** The Gemini mapper
  attached inline data only when the final turn was the user's, silently
  dropping images otherwise.
- **A failed dossier save is no longer celebrated.** `persistDossiers()`
  returns whether the write landed, the save button rolls back on failure
  (quota full / private mode), and the archive is capped at
  `limits.dossierMax` (100) so it cannot exhaust the localStorage quota.
- **Corrupt archived data cannot break the sidebar** — `loadDossiers()` accepts
  only a well-formed array of dossier-shaped records.
- **A reported confidence of 0 stays 0** — `Number(...) || 75` promoted a
  legitimate zero to the 75 % fallback; only missing/NaN scores fall back now.
- **A non-object matrix payload fails loudly** instead of rendering a card of
  «نامشخص» placeholders.
- **Switching gateway A→B→A in one dialog session** now restores A's URL and
  model (the handler compared against the persisted provider, not the one the
  form was showing).
- **Enter in the model field no longer saves the dialog** mid-datalist
  selection, matching the documented intent.
- **`scripts/serve.mjs` blocks sibling-directory traversal** (`dist2` next to
  `dist` passed the old bare `startsWith` prefix check).
- The settings dialog's test button ships an inline SVG — the previous
  `<i data-lucide>` icon never rendered (lucide is not bundled).

### Changed

- Preset buttons dispatch a cancelable `submit` event; stale v1 comments in
  `state.js` / `dom.js` were cleaned up. Tests: 150 → 157.

## [2.2.0] - 2026-11-20

The model gateway is now pluggable, and **Coarena** is the default: one free key
fronts 24 models instead of a single vendor.

### Added

- **Coarena gateway** (`https://coarena.ai/api/v1`, model `gemini-3-8-flash`) as the
  default transport — an OpenAI-compatible Chat Completions client in
  `src/js/api/openai.js`: `Authorization: Bearer`, inline base64 images, enforced
  `json_schema` structured output, `Retry-After`-aware backoff, and a 429 carrying
  `x-should-retry: false` treated as final instead of retried.
- **A three-field credential form.** The settings dialog now takes the **API key**,
  the gateway **URL** and the **model** — plus a gateway selector — so pointing
  NEXUS at OpenRouter, Groq, a local `llama.cpp`/Ollama server or your own proxy is
  a matter of typing a URL. No code change, no rebuild.
- **«تست اتصال» — a connection test.** It reads the public `/models` catalogue, then
  spends a single token on a chat call, and reports latency, the number of models
  the gateway listed and the model that actually answered. It probes the values
  _typed into the form_, never persists them, corrects a near-miss model id in place
  (`gemini-3.8-flash` → `gemini-3-8-flash`), and translates 18 Coarena error codes
  into Persian advice (`model_api_terms_required`, `insufficient_quota`,
  `api_key_expired`, `model_not_found`, …).
- **`src/js/services/provider.js`** — the single place that decides where NEXUS
  talks to: a `PROVIDERS` registry, per-request credential resolution, a client
  cached per gateway, and the neutral `NexusRequest` / `NexusResult` contract every
  module now uses.
- **`src/js/api/errors.js`** — the shared `NexusApiError`, OpenAI error-envelope
  parsing and the backoff helper, used by both transports.
- **`scripts/proxy.mjs` (`npm run proxy`)** — a zero-dependency pass-through proxy
  that forwards method, headers and body to the gateway and adds CORS headers. It
  is the documented fallback for a static deployment whose gateway refuses
  cross-origin browser calls; browsers treat `http://127.0.0.1` as trustworthy, so
  it also works from an HTTPS page.
- **Tests:** `tests/openai.test.js` (wire format, retries, error mapping, timeout,
  CORS diagnosis), `tests/provider.test.js` (routing, credential precedence,
  connection-test outcomes, model-alias correction) and `tests/proxy.test.js`
  (pass-through, CORS, preflight, 502 shape, key never logged). 92 → **150 tests**.

### Changed

- **Google AI Studio is now an alternative gateway**, not the only one. Its
  client keeps the `x-goog-api-key` header and `generateContent` protocol, and it
  remains the only transport with live web grounding.
- **Modules speak a neutral request.** `briefing.js`, `matrix.js`, `visual.js` and
  `comms.js` call `runRequest({ system, messages, images, jsonSchema, grounding })`
  and read `result.text` / `result.sources` / `result.finishReason`; none imports a
  transport any more. Chat history is stored provider-neutral (`{ role, text }`).
- **Grounding is reported honestly.** On a gateway with no web-search tool,
  Modules 01 and 04 say so in a toast and render no citation card, instead of
  implying sources that were never fetched.
- **Cost routing is surfaced.** The answering model comes from the response body,
  so a gateway that substitutes a cheaper model says which one answered.
- **Upload limit 10 MB → 8 MB**, matching Coarena's `max_image_bytes: 8388608` for
  its Gemini models.
- `api.maxRetries` 4 → **3** (Coarena allows 30 requests/minute, so retries stay
  modest); `formatModelLabel` rejoins a dotted version (`gemini-3-8-flash` →
  `GEMINI 3.8 FLASH`); the sidebar engine label now names the gateway
  (`Coarena · GEMINI 3.8 FLASH`).
- **Docs rewritten** for the new seam: `DEPLOYMENT.md` §5 (gateway, CORS, proxy,
  edge-key pattern), `CONFIGURATION.md` (gateway table, model choice, proxy
  variables, storage schema), `ARCHITECTURE.md` (transport layer, data flows,
  security model) and `SECURITY.md`.

### Fixed

- **`scripts/verify.mjs` mistook prose for code.** An import scan that matched
  across newlines parsed the phrase "modules never _import_ a transport" as an
  `import … from` statement and reported every JSDoc brace in between as a missing
  export. Comments are now blanked before the import/export/bus scans, and imports
  are anchored to a statement start.
- **The credential scan was Google-only.** It now covers Coarena (`coa_…`),
  Anthropic (`sk-ant-…`) and OpenAI (`sk-…`) key shapes, and scans `docs/`,
  `public/` and the top-level documentation — not just `src/js/`.
- A non-absolute stored base URL (`javascript:…`) is discarded instead of being
  used as an endpoint.

### Security

- The key travels only in an `Authorization: Bearer` header; the connection test
  never writes to storage; the proxy forwards `Authorization` but never logs it.
- **Documented:** Coarena stores every prompt and reply sent through its Model API
  and may license them in datasets, and that cannot be withdrawn. The settings
  dialog states this next to the gateway selector, and `SECURITY.md` advises against
  pasting sensitive personal data while that gateway is selected.

## [2.1.0] - 2026-11-20

The workspace is now Persian and right-to-left, and it is deployed to Vercel.

### Added

- **Persian (RTL) interface.** `<html lang="fa" dir="rtl">`, Vazirmatn in the
  `sans` and `mono` font stacks, and every label, placeholder, toast, banner and
  model prompt translated. `NEXUS`, `GEMINI`, model ids, the UTC clock and the
  `localStorage` keys stay Latin — they are brand, protocol or stored data.
- **`src/js/core/labels.js`** — render-time translation of the wire enums
  (`threatLevel`, `sentiment`, `category`, briefing `focus`). The enums stay
  English because they are part of the Gemini `responseSchema` and of dossiers
  already archived in `localStorage`.
- **`src/js/core/schema.js`** — the Module 02 structured-output contract, moved
  out of `modules/matrix.js` so it is DOM-free data that tests can assert
  without jsdom.
- **Persian digits** for user-facing counters (`۱٬۲۳۴ نویسه`, dossier count,
  citation count); timestamps, file sizes and the telemetry clock keep their
  Latin technical form and are marked `dir="ltr"`.
- **Markdown rendering for ordered lists, blockquotes, horizontal rules and
  links.** `renderMarkdown()` previously emitted those as literal text, even
  though the Gemini briefings produce numbered action lists. Links are lifted
  out of the inline pass and every `href` goes through `safeUrl()`.
- **Vercel deployment** at <https://nexus-alib11.vercel.app/>, plus the settings
  and caveats documented in `docs/DEPLOYMENT.md §3`.
- Tests: 92 passing (was 80), including an RTL guard that fails the build if a
  physical direction utility reappears anywhere in `src/`, a nav-tab
  markup/class parity check, and enum-to-label sync assertions against the
  response schema.

### Changed

- **Logical direction utilities everywhere.** `left-0`/`right-5`/`pl-`/`pr-`/
  `ml-`/`mr-`/`border-r`/`rounded-tl-none`/`text-left` are replaced by
  `start-0`/`end-5`/`ps-`/`pe-`/`ms-`/`me-`/`border-e`/`rounded-ss-none`/
  `text-start`, so the shell mirrors instead of leaking an LTR layout into RTL.
- **The mobile drawer slides along the inline axis.** JS toggles a single
  `drawer-closed` class and `main.css` picks the sign from `dir`, replacing the
  hardcoded `-translate-x-full` that was duplicated across three modules.
- **Nav-tab styling moved into `.nav-tab` / `.nav-tab-active`.** `switchTab()`
  used to rebuild each button's whole `className` from two duplicated Tailwind
  strings (markup + JS) that had drifted apart; it now only toggles a class and
  sets `aria-current`.
- `uppercase` and wide `tracking-*` are neutralised for `[lang="fa"]` copy —
  casing is meaningless in an Arabic-derived script and tracking tears connected
  glyphs apart. Technical spans opt back in with `dir="ltr"`.
- `engines.node` pinned from `>=20.0.0` to `22.x` so local, CI and Vercel build
  on the same major (Vercel was silently using 26.x).

### Fixed

- Resetting the chat while a request was in flight left a detached typing
  indicator that the pending response would re-append to the cleared transcript.
- The toast container was not a live region; it is now `role="status"`
  `aria-live="polite"`, so screen readers announce feedback.
- `#dismissErrorBtn` was an icon-only button with no accessible name.
- The briefing focus badge printed the raw English enum in upper case instead of
  its Persian label.
- `<link rel="canonical">` pointed at the GitHub repository rather than the
  deployed app; `og:url`, an absolute `og:image`, `og:locale` and the Twitter
  card tags are now set.

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
