## What does this change?

<!-- One or two sentences. Link the issue: "Closes #12". -->

## Why?

<!-- The analyst or developer problem this solves. -->

## Type of change

- [ ] Bug fix (no behaviour change beyond the fix)
- [ ] New module or capability
- [ ] Refactor (no behaviour change)
- [ ] Design / UI
- [ ] Tooling, CI or docs

## How was it tested?

- [ ] `npm run check` passes locally (format, lint, verify, test, build)
- [ ] Manual check in a browser: which module(s), which input
- [ ] New/updated unit tests in `tests/`
- [ ] Not applicable — explain below

## Checklist

- [ ] No API keys, tokens or personal data added to the repository
- [ ] Model output is still escaped before it reaches `innerHTML` (`escapeHtml` / `renderMarkdown`)
- [ ] New DOM ids exist in `src/index.html` (`npm run verify` proves it)
- [ ] New Tailwind classes used from JavaScript are reachable by the `content` globs in `tailwind.config.js`
- [ ] Prompts changed in `src/js/core/prompts.js`, not inline in a handler
- [ ] `docs/ARCHITECTURE.md` updated if the module layout changed
- [ ] `CHANGELOG.md` has an entry under _Unreleased_

## Screenshots

<!-- Required for any visual change: before and after, dark and light. -->
