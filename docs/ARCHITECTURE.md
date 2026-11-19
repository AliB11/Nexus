# NEXUS Architecture

This document is the structural reference for the repository: what each layer is
for, how data moves through it, and where new work belongs.

- **Audience:** contributors and reviewers.
- **Companion docs:** [CONFIGURATION.md](CONFIGURATION.md) · [DEPLOYMENT.md](DEPLOYMENT.md) · [../SECURITY.md](../SECURITY.md)

---

## 1. Design constraints

NEXUS is deliberately small and deliberately static. Every decision below follows
from these four constraints:

| Constraint                    | Consequence                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **No backend**                | The browser calls the Gemini API directly. There is no session, no database and no server-side secret; the visitor supplies their own API key. |
| **No bundler**                | Source ships as native ES modules. `npm run build` compiles CSS and _copies_ JS — it never rewrites it. What you read in `src/` is what runs.  |
| **Untrusted model output**    | Everything the model returns is treated as hostile input: escaped before it reaches `innerHTML`, and every generated URL is scheme-checked.    |
| **Zero runtime dependencies** | No framework, no icon pack, no markdown library. The only runtime third-party assets are Tailwind's compiled CSS and Google Fonts.             |

Build and test tooling (`tailwindcss`, `eslint`, `prettier`, `jsdom`) is dev-only.
The deployed artifact is plain HTML, CSS and JS.

---

## 2. Layer map

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Browser                                                                  │
│                                                                          │
│  src/index.html  ── shell markup: header, sidebar, 4 panels, dialog      │
│        │                                                                 │
│        ▼                                                                 │
│  src/js/main.js  ── boot: theme → clock → settings → archive → modules   │
│        │                                                                 │
│        ├── modules/  briefing · matrix · visual · comms   (UI + flow)    │
│        │        │                                                        │
│        │        ├── core/    dom · state · bus · navigation · theme      │
│        │        │            toast · clipboard · markdown · sanitize     │
│        │        │            format · history · prompts · clock          │
│        │        │                                                        │
│        │        ├── services/ dossiers (archive) · settings (credentials)│
│        │        │                                                        │
│        │        └── api/     client (singleton) → gemini (REST + retry)  │
│        │                                                                 │
│        └── ui/     settings-dialog (API key + model)                     │
│                                                                          │
│  src/js/config.js ── every tunable default, overridable at runtime       │
└──────────────────────────────────────────────────────────────────────────┘
                                   │  HTTPS
                                   ▼
             generativelanguage.googleapis.com/v1beta  (Gemini API)
