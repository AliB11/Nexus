# Deploying NEXUS

`npm run build` produces a `dist/` folder with no server requirements: HTML,
compiled CSS, ES modules and static assets. Host it anywhere.

All asset URLs in the markup and all module imports are **relative** (`./js/main.js`,
`./styles/main.css`), so the site works at a domain root _and_ under a sub-path
(such as `https://user.github.io/Nexus/`) with no base-URL configuration.

---

## 1. Local

```bash
npm install
npm run dev        # build + serve + watch → http://localhost:5173
```

`npm run dev -- 8080` uses a custom port. The server binds `0.0.0.0`, so it also
works inside containers and sandboxed preview environments.

If the browser is not allowed to call the model gateway directly (CORS), start the
bundled pass-through proxy in a second terminal and point the app's URL field at it
— see [§5.2](#52-if-the-browser-is-blocked-by-cors):

```bash
npm run proxy      # → http://127.0.0.1:8787, URL field: http://127.0.0.1:8787/api/v1
```

To serve an exact copy of the production output:

```bash
npm run build
npm run preview    # → http://localhost:4173
```

> ES modules are fetched over HTTP, so opening `src/index.html` with `file://`
> will not work — the browser blocks module requests from the file scheme. Use
> `npm run dev`.

---

## 2. GitHub Pages

The repository already contains
[`.github/workflows/pages.yml`](../.github/workflows/pages.yml), which builds and
publishes `dist/` on every push to `main`.

One-time setup:

1. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**.
2. Push to `main` (or run the workflow manually from the Actions tab).
3. Open the URL shown in the workflow run: `https://<user>.github.io/Nexus/`.

`dist/.nojekyll` is written by the build so Pages serves the output verbatim.

> ⚠️ **If Pages is already enabled with "Deploy from a branch"**, it publishes the
> repository _root_ through Jekyll — and the compiled app lives in `dist/`, which is
> git-ignored. The site would 404. Switching the source to **GitHub Actions** (step 1)
> is required; it is a one-click change under _Settings → Pages_ and needs no code
> change. The same switch cannot be made through the API with a token that lacks
> administration scope.
>
> If you must keep branch-based deployment, set the path to `/docs` and add a step
> that copies `dist/` into `docs/` on `main` — but that commits build output, so the
> Actions route is strongly preferred.

---

## 3. Vercel

NEXUS is live at **<https://nexus-alib11.vercel.app/>** — project `nexus`, linked
to the GitHub repository `AliB11/Nexus`.

| Setting          | Value                         |
| ---------------- | ----------------------------- |
| Framework preset | _none_ (see the note below)   |
| Build command    | `npm run build`               |
| Output directory | `dist`                        |
| Install command  | `npm ci`                      |
| Root directory   | `.`                           |
| Node             | `22.x` (pinned via `engines`) |

A `vercel.json` is not required. If you add one, keep `"outputDirectory": "dist"`.

### Two things worth knowing

1. **"Other" is not an accepted framework value in the REST API.** The dashboard
   offers it, but `POST /v11/projects` rejects `framework: "other"`. Create the
   project with `framework` unset — the saved `buildCommand` and
   `outputDirectory` are all a static build needs. The deployments REST endpoint
   (`POST /v13/deployments`) additionally refuses a _new_ project unless
   `projectSettings.framework` names a supported preset, so API-created first
   deployments pass `"vite"` — its conventions (build → `dist`) match this repo
   and the explicit `buildCommand` means Vite itself is never invoked.
2. **Deployment Protection.** The account default is
   `ssoProtection: all_except_custom_domains`, which puts anonymous visitors to
   any `*.vercel.app` URL behind a Vercel login. For a public app turn it off in
   _Project → Settings → Deployment Protection_, or attach a custom domain
   (custom domains are exempt by that setting). The REST API in this toolchain
   cannot change `ssoProtection`.

### Deploying again

`gitProviderOptions.createDeployments` is `disabled` on this project, so pushing
does **not** auto-deploy. Create a deployment explicitly:

```bash
vercel deploy --prod --git AliB11/Nexus#main
```

or via the API with `git_source: { type: "github", repoId: 1464751830, ref: "main" }`.

---

## 4. Netlify / Cloudflare Pages / S3 / nginx

- **Netlify:** build `npm run build`, publish `dist`.
- **Cloudflare Pages:** build `npm run build`, output `dist`.
- **S3 + CloudFront:** `aws s3 sync dist/ s3://<bucket> --delete`.
- **nginx:** `root /var/www/nexus;` with `try_files $uri $uri/ /404.html;`.

Requirements for any host: serve `.js` as `text/javascript` (ES modules are
refused with a wrong MIME type) and `.webmanifest` as `application/manifest+json`.
`scripts/serve.mjs` is a working reference implementation.

Optional hardening headers:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://generativelanguage.googleapis.com; frame-ancestors 'none'; base-uri 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

Note the `'self'` for `script-src`: the theme bootstrap is an inline script, so a
strict CSP needs either `script-src 'self' 'unsafe-inline'`, a `nonce`, or moving
that snippet into `src/js/` and accepting a brief theme flash.

---

## 5. The gateway: Coarena, CORS and keeping a key off the client

### 5.1 What the app calls

NEXUS talks to an **OpenAI-compatible gateway**. Coarena is the default, because
one free key fronts 24 models instead of a single vendor:

| Field in the settings dialog | Default                     | Notes                                           |
| ---------------------------- | --------------------------- | ----------------------------------------------- |
| درگاه مدل (gateway)          | `Coarena`                   | `Google AI Studio` is still selectable          |
| کلید API                     | —                           | typed by each visitor, `coa_…` for Coarena      |
| نشانی درگاه (URL)            | `https://coarena.ai/api/v1` | trailing slashes are normalised away            |
| مدل                          | `gemini-3-8-flash`          | free on Coarena's free plan, 1M context, vision |

All three persist per browser in `localStorage["nexus_settings_v1"]`, and the
**تست اتصال** button verifies them _before_ anything is saved: it reads the public
model list, then spends a single token on `POST {URL}/chat/completions` and reports
latency, the model that actually answered, and a Persian explanation of any error
code (`model_api_terms_required`, `insufficient_quota`, `api_key_expired`, …).

The key travels only in an `Authorization: Bearer` header — never in a URL, never
in the repository. `npm run verify` scans `src/`, `docs/` and `public/` for
committed credentials and fails the build if it finds one.

Any other OpenAI-compatible endpoint works by typing its URL: OpenRouter, Groq, or
a local `llama.cpp` / Ollama server. No code change and no rebuild — that is what
the URL field is for.

> Coarena's free plan allows 30 requests a minute, 2 at once, and a daily request
> budget. The client retries only 429/5xx, honours `Retry-After`, and treats a 429
> carrying `x-should-retry: false` (the daily quota) as final instead of burning
> the minute's budget on it.

> **Grounding.** Live web citations are a Google Search tool that exists only on
> the Gemini transport. On Coarena, Module 01 says so in a toast and renders no
> citation card, rather than implying sources that were never fetched. Switch the
> gateway to `Google AI Studio` if verified citations matter more than model choice.

> **Privacy.** Coarena stores every prompt and reply sent through its Model API and
> may license them in datasets; this cannot be withdrawn. Do not paste sensitive
> personal data, passwords or keys into NEXUS while that gateway is selected.

### 5.2 If the browser is blocked by CORS

A static site has no backend, so the browser calls the gateway directly. That works
only while the gateway answers cross-origin requests. Coarena documents server-side
clients (curl, the OpenAI and Anthropic SDKs) and says nothing about browser
access, so a direct call may be refused by the browser.

The symptom is unmistakable: **تست اتصال** answers
`اتصال به https://coarena.ai ممکن نشد …` with no HTTP status, and DevTools shows a
CORS error. `fetch` cannot distinguish "blocked by CORS" from "unreachable", which
is why the message says both.

The repository ships a zero-dependency pass-through proxy for exactly this case:

```bash
npm run proxy                 # → http://127.0.0.1:8787
PORT=9000 npm run proxy       # custom port
```

Then set the URL field to `http://127.0.0.1:8787/api/v1` and press **تست اتصال**
again. Nothing else changes — the app keeps its own retry, timeout and error
handling. The proxy forwards method, headers (including `Authorization`) and body
untouched, streams the response back, and adds the CORS headers a browser needs.

| Variable             | Default              | Purpose                                 |
| -------------------- | -------------------- | --------------------------------------- |
| `PORT`               | `8787`               | listen port                             |
| `HOST`               | `0.0.0.0`            | bind address (container-friendly)       |
| `NEXUS_UPSTREAM`     | `https://coarena.ai` | gateway origin to forward to            |
| `NEXUS_ALLOW_ORIGIN` | `*`                  | value for `Access-Control-Allow-Origin` |

`GET /healthz` reports what the proxy is forwarding to. Browsers treat
`http://127.0.0.1` as a potentially trustworthy origin, so the proxy also works
from an HTTPS deployment such as GitHub Pages — it is not blocked as mixed content.

> **Development tool, not a service.** With `*` as the allowed origin, any website
> open in that browser could use the proxy to reach the gateway with whatever key
> the app sends. Keep it on your own machine, and set `NEXUS_ALLOW_ORIGIN` to one
> origin if it must run on a shared network. The `Authorization` header is
> forwarded but never logged. `tests/proxy.test.js` covers both guarantees.

For a hosted deployment, the same idea belongs on the edge rather than on
localhost — see 5.3.

### 5.3 Keeping a key off the client (your project pays)

By default each visitor supplies their own key, which is the only safe model for a
public deployment. If _your_ project should pay for the calls, put an edge function
in front of the gateway and never ship the key:

```
Browser  →  /api/model (your edge function, holds the secret)  →  coarena.ai
```

Minimal Vercel Edge example (`api/model/[...path].ts`) — it forwards
`/api/model/chat/completions` to the gateway and injects the secret server-side:

```ts
export const config = { runtime: "edge" };

const UPSTREAM = "https://coarena.ai/api/v1";

export default async function handler(req: Request) {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const path = new URL(req.url).pathname.replace(/^\/api\/model/, "");

  const upstream = await fetch(`${UPSTREAM}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.COARENA_API_KEY ?? ""}`
    },
    body: req.body
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" }
  });
}
```

