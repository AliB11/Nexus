<div align="center">

![NEXUS — پلتفرم اطلاعات هوش مصنوعی](./public/og-image.png)

# NEXUS

**A client-side AI intelligence workspace.**
Web-grounded OSINT briefings, structured signal extraction, visual intelligence
and an interactive analyst — in one static app powered by the Gemini API.

**The interface is Persian (RTL).** Brand names, model ids and the Gemini API
contract stay Latin; everything an analyst reads is Farsi.
**رابط کاربری کاملاً فارسی و راست‌به‌چپ است.**

**Live:** <https://nexus-alib11.vercel.app/>

[![CI](https://github.com/AliB11/Nexus/actions/workflows/ci.yml/badge.svg)](https://github.com/AliB11/Nexus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-cyan.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-22.x-339933.svg)](https://nodejs.org)
[![Code style: Prettier](https://img.shields.io/badge/code_style-Prettier-ff69b4.svg)](https://prettier.io)
[![Tests](https://img.shields.io/badge/tests-92%20passing-brightgreen.svg)](./tests)
[![No backend](https://img.shields.io/badge/architecture-static%20%2B%20client--side-blueviolet.svg)](./docs/ARCHITECTURE.md)

**No backend · no bundler · no runtime dependencies · MIT licensed**

</div>

---

## What it does

| Module                  | What you get                                                                                                                                                                                 | Gemini feature                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **01 · OSINT Briefing** | Executive-ready intelligence report on any topic, grounded in live web search with clickable, verified citations. Four analyst presets (semiconductors, cyber, grid storage, AI regulation). | Google Search grounding              |
| **02 · Signal Matrix**  | Turn raw text — or a finished briefing — into a strict JSON assessment: threat level, sentiment, confidence score, entities, opportunities, risks and action items.                          | Structured output (`responseSchema`) |
| **03 · Visual Intel**   | Upload a chart, document scan or photo (drag & drop, ≤ 10 MB) and get a directive-driven analysis: comprehensive brief, quantitative chart extraction, OCR, or anomaly inspection.           | Vision (`inlineData`)                |
| **04 · Analyst Comms**  | Multi-turn conversation with a senior-analyst persona, optional per-message web grounding, citations under each answer, bounded history.                                                     | Multi-turn + grounding               |

Plus: dark/light themes, a local dossier archive, copy-to-clipboard on every
report, print styles for archiving briefings, UTC telemetry clock, toasts instead
of `alert()`, and a responsive RTL shell with a mobile drawer.

## Quick start

```bash
git clone https://github.com/AliB11/Nexus.git
cd Nexus
npm install
npm run dev            # → http://localhost:5173
```

Then:

1. The settings dialog opens on first run — paste a **Gemini API key**
   (free at [Google AI Studio](https://aistudio.google.com/app/apikey)) and press
   **Save & Connect**. It is stored only in your browser's `localStorage`.
2. The sidebar chip turns **SET** and shows the active model.
3. Try _Module 01 → Semiconductor Supply Chain_, then press **Extract Matrix** to
   push that briefing into Module 02.

> The app is a static site, so `npm run dev` (or `npm run build && npm run preview`)
> is required — opening `src/index.html` over `file://` will not load ES modules.

## Scripts

| Command           | What it does                                                                      |
| ----------------- | --------------------------------------------------------------------------------- |
| `npm run dev`     | Build, serve on `:5173` and rebuild on change                                     |
| `npm run build`   | Compile Tailwind + copy source into `dist/`                                       |
| `npm run preview` | Serve the production build on `:4173`                                             |
| `npm run lint`    | ESLint (flat config, per-layer browser/node globals)                              |
| `npm run format`  | Prettier write                                                                    |
| `npm run verify`  | Static integrity: DOM ids ↔ markup, import graph, exports, bus actions, key leaks |
| `npm test`        | 80 tests via the built-in Node test runner (unit + jsdom boot smoke test)         |
| `npm run check`   | Everything above, in CI order                                                     |
| `npm run assets`  | Re-rasterise brand PNGs from `assets/brand/*.svg` (optional dependency)           |

## Project structure

```
src/
├── index.html            Shell + the four module panels + settings dialog
├── styles/main.css       Tailwind layers, scrollbars, print, reduced motion
└── js/
    ├── config.js         Every tunable default (overridable at runtime)
    ├── main.js           Boot sequence
    ├── core/             dom · state · bus · sanitize · markdown · prompts ·
    │                     theme · navigation · toast · clipboard · format ·
    │                     history · clock
    ├── api/              gemini.js (REST client: header auth, retry, timeout)
    │                     client.js (shared instance)
    ├── services/         dossiers.js (archive) · settings.js (credentials)
    ├── ui/               settings-dialog.js
    └── modules/          briefing.js · matrix.js · visual.js · comms.js

scripts/                  build · dev · serve · verify · generate-icons
tests/                    node:test suites for every pure layer
docs/                     ARCHITECTURE · CONFIGURATION · DEPLOYMENT
public/                   favicon, PWA icons, manifest, robots.txt, 404, OG image
.github/                  CI, Pages deploy, issue & PR templates, CODEOWNERS, Dependabot
```

Dependencies point inwards: `modules → core/services/api → config`. Modules never
import each other — they exchange named actions through a tiny bus
(`briefing:render`, `matrix:runFromText`, `apikey:prompt`), which keeps the graph
acyclic and each module independently testable.

**Full detail — layer responsibilities, data-flow diagrams for all four modules,
the security model, storage schemas and a guide for adding a fifth module:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).**

## Configuration

| Mechanism                | Scope          | Example                                      |
| ------------------------ | -------------- | -------------------------------------------- |
| Settings dialog (in-app) | one browser    | API key, model id                            |
| `window.NEXUS_CONFIG`    | one deployment | `{ api: { textModel: "gemini-2.5-flash" } }` |
| `src/js/config.js`       | one fork       | defaults, limits, storage keys               |

Details in [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## Deployment

`npm run build` emits a dependency-free `dist/`. Relative asset paths mean it
works at a domain root or under a sub-path.

- **GitHub Pages** — `.github/workflows/pages.yml` already builds and publishes on
  push to `main`; just set _Settings → Pages → Source: GitHub Actions_. If Pages is
  currently on “Deploy from a branch” it would publish the repository root instead
  of `dist/` — see the warning in [docs/DEPLOYMENT.md §2](docs/DEPLOYMENT.md#2-github-pages).
- **Vercel** — this repo is deployed at <https://nexus-alib11.vercel.app/>
  (project `nexus`, linked to `AliB11/Nexus`, build `npm run build`, output
  `dist`, install `npm ci`). See
  [docs/DEPLOYMENT.md §3](docs/DEPLOYMENT.md#3-vercel) for the two settings that
  differ from the dashboard defaults.
- **Netlify / Cloudflare Pages** — build `npm run build`, output `dist`.
- **Any static host / nginx / S3** — same folder; serve `.js` as `text/javascript`.
- **Your own key instead of the visitor's?** Put an edge function in front of the
  API and set `api.baseUrl` — see
  [docs/DEPLOYMENT.md §5](docs/DEPLOYMENT.md#5-keeping-a-key-off-the-client).

## Security

- Model output is escaped before it ever reaches `innerHTML`; generated links are
  restricted to `http`/`https`/`mailto` (no `javascript:`/`data:`).
- The API key travels in the `x-goog-api-key` **header**, never in a URL.
- No key is ever committed — CI greps for key-shaped strings and fails the build.
- Client-side means client-side: a public deployment should rely on
  visitor-supplied keys or a proxy. Read [SECURITY.md](SECURITY.md) before
  deploying with your own credentials.

## Contributing

Issues and pull requests are welcome — please read
[CONTRIBUTING.md](CONTRIBUTING.md) and follow the
[Code of Conduct](CODE_OF_CONDUCT.md). Bug reports and feature requests use
structured forms in `.github/ISSUE_TEMPLATE/`.

## History

Version 1.0 was a single 1,647-line HTML file with Tailwind's Play CDN and an
inline script that expected a host environment to inject an API key at runtime —
so it could not run standalone after a `git clone`. Version 2.0 keeps the same
design language, prompts and behaviour, but splits it into the layered structure
above, compiles the CSS, and adds a credential flow so the app works for anyone
who clones it. The v1 file remains in the git history (tag
[`v1.0.0-single-file`](https://github.com/AliB11/Nexus/tree/v1.0.0-single-file), commit `32a0bbb`).

## License

[MIT](LICENSE) © 2026 AliB11 and NEXUS contributors.
