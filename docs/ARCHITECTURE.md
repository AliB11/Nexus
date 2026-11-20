# NEXUS Architecture

This document is the structural reference for the repository: what each layer is
for, how data moves through it, and where new work belongs.

- **Audience:** contributors and reviewers.
- **Companion docs:** [CONFIGURATION.md](CONFIGURATION.md) · [DEPLOYMENT.md](DEPLOYMENT.md) · [../SECURITY.md](../SECURITY.md)

---

## 1. Design constraints

NEXUS is deliberately small and deliberately static. Every decision below follows
from these four constraints:

| Constraint                    | Consequence                                                                                                                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No backend**                | The browser calls the model gateway directly. There is no session, no database and no server-side secret; the visitor supplies their own key. A bundled local proxy covers gateways that refuse cross-origin browser calls. |
| **No bundler**                | Source ships as native ES modules. `npm run build` compiles CSS and _copies_ JS — it never rewrites it. What you read in `src/` is what runs.                                                                               |
| **Untrusted model output**    | Everything the model returns is treated as hostile input: escaped before it reaches `innerHTML`, and every generated URL is scheme-checked.                                                                                 |
| **Zero runtime dependencies** | No framework, no icon pack, no markdown library. The only runtime third-party assets are Tailwind's compiled CSS and Google Fonts.                                                                                          |

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
│        │        ├── services/ provider (routing) · settings · dossiers   │
│        │        │                                                        │
│        │        └── api/     openai.js ⇄ gemini.js (errors.js shared)    │
│        │                                                                 │
│        └── ui/     settings-dialog (gateway · key · URL · model · test)  │
│                                                                          │
│  src/js/config.js ── every tunable default, overridable at runtime       │
└──────────────────────────────────────────────────────────────────────────┘
                                   │  HTTPS
                                   ▼
    coarena.ai/api/v1  (default, OpenAI-compatible)   ← or, on the "google"
                                                        gateway setting,
    generativelanguage.googleapis.com/v1beta  (Gemini native protocol)
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
├── scripts/                     Build, dev, verify, icon + gateway-proxy tooling (Node, no dependencies)
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
│       ├── api/                 Gateway transports (OpenAI-compatible + Gemini)
│       ├── services/            Provider routing, credential storage, dossier archive
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

Single source of truth for every tunable: default gateway (`api.provider`), its
base URL and model, the alternative Google endpoint (`api.google`), model
suggestions, retry count, backoff base, request timeout, localStorage key names,
upload limits, chat history cap, toast lifetime. `DEFAULT_CONFIG` is frozen; the exported
`config` is a deep clone merged with `window.NEXUS_CONFIG` when the host page
defines it. `deepMerge` is exported and unit-tested.

### `src/js/core/` — primitives

| File            | Responsibility                                                                                                                                               | Pure? |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| `dom.js`        | The `els` map: every id the app touches, resolved once at boot. Plus `byId()` and `assertElements()`.                                                        | no    |
| `state.js`      | The mutable app state object (`activeTab`, `currentBriefing`, `dossiers`, `visualImage`, `chatHistory`).                                                     | no    |
| `bus.js`        | `registerAction` / `invokeAction` / `tryInvokeAction` — the acyclic cross-module channel.                                                                    | yes   |
| `sanitize.js`   | `escapeHtml()`, `unescapeHtml()` and `safeUrl()` (scheme allowlist: http, https, mailto).                                                                    | yes   |
| `markdown.js`   | `renderMarkdown()` — escapes first, then renders headings, ordered/unordered lists, blockquotes, rules, links, bold, italic, inline code.                    | yes   |
| `labels.js`     | Render-time Persian labels for the wire enums: `threatLabel`, `sentimentLabel`, `categoryLabel`, `focusLabel`.                                               | yes   |
| `schema.js`     | The Module 02 JSON contract (`MATRIX_RESPONSE_SCHEMA`), kept DOM-free so tests can assert it. Each transport maps it to its own structured-output form.      | yes   |
| `format.js`     | `formatNumber` (Persian digits), `formatModelLabel`, `formatUtcTimestamp`, `formatUtcClock`, `formatFileSize`, `formatCharacterCount`, `formatMaxImageSize`. | yes   |
| `history.js`    | `trimChatHistory()` — bounded conversation payload.                                                                                                          | yes   |
| `prompts.js`    | **All model instructions.** System prompts, the four visual directives and the prompt builders.                                                              | yes   |
| `toast.js`      | `showToast`, `showError`, `hideError` — non-blocking feedback (never `alert()`).                                                                             | no    |
| `clipboard.js`  | `copyToClipboard()` — async Clipboard API with a hidden-textarea `execCommand` fallback for sandboxed iframes.                                               | no    |
| `theme.js`      | `initTheme`, `toggleTheme`, `getTheme` — persisted light/dark.                                                                                               | no    |
| `navigation.js` | `switchTab` (toggles `.nav-tab-active` + `aria-current`), `openMobileSidebar`, `closeMobileSidebar`, `isMobileSidebarClosed`.                                | no    |
| `clock.js`      | `updateClock(now?)`, `startClock(intervalMs)` — header UTC telemetry.                                                                                        | no    |

