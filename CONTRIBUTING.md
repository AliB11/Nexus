# Contributing to NEXUS

Thanks for your interest. NEXUS is a small, deliberately constrained project: a
static, client-side app with no backend, no bundler and no runtime dependencies.
Contributions that respect those constraints land quickly.

## Table of contents

1. [Ground rules](#ground-rules)
2. [Development setup](#development-setup)
3. [How the code is organised](#how-the-code-is-organised)
4. [Making a change](#making-a-change)
5. [Style](#style)
6. [Testing](#testing)
7. [Pull requests](#pull-requests)
8. [Releasing](#releasing)
9. [Reporting security issues](#reporting-security-issues)

## Ground rules

Please keep these invariants — they are what make the project reviewable:

- **No backend.** If a feature genuinely needs one, open a discussion issue first.
- **No runtime dependencies.** Build-time dev dependencies are fine with a reason.
- **No secrets in the repository.** CI fails on key-shaped strings.
- **Model output is untrusted.** Escape it (`escapeHtml`, `renderMarkdown`) and
  scheme-check URLs (`safeUrl`) before they touch the DOM.
- **Prompts live in `src/js/core/prompts.js`**, never inline in a handler.
- **Dependencies point inwards:** `modules → core/services/api → config`. Modules
  talk to each other only through `core/bus.js`.

## Development setup

Requires Node.js ≥ 20 (22 recommended).

```bash
git clone https://github.com/AliB11/Nexus.git
cd Nexus
npm install
npm run dev          # http://localhost:5173
```

You need your own Gemini API key to exercise the modules; the app asks for it on
first run. Keys are stored in your browser only — never in the repo, never in an
issue or PR.

## How the code is organised

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before your first change. It
covers the layer map, per-module data flows, the storage schema, the security
model and a step-by-step guide for adding a fifth module.

Quick orientation:

| I want to change…                    | Edit…                                                         |
| ------------------------------------ | ------------------------------------------------------------- |
| Markup, panels, copy                 | `src/index.html` (+ new ids in `src/js/core/dom.js`)          |
| Colours, fonts, spacing              | `tailwind.config.js`, `src/styles/main.css`                   |
| A prompt or an analysis directive    | `src/js/core/prompts.js`                                      |
| Model, retries, limits, storage keys | `src/js/config.js`                                            |
| Request behaviour, retries, errors   | `src/js/api/gemini.js`                                        |
| API key / model UI                   | `src/js/ui/settings-dialog.js`, `src/js/services/settings.js` |
| Saved briefings                      | `src/js/services/dossiers.js`                                 |
| A module's flow                      | `src/js/modules/<name>.js`                                    |
| Boot order                           | `src/js/main.js`                                              |

## Making a change

```bash
git checkout -b feat/short-description   # never commit directly to main
npm run check                            # format + lint + verify + test + build
```

`npm run check` is exactly what CI runs. If it passes locally, CI passes.

## Style

- Prettier owns formatting (`npm run format`); ESLint owns correctness
  (`npm run lint`). Do not hand-format.
- 4-space indent, double quotes, semicolons, 120-column soft limit, LF endings
  (`.editorconfig`, `.prettierrc.json`).
- JSDoc on exported functions; `@param`/`@returns` where the types are not obvious.
- Keep DOM lookups in `core/dom.js`. Do not scatter `document.getElementById`
  through feature code — `npm run verify` will flag ids that do not exist.
- Tailwind classes used from JavaScript must appear as complete literal strings so
  the compiler can see them (`content` in `tailwind.config.js` scans `src/**/*.{html,js}`).
- Commit messages: [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat(matrix): …`, `fix(comms): …`, `docs: …`, `ci: …`).

## Testing

Tests live in `tests/*.test.js` and run on Node's built-in runner (`npm test`,
`npm run test:watch`).

- **Unit tests** import the _pure_ layers only — `core/sanitize`, `core/markdown`,
  `core/format`, `core/history`, `core/prompts`, `core/bus`, `config`,
  `api/gemini`, `services/settings`. They never touch `core/dom.js`.
- **`tests/boot.test.js`** is the deliberate exception: it builds a jsdom instance
  from the real `src/index.html`, installs the DOM globals, imports
  `src/js/main.js` and drives the UI (tabs, theme, dialog, form submits) against a
  stubbed `fetch`. That is what catches a mismatch between the `els` map and the
  markup. Extend it whenever you add a panel or a new id.

Adding a feature? Add tests for its pure logic. Touching the API client? Stub
`globalThis.fetch` — see `tests/gemini.test.js` for the pattern, including
`backoffBaseMs: 1` so retries stay fast.

## Pull requests

1. Small, focused PRs. One concern per PR.
2. Fill in the PR template — especially _how it was tested_ and screenshots for
   visual changes (dark **and** light).
3. Reference the issue (`Closes #12`).
4. Update `CHANGELOG.md` under `[Unreleased]`, and `docs/` if structure changed.
5. Keep `npm run check` green and rebase on `main` before requesting review.

Reviewers will look for: escaped model output, no new DOM ids missing from the
markup, prompts in `prompts.js`, config values not hard-coded, and no dependency
creep.

## Releasing

1. Update `CHANGELOG.md`: move `[Unreleased]` entries under a new version heading
   with the date.
2. Bump `version` in `package.json`.
3. Merge to `main`, then tag and push:

   ```bash
   git tag -a v2.1.0 -m "Release v2.1.0"
   git push origin v2.1.0
   ```

4. Publish a GitHub release from the tag with the changelog body. Pages redeploys
   automatically on the push to `main`.

## Reporting security issues

Do **not** open a public issue. Follow the private process in
[SECURITY.md](SECURITY.md).