```

**Rule of direction:** dependencies point _downwards and inwards_. `modules/`
may import `core/`, `services/`, `api/` and `config.js`. `core/` never imports a
module. Nothing imports `main.js`. The one horizontal conversation — briefing →
matrix, archive → briefing — goes through the action bus (§6) so the module graph
stays acyclic.

---

## 3. Repository layout

```
Nexus/
├── .github/                     Community & automation
│   ├── ISSUE_TEMPLATE/          Structured bug / feature forms (+ contact links)
│   ├── workflows/
│   │   ├── ci.yml               format → lint → verify → test → build → secret scan
│   │   └── pages.yml            build & publish dist/ to GitHub Pages on push to main
│   ├── CODEOWNERS               Review requirements per sensitive path
│   ├── PULL_REQUEST_TEMPLATE.md Reviewer checklist
│   └── dependabot.yml           Monthly npm + actions updates (grouped)
├── assets/brand/                SVG sources for the favicon, PWA icons and OG image
├── docs/                        This folder: architecture, configuration, deployment
├── public/                      Copied verbatim into dist/ (favicon, icons, manifest,
│                                robots.txt, 404.html, og-image.png)
├── scripts/                     Build & dev tooling (Node, no dependencies)
│   ├── build.mjs                Tailwind compile + copy → dist/
│   ├── dev.mjs                  build → serve → watch → rebuild
│   ├── serve.mjs                Static file server (0.0.0.0, traversal-safe)
│   ├── verify.mjs               Static integrity checks (see §9)
│   └── generate-icons.mjs       Optional SVG → PNG rasteriser for brand assets
├── src/
│   ├── index.html               The single page: shell + all four module panels
│   ├── styles/main.css          Tailwind layers + scrollbars, print, reduced motion
│   └── js/
│       ├── config.js            Runtime configuration & defaults
│       ├── main.js              Entry point / boot sequence
│       ├── core/                Framework-free primitives (no feature knowledge)
│       ├── api/                 Gemini REST client + shared instance
│       ├── services/            Persistence: dossier archive, credentials
│       ├── ui/                  Cross-cutting UI (settings dialog)
│       └── modules/             The four intelligence modules
├── tests/                       Node built-in test runner (node:test)
├── .editorconfig  .gitattributes  .gitignore  .prettierrc.json  .prettierignore
├── eslint.config.js             Flat config; browser/node globals declared per layer
├── package.json                 Scripts + dev dependencies only
├── postcss.config.js            tailwindcss + autoprefixer
├── tailwind.config.js           darkMode: class, obsidian palette, content globs
├── CHANGELOG.md  CODE_OF_CONDUCT.md  CONTRIBUTING.md  LICENSE  README.md  SECURITY.md
└── dist/                        Build output (git-ignored)
```

---

## 4. Module-by-module reference

### `src/js/config.js` — runtime configuration

Single source of truth for every tunable: API base URL, default model, retry
count, backoff base, request timeout, localStorage key names, upload limits,
chat history cap, toast lifetime. `DEFAULT_CONFIG` is frozen; the exported
`config` is a deep clone merged with `window.NEXUS_CONFIG` when the host page
defines it. `deepMerge` is exported and unit-tested.

### `src/js/core/` — primitives

| File            | Responsibility                                                                                                 | Pure? |
| --------------- | -------------------------------------------------------------------------------------------------------------- | ----- |
| `dom.js`        | The `els` map: every id the app touches, resolved once at boot. Plus `byId()` and `assertElements()`.          | no    |
| `state.js`      | The mutable app state object (`activeTab`, `currentBriefing`, `dossiers`, `visualImage`, `chatHistory`).       | no    |
| `bus.js`        | `registerAction` / `invokeAction` / `tryInvokeAction` — the acyclic cross-module channel.                      | yes   |
| `sanitize.js`   | `escapeHtml()` and `safeUrl()` (scheme allowlist: http, https, mailto).                                        | yes   |
| `markdown.js`   | `renderMarkdown()` — escapes first, then renders headings, lists, bold, italic, inline code.                   | yes   |
| `format.js`     | `formatModelLabel`, `formatUtcTimestamp`, `formatUtcClock`, `formatFileSize`, `formatCharacterCount`.          | yes   |
| `history.js`    | `trimChatHistory()` — bounded conversation payload.                                                            | yes   |
| `prompts.js`    | **All model instructions.** System prompts, the four visual directives and the prompt builders.                | yes   |
| `toast.js`      | `showToast`, `showError`, `hideError` — non-blocking feedback (never `alert()`).                               | no    |
| `clipboard.js`  | `copyToClipboard()` — async Clipboard API with a hidden-textarea `execCommand` fallback for sandboxed iframes. | no    |
| `theme.js`      | `initTheme`, `toggleTheme`, `getTheme` — persisted light/dark.                                                 | no    |
| `navigation.js` | `switchTab`, `openMobileSidebar`, `closeMobileSidebar`.                                                        | no    |
| `clock.js`      | `updateClock(now?)`, `startClock(intervalMs)` — header UTC telemetry.                                          | no    |

`prompts.js` deserves emphasis: in an AI product the prompts _are_ the business
logic, so they are versioned, reviewed and diffed in one file instead of being
buried inside event handlers.

### `src/js/api/` — the Gemini boundary

- `gemini.js` — `createGeminiClient({ getApiKey, getModel, maxRetries, backoffBaseMs, timeoutMs })`.
  Returns `{ generate, getModel, hasKey }`. Behaviour:
  - key is sent as the **`x-goog-api-key` header**, never as a URL query parameter;
  - `AbortController` timeout per attempt;
  - exponential backoff (1s, 2s, 4s, 8s) on `429`, `5xx` and network failures;
  - `4xx` (other than 429) is fatal and is **not** retried;
  - missing key throws `NexusApiError{ code: "missing_api_key" }` _and_ fires the
    `apikey:prompt` bus action, so the UI opens the settings dialog on its own;
  - helpers `firstText()` (concatenates all text parts), `blockReason()`
    (surfaces `SAFETY`/`RECITATION`/… instead of a blank screen) and
    `extractSources()` (grounding citations, `groundingAttributions` first with a
    `groundingChunks` fallback, de-duplicated by URI).
- `client.js` — the singleton `api` instance wired to `services/settings.js`.
  Key and model are read **per request**, so a change in the dialog applies
  immediately with no reload.

### `src/js/services/` — persistence

- `dossiers.js` — the saved-briefing archive: `loadDossiers`, `persistDossiers`,
  `renderDossierList`. All `localStorage` access is inside `try/catch` (Safari
  private mode and sandboxed iframes throw).
- `settings.js` — credential resolution and storage. Order of precedence:
  `window.NEXUS_CONFIG.apiKey` → `window.NEXUS_API_KEY` → `localStorage`. Also
  `maskKey()` for display and `isKeyInjected()` so the UI can lock the field when
  the host supplies the key.

### `src/js/ui/settings-dialog.js`

The API key / model dialog: opens on first run and on any unauthenticated
request, saves to localStorage, refreshes the sidebar status chip
(`SET` / `MISSING` / `INJECTED`) and the engine label. Handles Escape, backdrop
click and a Tab focus trap.

### `src/js/modules/` — the four intelligence modules

| #   | File          | Panel            | Gemini feature used                                     | Output                                                       |
| --- | ------------- | ---------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| 01  | `briefing.js` | `panel-briefing` | `tools: [{ google_search: {} }]` + system instruction   | Markdown report + verified web citations                     |
| 02  | `matrix.js`   | `panel-matrix`   | `responseMimeType: application/json` + `responseSchema` | Threat level, sentiment, confidence, entities, SWOT, actions |
| 03  | `visual.js`   | `panel-visual`   | `inlineData` (base64 PNG/JPEG/WebP ≤ 10 MB)             | Directive-driven visual brief (4 modes)                      |
| 04  | `comms.js`    | `panel-comms`    | Multi-turn `contents` history, optional grounding       | Chat transcript with per-answer citations                    |

Each module exports its handlers plus one `init<Module>()` that binds its own
listeners and registers the actions other modules may call. Nothing is bound
centrally any more — `main.js` only calls the four `init` functions.

The Signal Matrix schema is exported as `MATRIX_RESPONSE_SCHEMA` at the top of
`matrix.js`: it is the contract between the prompt and the renderer, so it is
worth reading on its own.

### `src/js/main.js` — boot

```
assertElements()  →  initTheme()  →  startClock()  →  initSettingsDialog()
→ loadDossiers()  →  initBriefing/Matrix/Visual/Comms()  →  bindShellEvents()
→ registerGlobalErrorHandlers()  →  switchTab(state.activeTab)
→ open settings dialog if no key  →  <html data-nexus-ready="true">
```

`assertElements()` fails fast with the list of missing ids rather than letting a
`null` dereference appear later in some unrelated handler. The whole boot is
wrapped in `try/catch`; a failure is reported in the on-page error banner and
sets `data-nexus-ready="false"`, which makes smoke-testing trivial.

---

## 5. Data flows

### Module 01 — OSINT briefing

```
form submit / preset click
  → handleBriefingSubmit(e)
      topic   = #briefingTopic.value.trim()
      focus   = #briefingFocus.value
      payload = { contents:[{parts:[{text: buildBriefingQuery({topic,focus})}]}],
                  tools:[{google_search:{}}],
                  systemInstruction:{parts:[{text: BRIEFING_SYSTEM_PROMPT}]} }
  → api.generate(payload)                      [retry/backoff, key header]
  → firstText(result)  +  extractSources(candidate)
  → dossier = { id:"dos_"+Date.now(), topic, focus, timestamp, rawText, sources }
  → state.currentBriefing = dossier
  → renderBriefing(dossier)                    [renderMarkdown + citation grid]
  → "Save Dossier" → state.dossiers.unshift → persistDossiers() → localStorage
  → "Extract Matrix" → invokeAction("matrix:runFromText", dossier)
