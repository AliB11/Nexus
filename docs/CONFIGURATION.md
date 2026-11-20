# Configuring NEXUS

Everything tunable lives in [`src/js/config.js`](../src/js/config.js). Nothing in
this file is secret — it is committed to the repository.

---

## 1. Defaults

| Path                            | Default                                            | Used by                                            |
| ------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| `api.provider`                  | `coarena`                                          | Which gateway `services/provider.js` builds        |
| `api.baseUrl`                   | `https://coarena.ai/api/v1`                        | `api/openai.js` — `{base}/chat/completions`        |
| `api.textModel`                 | `gemini-3-8-flash`                                 | Fallback model when the visitor has not chosen one |
| `api.modelSuggestions`          | `["gemini-3-8-flash", "gpt-6-luna", …]`            | Seed list for the model field's `<datalist>`       |
| `api.google.baseUrl`            | `https://generativelanguage.googleapis.com/v1beta` | `api/gemini.js` when `provider === "google"`       |
| `api.google.textModel`          | `gemini-3-flash-preview`                           | Fallback model for the Google gateway              |
| `api.maxRetries`                | `3`                                                | Retries on `429`, `5xx` and network errors         |
| `api.backoffBaseMs`             | `1000`                                             | Exponential backoff, floor for a `Retry-After`     |
| `api.timeoutMs`                 | `120000`                                           | `AbortController` timeout per attempt              |
| `storage.theme`                 | `nexus_theme`                                      | Light/dark preference                              |
| `storage.dossiers`              | `nexus_intel_dossiers_v1`                          | Saved briefing archive                             |
| `storage.settings`              | `nexus_settings_v1`                                | Gateway + visitor-supplied key, URL and model      |
| `limits.imageMaxBytes`          | `8388608` (8 MB)                                   | Visual Intel upload validation                     |
| `limits.imageMimeTypes`         | `["image/png", "image/jpeg", "image/webp"]`        | Visual Intel upload validation                     |
| `limits.chatHistoryMaxMessages` | `30`                                               | Analyst Comms payload trimming                     |
| `limits.citationDisplayMax`     | `5`                                                | Citations shown under one chat answer              |
| `ui.toastDurationMs`            | `3200`                                             | Toast lifetime                                     |
| `ui.clockIntervalMs`            | `1000`                                             | Header UTC clock tick                              |

---

## 2. Three ways to override

### a. In the app (no code, per visitor)

Sidebar → **تنظیمات** → the settings dialog: gateway, **API key**, **URL** and
**model**, plus a **تست اتصال** button that verifies all three before you save.
Everything is stored in that browser's `localStorage` only. This is the default
path for a public deployment.

The URL field is what makes the app gateway-agnostic: any OpenAI-compatible
endpoint works — Coarena (default), OpenRouter, Groq, or a local `llama.cpp` /
Ollama server. If a gateway refuses cross-origin browser calls, run
`npm run proxy` and use `http://127.0.0.1:8787/api/v1`.

### b. Host injection (per deployment)

Define `window.NEXUS_CONFIG` **before** the module script in `src/index.html`:

```html
<script>
  window.NEXUS_CONFIG = {
    api: { textModel: "gpt-6-luna", timeoutMs: 180000 },
    limits: { chatHistoryMaxMessages: 20 },
    ui: { toastDurationMs: 4000 }
  };
</script>
<script type="module" src="./js/main.js"></script>
```

To pin the whole deployment to one gateway — for example an edge proxy that holds
the key — override the provider and its base URL:

```html
<script>
  window.NEXUS_CONFIG = {
    api: { provider: "coarena", baseUrl: "/api/model" },
    apiKey: "proxy" // any non-empty placeholder; the edge supplies the real key
  };
</script>
```

`deepMerge` merges this into the defaults, so partial overrides are fine and
nested sections keep their other keys.

An API key supplied this way (`NEXUS_CONFIG.apiKey`, or the shorthand
`window.NEXUS_API_KEY`) takes precedence over anything stored in `localStorage`,
and the dialog locks its key field and shows the chip as **تزریق‌شده**.

> ⚠️ Anything you inject into a **public** page is public. Never inject a real key
> into a deployment that anonymous visitors can reach — see
> [DEPLOYMENT.md §5.3](DEPLOYMENT.md#53-keeping-a-key-off-the-client-your-project-pays)
> for the proxy pattern instead.

### c. Editing the source (per fork)

Change `DEFAULT_CONFIG` in `src/js/config.js`. Prefer (a) or (b) unless you are
forking.

---

## 3. Choosing a gateway and a model

Two gateways ship in the registry (`services/provider.js` → `PROVIDERS`):

| Gateway              | Protocol                | Default model            | Notes                                                              |
| -------------------- | ----------------------- | ------------------------ | ------------------------------------------------------------------ |
| **Coarena**          | OpenAI Chat Completions | `gemini-3-8-flash`       | One free key, 24 models. No live web grounding. Prompts are stored. |
| **Google AI Studio** | Gemini `generateContent`| `gemini-3-flash-preview` | Direct Google key. The only transport with live web citations.      |

Adding a third gateway means one entry in `PROVIDERS` plus defaults in
`config.api` — no module changes, because every module speaks the neutral request.

Model availability depends on the gateway and account. If a request returns
`404 model_not_found`, press **تست اتصال**: it reads the gateway's own `/models`
list, fills the model field's suggestions, and corrects a near-miss id in place
(`gemini-3.8-flash` → `gemini-3-8-flash`). On Coarena's free plan only the free
models answer without credits, and cost routing may answer with a cheaper model
than the one requested — the response `model` field names whatever answered, and
the app surfaces it.

Feature requirements per module:

| Module feature                    | Coarena (`gemini-3-8-flash`)          | Google AI Studio       |
| --------------------------------- | ------------------------------------- | ---------------------- |
| Structured output (Module 02)     | `response_format: json_schema`, strict | `responseSchema`       |
| Vision (Module 03)                | inline base64 data URL, ≤ 8 MB         | `inlineData`           |
| Live web grounding (Modules 01/04)| **not available** — reported to the user | `tools: [{googleSearch}]` |

---

## 4. Environment variables

Only the dev tooling reads the environment; the app itself never does.

| Variable             | Default                         | Effect                                            |
| -------------------- | ------------------------------- | ------------------------------------------------- |
| `PORT`               | `5173` (dev) / `4173` (preview) / `8787` (proxy) | Port for `scripts/serve.mjs` and `scripts/proxy.mjs` |
| `HOST`               | `0.0.0.0`                       | Bind address — keep `0.0.0.0` in containers       |
| `NEXUS_UPSTREAM`     | `https://coarena.ai`            | Gateway origin the proxy forwards to              |
| `NEXUS_ALLOW_ORIGIN` | `*`                             | `Access-Control-Allow-Origin` the proxy sends     |

---

## 5. Storage schema

```jsonc
// localStorage["nexus_settings_v1"]
{
  "provider": "coarena",
  "apiKey": "coa_…",
  "baseUrl": "https://coarena.ai/api/v1",
  "model": "gemini-3-8-flash"
}

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
