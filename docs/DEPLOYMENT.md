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

## 5. Keeping a key off the client

By default each visitor supplies their own key, which is the only safe model for a
public deployment. If you want _your_ project to pay for the calls, put a proxy in
front of the Gemini API and never ship the key:

```
Browser  →  /api/gemini (your edge function, holds the secret)  →  Gemini API
```

Minimal Vercel Edge example (`api/gemini/[...path].ts`) — it forwards
`/api/gemini/models/<model>:generateContent` to the real endpoint and injects the
secret server-side:

```ts
export const config = { runtime: "edge" };

const UPSTREAM = "https://generativelanguage.googleapis.com/v1beta";

export default async function handler(req: Request) {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const path = new URL(req.url).pathname.replace(/^\/api\/gemini/, "");

  const upstream = await fetch(`${UPSTREAM}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY ?? ""
    },
    body: req.body
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" }
  });
}
```

Then point the app at it — no other change is needed, the client keeps its retry,
timeout and error handling:

```html
<script>
  window.NEXUS_CONFIG = {
    api: { baseUrl: "/api/gemini" },
    apiKey: "proxy" // any non-empty placeholder; the proxy supplies the real key
  };
</script>
```

Add rate limiting, origin checks and per-user quotas on the proxy — the client
cannot enforce them.

---

## 6. Verifying a deployment

1. Load the site; the sidebar chip should read **MISSING** (or **SET**).
2. Open the settings dialog, paste a key, save. The chip turns **SET** and the
   engine label shows the model.
3. Module 01 → _Generate Intel_ on a preset. Expect a report plus a "Verified Web
   Grounding Sources" card.
4. Module 02 → _Load sample_ → _Extract_. Expect a threat badge, confidence bar and
   entity cards (this exercises structured output).
5. Module 04 → ask a question with grounding on. Expect citations under the answer.
6. DevTools → Network: the request goes to `generativelanguage.googleapis.com`, the
   key appears in the **request header**, never in the URL.
7. `<html data-nexus-ready="true">` in the DOM confirms the boot sequence finished.