```

### Module 02 — Signal Matrix

```
textarea (or text pushed from Module 01)
  → handleMatrixSubmit(e)
      payload.generationConfig = { responseMimeType:"application/json",
                                   responseSchema: MATRIX_RESPONSE_SCHEMA }
  → api.generate(payload) → firstText → JSON.parse (guarded, friendly error)
  → renderMatrixResult(data)
      threatLevel → badge colour map (LOW/MODERATE/ELEVATED/CRITICAL)
      confidenceScore → clamped 0..100 → bar width
      entities[] / strengthsOrOpportunities[] / risksOrThreats[] / actionItems[]
```

### Module 03 — Visual Intel

```
file input | drag & drop
  → handleImageFile(file)   [mime + size validation → FileReader → base64]
  → handleVisualSubmit(e)
      finalPrompt = buildVisualPrompt({ mode, customQuery })
      parts = [{ text }, { inlineData: { mimeType, data } }]
  → api.generate → firstText → renderMarkdown → output card (+ copy)
```

### Module 04 — Analyst Comms

```
chat submit
  → appendChatBubble("user") + state.chatHistory.push(user turn)
  → appendTypingIndicator()
  → payload = { contents: state.chatHistory, systemInstruction: ANALYST_SYSTEM_PROMPT,
                tools: grounding ? [{google_search:{}}] : undefined }
  → api.generate → firstText → extractSources
  → push model turn → trimChatHistory(history, config.limits.chatHistoryMaxMessages)
  → removeTypingIndicator() → appendChatBubble("model", text, sources)
  ✗ on error: removeTypingIndicator(), history.pop()  ← failed turn rolled back