`prompts.js` deserves emphasis: in an AI product the prompts _are_ the business
logic, so they are versioned, reviewed and diffed in one file instead of being
buried inside event handlers.

`labels.js` and `schema.js` exist because the UI is Persian while the API
contract is not. See §11.

### `src/js/api/` — the gateway boundary

Two transports, one neutral request/result contract, so no module knows which
gateway answered:

```
NexusRequest { system?, messages[{role,text}], images?, jsonSchema?, grounding?, maxTokens? }
        │
        ├── toOpenAIPayload()  → POST {base}/chat/completions   (openai.js)
        └── toGeminiRequest()  → POST {base}/models/{m}:generateContent   (gemini.js)
        │
NexusResult  { text, sources[], finishReason, model, groundingApplied, raw }
        ↑ fromOpenAIResult() / fromGeminiResult()
```

- `errors.js` — the shared `NexusApiError` (`missing_api_key` · `http_error` ·
  `timeout` · `network_error` · `retries_exhausted`), `parseOpenAIError()`,
  `sleep()` and `backoffDelay()`, which honours a server `Retry-After` when it
  asks for longer than the exponential delay.
- `openai.js` — `createOpenAIClient({ getApiKey, getBaseUrl, getModel, maxRetries,
backoffBaseMs, timeoutMs, fetchImpl })` → `{ generate, listModels, getModel,
getBaseUrl, hasKey }`. Behaviour:
  - `POST {base}/chat/completions` with **`Authorization: Bearer <key>`**; the key
    never appears in a URL;
  - images go out as **inline base64 data URLs** — Coarena's Gemini models report
    `image_url: false, image_base64: true`, so remote URLs would be refused;
  - structured output becomes `response_format: { type: "json_schema", strict }`
    (Coarena reports `json_schema_enforced`), or `{ type: "json_object" }` when
    strictness is not requested;
  - retries `429`/`5xx`/network with backoff, but a `429` carrying
    `x-should-retry: false` (Coarena's spent daily quota) is **final** — retrying
    it only burns the per-minute budget;
  - `COARENA_ADVICE` maps 18 documented gateway error codes onto Persian advice,
    so `model_api_terms_required` tells the analyst to accept the terms instead of
    showing raw JSON;
  - `listModels()` reads the public catalogue; `networkErrorMessage()` explains a
    browser-level failure (CORS / DNS / blocked origin) and names the remedy;
  - the response `model` field is surfaced, because Coarena's free plan may answer
    with a cheaper model than the one requested (cost routing).
- `gemini.js` — the Gemini-native transport for a direct Google AI Studio key:
  `x-goog-api-key` header, `contents`/`parts` bodies, `googleSearch` grounding,
  `responseSchema`, plus `firstText()`, `blockReason()` and `extractSources()`
  (`groundingAttributions` first, `groundingChunks` fallback, de-duplicated by URI).
  This is the only transport where live web citations exist.
- `provider.js` (in this folder) — the neutral types as JSDoc typedefs.

Both clients take `fetchImpl`, so tests exercise retry, timeout and error mapping
without a network.

### `src/js/services/` — routing and persistence

- `provider.js` — **the single place that decides where NEXUS talks to.** It holds
  the `PROVIDERS` registry (label, transport, key URL, docs URL, Persian notes),
  builds and caches the client per gateway, and exposes `runRequest()`,
  `testConnection()`, `listModels()`, `getModelLabel()` and `matchModelAlias()`.
  Key, base URL and model are read **per request**, so a change in the dialog
  applies immediately; only a gateway switch rebuilds the client.
  `runRequest()` also sets `groundingUnavailable` when a module asked for live web
  grounding that the active transport cannot provide — honesty over silent loss.
  `testConnection(overrides)` probes the values **still typed in the form**, not
  the stored ones, and never persists anything.
- `settings.js` — credential resolution and storage: `getProvider`, `getApiKey`,
  `getBaseUrl`, `getModel`, `providerDefaults`, `normalizeBaseUrl`, `saveSettings`,
  `clearApiKey`, `maskKey`, `isKeyInjected`, `getEffectiveSettings`. Key
  precedence: `window.NEXUS_CONFIG.apiKey` → `window.NEXUS_API_KEY` → `localStorage`.
  A stored base URL is only honoured when it is still an absolute `http(s)` URL.

- `dossiers.js` — the saved-briefing archive: `loadDossiers`, `persistDossiers`,
  `renderDossierList`. All `localStorage` access is inside `try/catch` (Safari
  private mode and sandboxed iframes throw).

### `src/js/ui/settings-dialog.js`

The gateway credentials dialog: opens on first run and on any unauthenticated
request. Four inputs — gateway selector, **API key**, **URL**, **model** — plus a
**تست اتصال** button and a result box (`role="status"`, `aria-live="polite"`).

- The gateway selector rewrites the URL and model to that gateway's defaults, but
  only while they still hold the previous gateway's values, so a hand-typed proxy
  URL is never thrown away.
- The model field is backed by a `<datalist>` seeded from `config.api.modelSuggestions`
  and replaced by the live catalogue after the first successful test.
- The test reads the form (not storage), fetches the public model list, then spends
  one token on a chat call, and reports latency, the model that answered, and — when
  the typed id is a near-miss — corrects it in place.
- Saving validates the URL shape and a non-empty key, writes all four fields,
  refreshes the sidebar chip (`تنظیم‌شده` / `ناموجود` / `تزریق‌شده`) and the engine
  label (`Coarena · GEMINI 3.8 FLASH`).
- Escape, backdrop click and a Tab focus trap; key/URL/model inputs are `dir="ltr"`
  inside the RTL shell.

### `src/js/modules/` — the four intelligence modules

Every module calls `runRequest()` with the neutral shape and reads `result.text`,
`result.sources`, `result.finishReason`. None of them imports a transport.

| #   | File          | Panel            | Neutral request                                       | Output                                                       |
| --- | ------------- | ---------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| 01  | `briefing.js` | `panel-briefing` | `{ system, messages, grounding: true }`               | Markdown report; citations where the transport supports them |
| 02  | `matrix.js`   | `panel-matrix`   | `{ messages, jsonSchema: MATRIX_RESPONSE_SCHEMA }`    | Threat level, sentiment, confidence, entities, SWOT, actions |
| 03  | `visual.js`   | `panel-visual`   | `{ messages, images: [{ mimeType, data }] }` (≤ 8 MB) | Directive-driven visual brief (4 modes)                      |
| 04  | `comms.js`    | `panel-comms`    | `{ system, messages: chatHistory, grounding }`        | Chat transcript, bounded history, citations when available   |

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
      request = { system: BRIEFING_SYSTEM_PROMPT,
                  messages:[{role:"user", text: buildBriefingQuery({topic,focus})}],
                  grounding: true }
  → runRequest(request)                        [transport + retry/backoff + key header]
  → result.text  +  result.sources
  → groundingUnavailable? → toast "this gateway has no live web search"
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
      request = { messages:[{role:"user", text: buildMatrixPrompt({sourceText})}],
                  jsonSchema: MATRIX_RESPONSE_SCHEMA }
  → runRequest(request) → result.text → JSON.parse (guarded, friendly error)
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
      request = { messages:[{role:"user", text: finalPrompt}],
                  images:[{ mimeType, data }] }        ← inline base64 on both transports
  → runRequest → result.text → renderMarkdown → output card (+ copy)
```

### Module 04 — Analyst Comms

```
chat submit
  → appendChatBubble("user") + state.chatHistory.push({role:"user", text})
  → appendTypingIndicator()
  → request = { system: ANALYST_SYSTEM_PROMPT, messages: state.chatHistory,
                grounding: chatGroundingToggle.checked }
  → runRequest → result.text + result.sources
  → push {role:"assistant", text} → trimChatHistory(history, config.limits.chatHistoryMaxMessages)
  → removeTypingIndicator() → appendChatBubble("model", text, sources)
  ✗ on error: removeTypingIndicator(), history.pop()  ← failed turn rolled back
```

The rollback matters: the request messages _are_ `state.chatHistory`, so a failed
turn left in the array would desynchronise the transcript from what the gateway has
seen. History is stored provider-neutral (`{ role, text }`) and each transport maps
it to its own wire shape.

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
| `chatHistory`      | provider-neutral `[{ role, text }]`             | page load       |

Persisted (`localStorage`, names come from `config.storage`):

| Key                       | Contents                               | Written by             |
| ------------------------- | -------------------------------------- | ---------------------- |
| `nexus_theme`             | `"dark"` / `"light"`                   | `core/theme.js`        |
| `nexus_intel_dossiers_v1` | archived briefings (JSON array)        | `services/dossiers.js` |
| `nexus_settings_v1`       | `{ provider, apiKey, baseUrl, model }` | `services/settings.js` |

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
3. **Credential handling.** Keys are never committed — `npm run verify` scans
   `src/`, `docs/` and `public/` for Coarena (`coa_…`), Google (`AIza…`), Anthropic
   (`sk-ant-…`) and OpenAI (`sk-…`) key shapes and fails the build on a hit. A key
   is never placed in a URL: it travels in `Authorization: Bearer` (or
   `x-goog-api-key` on the Gemini transport) to the base URL the visitor typed. The
   dialog masks the stored value and offers explicit removal, and the connection
   test never writes to storage. See [SECURITY.md](../SECURITY.md).
4. **External links** always carry `rel="noopener noreferrer"` and `target="_blank"`.
5. **Uploads** are validated by MIME type and size before being read; the base64
   payload is never persisted.
6. **Path traversal** in the dev server is blocked by resolving inside the served
   root (`scripts/serve.mjs`).

Not covered (by design): there is no server-side key custody and no rate limiting
beyond the gateway's own (Coarena's free plan allows 30 requests a minute, 2 at
once, and a daily request budget). A public deployment therefore needs either
visitor-supplied keys (the default) or a proxy — see
[DEPLOYMENT.md §5](DEPLOYMENT.md#5-the-gateway-coarena-cors-and-keeping-a-key-off-the-client).

7. **Gateway data retention.** Coarena stores every prompt and reply sent through
   its Model API and may license them in datasets; this cannot be withdrawn. The
   settings dialog says so in Persian next to the gateway selector, and the same
   warning is in [SECURITY.md](../SECURITY.md).

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
   `runRequest({ messages, … })` from `services/provider.js`, render
   `result.text` with `renderMarkdown()`/`escapeHtml()`, report failures with
   `showError()`. Never import a transport directly — that is what keeps a new
   module working on both gateways.
5. **Boot.** Call `init<Name>()` from `src/js/main.js`.
6. **Tests.** Cover any new pure logic in `tests/`.
7. **Docs.** Add the row to the module table above and a `CHANGELOG.md` entry.

---

## 11. Language & direction (Persian / RTL)

The interface language is Persian and the document direction is RTL. The split
is deliberate:

| Layer                                                | Language | Why                                                                                   |
| ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| UI copy, toasts, banners                             | Persian  | It is what the analyst reads.                                                         |
| Model prompts (`prompts.js`)                         | Persian  | The model must answer in Persian; every builder says so explicitly.                   |
| Rendered enum values                                 | Persian  | Translated at render time by `labels.js`.                                             |
| `MATRIX_RESPONSE_SCHEMA` field names                 | English  | The gateway's structured-output contract, and stored dossiers must keep parsing.      |
| `threatLevel` / `sentiment` / `category` enum values | English  | API contract **and** backwards compatibility with dossiers already in `localStorage`. |
| Brand, model ids, clock, storage keys                | Latin    | `NEXUS`, `GEMINI 3 FLASH`, `23:15:04 UTC`, `nexus_settings_v1`.                       |

Layout rules that keep RTL correct:

- **Only logical utilities.** `start-*`/`end-*`, `ps-*`/`pe-*`, `ms-*`/`me-*`,
  `border-e`, `rounded-ss-*`/`rounded-se-*`, `text-start`. A test in
  `tests/boot.test.js` scans every `class` attribute in `src/index.html` and
  every string literal in `src/js/**` and fails if a physical `left-`/`right-`/
  `pl-`/`pr-`/`ml-`/`mr-`/`translate-x-` utility appears.
- **The drawer has one class.** `core/navigation.js` toggles `drawer-closed`;
  `styles/main.css` chooses `translateX(±100%)` from `[dir]` and only below the
  `lg` breakpoint. Direction logic lives in exactly one place.
- **Latin islands get `dir="ltr"`.** The UTC clock, timestamps, model label, API
  key fields, source URLs and citation indices — otherwise bidi reorders them.
- **Casing and tracking are neutralised** for `[lang="fa"]` copy in
  `styles/main.css`; `text-transform: uppercase` is a no-op in Persian and wide
  letter-spacing visually breaks connected glyphs.
- **Persian digits for counters only** (`formatNumber` → `fa-IR`). Timestamps and
  byte sizes stay Latin so archived data remains sortable and comparable.

Adding new UI text: put enum-to-label maps in `core/labels.js`, numbers through
`core/format.js`, and never write a physical direction utility.

---

## 12. Known limitations & roadmap

| Item                | Status / note                                                                                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tailwind Play CDN   | Removed — the CSS is now compiled and purged (~31 KB instead of a ~300 KB runtime JIT script).                                                                                                           |
| Tailwind v4         | Pinned to v3.4 to keep the existing `darkMode: "class"` + palette semantics; migration is separate work.                                                                                                 |
| Streaming responses | Not implemented; every module awaits a full response. Coarena pads a non-streamed reply that runs past 20 s, so `stream: true` is the documented fix for long briefings.                                 |
| TypeScript          | Not used. JSDoc types are in place, which gives editor support without a compile step.                                                                                                                   |
| Offline             | No service worker; the archive is readable offline, generation is not.                                                                                                                                   |
| Key custody         | Client-side only. `scripts/proxy.mjs` covers CORS locally; an edge function is the documented upgrade path for a hosted key.                                                                             |
| CORS                | Unknown per gateway: Coarena documents server-side clients only. The bundled proxy is the fallback, and the connection test names it in the error message.                                               |
| Model id            | Defaults to `gemini-3-8-flash` on Coarena (free plan, 1M context, vision), overridable in the dialog, via `config.js` or `window.NEXUS_CONFIG`. The gateway's own `/models` list is the source of truth. |
| i18n                | The UI is Persian-only (`lang="fa" dir="rtl"`), with copy inline in the markup and in `core/labels.js`. A second language would mean extracting it.                                                      |
