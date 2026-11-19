# Configuring NEXUS

Everything tunable lives in [`src/js/config.js`](../src/js/config.js). Nothing in
this file is secret — it is committed to the repository.

---

## 1. Defaults

| Path                            | Default                                            | Used by                                            |
| ------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| `api.baseUrl`                   | `https://generativelanguage.googleapis.com/v1beta` | `api/gemini.js` — request URL                      |
| `api.textModel`                 | `gemini-3-flash-preview`                           | Fallback model when the visitor has not chosen one |
| `api.maxRetries`                | `4`                                                | Retries on `429`, `5xx` and network errors         |
| `api.backoffBaseMs`             | `1000`                                             | Exponential backoff: 1s, 2s, 4s, 8s                |
| `api.timeoutMs`                 | `120000`                                           | `AbortController` timeout per attempt              |
| `storage.theme`                 | `nexus_theme`                                      | Light/dark preference                              |
| `storage.dossiers`              | `nexus_intel_dossiers_v1`                          | Saved briefing archive                             |
| `storage.settings`              | `nexus_settings_v1`                                | Visitor-supplied API key + model                   |
| `limits.imageMaxBytes`          | `10485760` (10 MB)                                 | Visual Intel upload validation                     |
| `limits.imageMimeTypes`         | `["image/png", "image/jpeg", "image/webp"]`        | Visual Intel upload validation                     |
| `limits.chatHistoryMaxMessages` | `30`                                               | Analyst Comms payload trimming                     |
| `limits.citationDisplayMax`     | `5`                                                | Citations shown under one chat answer              |
| `ui.toastDurationMs`            | `3200`                                             | Toast lifetime                                     |
| `ui.clockIntervalMs`            | `1000`                                             | Header UTC clock tick                              |

---

## 2. Three ways to override

### a. In the app (no code, per visitor)

Sidebar → **API KEY** → the settings dialog. The key and model are stored in that
browser's `localStorage` only. This is the default path for a public deployment.

### b. Host injection (per deployment)

Define `window.NEXUS_CONFIG` **before** the module script in `src/index.html`:

```html
<script>
  window.NEXUS_CONFIG = {
    api: { textModel: "gemini-2.5-flash", timeoutMs: 180000 },
    limits: { chatHistoryMaxMessages: 20 },
    ui: { toastDurationMs: 4000 }
  };
</script>
<script type="module" src="./js/main.js"></script>
```

`deepMerge` merges this into the defaults, so partial overrides are fine and
nested sections keep their other keys.

An API key supplied this way (`NEXUS_CONFIG.apiKey`, or the shorthand
`window.NEXUS_API_KEY`) takes precedence over anything stored in `localStorage`,
and the dialog locks its key field and shows the chip as `INJECTED`.

> ⚠️ Anything you inject into a **public** page is public. Never inject a real key
> into a deployment that anonymous visitors can reach — see
> [DEPLOYMENT.md §5](DEPLOYMENT.md#5-keeping-a-key-off-the-client) for the proxy
> pattern instead.

### c. Editing the source (per fork)

Change `DEFAULT_CONFIG` in `src/js/config.js`. Prefer (a) or (b) unless you are
forking.

---

## 3. Choosing a model

The default is `gemini-3-flash-preview`. Model availability depends on your
Google Cloud project and region, so if a request returns `404 model not found`,
open the settings dialog and set an id your project can call — for example
`gemini-2.5-flash` or `gemini-2.5-pro`. The sidebar shows the active model, and
the chip shows the credential state.

Two module features constrain the choice:

| Feature                          | Requirement                                      |
| -------------------------------- | ------------------------------------------------ |
| `tools: [{ google_search: {} }]` | Grounding with Google Search (Modules 01 and 04) |
| `responseSchema`                 | Structured output (Module 02)                    |
| `inlineData` images              | Vision (Module 03)                               |

---

## 4. Environment variables

Only the dev tooling reads the environment; the app itself never does.

| Variable | Default                         | Effect                                      |
| -------- | ------------------------------- | ------------------------------------------- |
| `PORT`   | `5173` (dev) / `4173` (preview) | Port for `scripts/serve.mjs`                |
| `HOST`   | `0.0.0.0`                       | Bind address — keep `0.0.0.0` in containers |

---

## 5. Storage schema

```jsonc
// localStorage["nexus_settings_v1"]
{ "apiKey": "AIza…", "model": "gemini-3-flash-preview" }

// localStorage["nexus_intel_dossiers_v1"]
[
  {
    "id": "dos_1763599200000",
    "topic": "Nordic grid interconnectors",
    "focus": "Geopolitical & Regulatory",
    "timestamp": "2026-11-19 23:15 UTC",
    "rawText": "## Executive Summary\n…",
    "sources": [{ "uri": "https://…", "title": "…" }]
  }
]

// localStorage["nexus_theme"]
"dark"
```

Corrupt or hostile JSON in any of these keys is ignored, not thrown
(`tests/settings.test.js`). To reset a browser completely:

```js
["nexus_settings_v1", "nexus_intel_dossiers_v1", "nexus_theme"].forEach((k) => localStorage.removeItem(k));
```