```

The rollback matters: the payload _is_ `state.chatHistory`, so a failed turn left
in the array would desynchronise the transcript from what the API has seen.

---

## 6. Cross-module communication

Modules never import each other. They publish and consume named actions:

| Action               | Registered by        | Invoked by                     | Purpose                                           |
| -------------------- | -------------------- | ------------------------------ | ------------------------------------------------- |
| `briefing:render`    | `modules/briefing`   | `services/dossiers`            | Open an archived dossier in Module 01             |
| `matrix:runFromText` | `modules/matrix`     | `modules/briefing`             | Push a briefing into Module 02 and extract        |
| `apikey:prompt`      | `ui/settings-dialog` | `api/gemini` (via `tryInvoke`) | Open the credentials dialog when a key is missing |

`scripts/verify.mjs` fails the build if an action is invoked but never
registered, and warns if one is registered but never used.

---

## 7. State & storage

In-memory (`src/js/core/state.js`):

| Key                | Shape                                           | Lifetime        |
| ------------------ | ----------------------------------------------- | --------------- |
| `activeTab`        | `"briefing" \| "matrix" \| "visual" \| "comms"` | page load       |
| `currentBriefing`  | dossier object or `null`                        | page load       |
| `dossiers`         | dossier array                                   | mirrors storage |
| `visualImage`      | `{ base64, mimeType, fileName }`                | page load       |
| `visualReportText` | string                                          | page load       |
| `chatHistory`      | Gemini `contents` array                         | page load       |

Persisted (`localStorage`, names come from `config.storage`):

| Key                       | Contents                        | Written by             |
| ------------------------- | ------------------------------- | ---------------------- |
| `nexus_theme`             | `"dark"` / `"light"`            | `core/theme.js`        |
| `nexus_intel_dossiers_v1` | archived briefings (JSON array) | `services/dossiers.js` |
| `nexus_settings_v1`       | `{ apiKey, model }`             | `services/settings.js` |

Versioned key names (`_v1`) mean a schema change can ship as a new key instead of
migrating or corrupting stored data.

---

## 8. Security model

Threat model: **the model output and any uploaded file are untrusted; the
visitor's API key is a secret that lives only in their browser.**

1. **XSS.** `renderMarkdown()` escapes the whole document _before_ applying
   formatting, so no model output can inject markup. Every other interpolation
   into `innerHTML` goes through `escapeHtml()`. Verified by
   `tests/markdown.test.js` and `tests/sanitize.test.js`.
2. **Link injection.** Citation `href`s go through `safeUrl()`, which allows only
   `http:`, `https:` and `mailto:` — `javascript:`/`data:` become `#`.