Then point the app at it — no other change is needed, and because it is same-origin
there is no CORS question at all:

```html
<script>
  window.NEXUS_CONFIG = {
    api: { baseUrl: "/api/model" },
    apiKey: "proxy" // any non-empty placeholder; the edge function supplies the real key
  };
</script>
```

Add rate limiting, origin checks and per-user quotas on the proxy — the client
cannot enforce them.

---

## 6. Verifying a deployment

1. Load the site; the sidebar chip reads **ناموجود** until a key is saved.
2. Open the settings dialog: the gateway is **Coarena**, the URL is
   `https://coarena.ai/api/v1` and the model is `gemini-3-8-flash`.
3. Paste a key and press **تست اتصال**. Expect «اتصال برقرار است», a latency in
   milliseconds, and the number of models the gateway listed.
4. Save. The chip turns **تنظیم‌شده** and the engine label reads
   `Coarena · GEMINI 3.8 FLASH`.
5. Module 01 → a preset → _تولید بریفینگ_. Expect a report, plus a toast noting
   that live grounding is unavailable on this gateway.
6. Module 02 → _نمونه_ → _استخراج_. Expect a threat badge, confidence bar and
   entity cards (this exercises enforced structured output).
7. Module 03 → upload an image under 8 MB → analyse (this exercises base64 vision).
8. DevTools → Network: the request goes to `coarena.ai/api/v1/chat/completions`,
   the key appears in the **request header**, never in the URL.
9. `<html data-nexus-ready="true">` in the DOM confirms the boot sequence finished.
