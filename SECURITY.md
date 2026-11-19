# Security Policy

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Use one of these private channels instead:

1. GitHub → this repository → **Security** tab → **Report a vulnerability**
   (private vulnerability reporting), or
2. Contact the maintainer [@AliB11](https://github.com/AliB11) through the contact
   details on their GitHub profile.

Please include: what you found, the exact steps or a proof of concept, the affected
version/commit, and whether the issue is already public. Aim to give us 90 days
before disclosure. We will acknowledge within 7 days where possible and credit you
in the release notes unless you ask us not to.

## Supported versions

| Version | Supported                                        |
| ------- | ------------------------------------------------ |
| 2.x     | :white_check_mark:                               |
| 1.x     | :x: (single-file legacy build, git history only) |

## Threat model

NEXUS is a **static, client-side application**. There is no server, no database,
no session and no user accounts. That shapes what is and is not in scope.

**Untrusted inputs**

| Input                  | Handling                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Model output (text)    | Escaped before rendering (`core/sanitize.js` → `core/markdown.js`); never `eval`'d; JSON parsed defensively in Module 02.                |
| Citation URLs          | Scheme allowlist (`http`, `https`, `mailto`) via `safeUrl()`; `javascript:`/`data:` become `#`. Links carry `rel="noopener noreferrer"`. |
| Uploaded images        | MIME-type and size validated, read with `FileReader`, sent as base64 `inlineData`, never persisted or re-served.                         |
| `localStorage` content | Parsed defensively; corrupt or hostile JSON is ignored, never executed (`services/settings.js`, `services/dossiers.js`).                 |
| URL/query parameters   | Not read by the application at all.                                                                                                      |

**Secrets**

- The Gemini API key belongs to the person using the browser. It is stored in that
  browser's `localStorage` (`nexus_settings_v1`) and sent only to
  `generativelanguage.googleapis.com`, in the `x-goog-api-key` **header** — never
  in a URL, never logged by the app.
- A key may alternatively be injected by the host page
  (`window.NEXUS_CONFIG.apiKey` / `window.NEXUS_API_KEY`). Injected keys take
  precedence and lock the settings field (chip shows `INJECTED`).
- **No key is ever committed.** CI greps the tree for key-shaped strings
  (`AIza[0-9A-Za-z_-]{20,}`) and fails the build. `scripts/verify.mjs` performs the
  same check locally.

### If you deploy this publicly

A static deployment has no way to protect a key that ships with it. Choose one:

1. **Visitor-supplied keys** (default, recommended) — each user pastes their own.
2. **A proxy** that holds the secret server-side and enforces rate limits, origin
   checks and quotas — see
   [docs/DEPLOYMENT.md §5](docs/DEPLOYMENT.md#5-keeping-a-key-off-the-client).
3. **An internal deployment** behind authentication, with a key that is restricted
   in Google Cloud Console (API-limited to Generative Language, referrer/IP-limited
   where possible, quota-capped, rotated on a schedule).

If a key is ever exposed, rotate it immediately in
[Google AI Studio](https://aistudio.google.com/app/apikey) — rotation, not removal
from the current commit, is the only real fix, because the key stays in git history.

## Hardening checklist for operators

- [ ] Serve over HTTPS (the Clipboard API and secure `localStorage` behave better).
- [ ] Send a `Content-Security-Policy` (a ready-made value is in
      [docs/DEPLOYMENT.md §4](docs/DEPLOYMENT.md#4-netlify--cloudflare-pages--s3--nginx)).
      Note the inline theme bootstrap in `<head>`: allow it with a nonce, or move it
      into `src/js/` and accept a theme flash.
- [ ] `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
      `frame-ancestors 'none'`.
- [ ] Restrict and monitor the API key you use; set a quota in Google Cloud Console.
- [ ] Keep Dependabot enabled (`.github/dependabot.yml`) and CI green.

## Known limitations

These are accepted consequences of the design, not bugs:

- No server-side rate limiting, authentication or audit logging.
- No content filtering beyond Google's own safety settings; blocked responses are
  surfaced via `blockReason()` rather than hidden.
- `localStorage` is readable by any script running on the same origin — this is why
  a shared key must never be shipped to a public origin.
- Prompts can be extracted by anyone using the app (they are client-side by nature).

## Scope

In scope: XSS or HTML injection through model output, citations or stored dossiers;
credential leakage (URLs, logs, history); dependency vulnerabilities; CI/CD
misconfigurations; the dev server (`scripts/serve.mjs`) escaping its root.

Out of scope: the Gemini API's own behaviour, quotas or safety decisions; Google
Fonts / Tailwind availability; social engineering of maintainers; findings that
require a visitor to run a malicious build of their own.