3. **Credential handling.** Keys are never committed (CI greps for `AIza…`),
   never placed in a URL, and are sent only to
   `generativelanguage.googleapis.com` in the `x-goog-api-key` header. The dialog
   masks the stored value and offers explicit removal. See [SECURITY.md](../SECURITY.md).
4. **External links** always carry `rel="noopener noreferrer"` and `target="_blank"`.
5. **Uploads** are validated by MIME type and size before being read; the base64
   payload is never persisted.
6. **Path traversal** in the dev server is blocked by resolving inside the served
   root (`scripts/serve.mjs`).

Not covered (by design): there is no server-side key custody and no rate limiting
beyond Google's. A public deployment therefore needs either visitor-supplied keys
(the default) or a proxy — see [DEPLOYMENT.md](DEPLOYMENT.md#5-keeping-a-key-off-the-client).

---

## 9. Quality gates

| Gate             | Command                | What it proves                                                                                                                                                                                                      |
| ---------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formatting       | `npm run format:check` | Prettier-clean source                                                                                                                                                                                               |
| Lint             | `npm run lint`         | No undefined variables, unused imports, accidental globals, `var`, `==`                                                                                                                                             |
| Static integrity | `npm run verify`       | Every `getElementById` exists in the markup; every relative import resolves; every named import is really exported; every bus action is registered; no key-like literals                                            |
| Unit tests       | `npm test`             | Prompt contracts, escaping, URL safety, formatting, history trimming, config merge, credential precedence, and the API client (retries, headers, errors) with a stubbed `fetch`                                     |
| Boot smoke test  | `npm test`             | `tests/boot.test.js` loads the real `index.html` + `main.js` in jsdom and drives the UI: boot flag, `els` ↔ markup agreement, settings dialog, tabs, theme, drawer, and all four module flows against a stubbed API |
| Build            | `npm run build`        | Tailwind compiles; `dist/` is complete                                                                                                                                                                              |
| All of the above | `npm run check`        | One command, same order as CI                                                                                                                                                                                       |

Because there is no bundler, `scripts/verify.mjs` is what stands in for module
resolution errors: without it, a typo in an import path would only appear at
runtime in the browser.

---

## 10. Adding a fifth module

1. **Markup.** Add a `<section id="panel-<name>" class="module-panel hidden">` in
   `src/index.html` and a matching `<button class="nav-tab" data-tab="<name>">` in
   the sidebar. `switchTab()` finds both by convention (`panel-${tab}`).
2. **DOM refs.** Add the new ids to the `els` map in `src/js/core/dom.js`.
   `npm run verify` will fail until markup and refs agree.
3. **Prompt.** Add the instruction or builder to `src/js/core/prompts.js` — not to
   the handler.
4. **Module.** Create `src/js/modules/<name>.js` exporting `init<Name>()`; call
   `api.generate(payload)`, render with `renderMarkdown()`/`escapeHtml()`, report
   failures with `showError()`.
5. **Boot.** Call `init<Name>()` from `src/js/main.js`.
6. **Tests.** Cover any new pure logic in `tests/`.
7. **Docs.** Add the row to the module table above and a `CHANGELOG.md` entry.

---

## 11. Known limitations & roadmap

| Item                | Status / note                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tailwind Play CDN   | Removed — the CSS is now compiled and purged (~31 KB instead of a ~300 KB runtime JIT script).                                                                |
| Tailwind v4         | Pinned to v3.4 to keep the existing `darkMode: "class"` + palette semantics; migration is separate work.                                                      |
| Streaming responses | Not implemented; every module awaits a full `generateContent`. `streamGenerateContent` would improve perceived latency on long briefings.                     |
| TypeScript          | Not used. JSDoc types are in place, which gives editor support without a compile step.                                                                        |
| Offline             | No service worker; the archive is readable offline, generation is not.                                                                                        |
| Key custody         | Client-side only. A tiny proxy (Cloud Function / Vercel Edge) is the documented upgrade path.                                                                 |
| Model id            | Defaults to `gemini-3-flash-preview`, overridable in the dialog, via `config.js` or `window.NEXUS_CONFIG`. Verify availability for your project in AI Studio. |
| i18n                | UI copy is English-only and inline in the markup.                                                                                                             |
