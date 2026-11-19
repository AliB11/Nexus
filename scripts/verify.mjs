#!/usr/bin/env node
/**
 * Static integrity checks for NEXUS.
 *
 * The app ships as native ES modules with no bundler, so nothing would normally
 * fail until a browser loads it. This script catches the common breakages at
 * build time (and in CI):
 *
 *   1. every `getElementById()` / `byId()` reference exists in src/index.html
 *   2. every relative import resolves to a real file
 *   3. every named import is actually exported by its target module
 *   4. every bus action that is invoked is also registered
 *   5. informational: markup ids that no module references
 *
 * Exit code 1 on any error.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const JS_DIR = path.join(ROOT, "src", "js");
const HTML = path.join(ROOT, "src", "index.html");

const errors = [];
const warnings = [];
const info = [];

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
        entries.map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : Promise.resolve([path.join(dir, e.name)])))
    );
    return files.flat().filter((f) => f.endsWith(".js"));
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

const html = await readFile(HTML, "utf8");
const jsFiles = await walk(JS_DIR);
const sources = new Map();
for (const file of jsFiles) sources.set(file, await readFile(file, "utf8"));

// ---------------------------------------------------------------- 1. DOM ids
const markupIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const referencedIds = new Map(); // id -> [files]
const dynamicIds = new Set(); // created in JS, e.g. `div.id = "chatTypingIndicator"`
const idPrefixes = new Set(); // built from template literals, e.g. `panel-${tabName}`

for (const [, code] of sources) {
    for (const m of code.matchAll(/\.id\s*=\s*"([^"]+)"/g)) dynamicIds.add(m[1]);
    for (const m of code.matchAll(/`([a-zA-Z0-9_-]+-)\$\{/g)) idPrefixes.add(m[1]);
}

for (const [file, code] of sources) {
    for (const m of code.matchAll(/(?:getElementById|byId)\(\s*"([^"]+)"\s*\)/g)) {
        if (!referencedIds.has(m[1])) referencedIds.set(m[1], []);
        referencedIds.get(m[1]).push(rel(file));
    }
}

/** @returns {boolean} whether an id is produced at runtime rather than written in markup. */
const isRuntimeId = (id) => dynamicIds.has(id) || [...idPrefixes].some((prefix) => id.startsWith(prefix));

for (const [id, files] of referencedIds) {
    if (!markupIds.has(id) && !dynamicIds.has(id)) {
        errors.push(
            `DOM id "${id}" is referenced in ${[...new Set(files)].join(", ")} but missing from src/index.html`
        );
    }
}
for (const id of markupIds) {
    if (!referencedIds.has(id) && !isRuntimeId(id)) info.push(`markup id "${id}" is never referenced from JS`);
}

// script tags in the markup must exist on disk
for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    const target = path.resolve(path.dirname(HTML), m[1]);
    if (!sources.has(target)) errors.push(`<script src="${m[1]}"> does not resolve to a source file`);
}

// ---------------------------------------------------- 2 & 3. module imports
const exportCache = new Map();

/**
 * @param {string} file
 * @returns {Set<string>} exported binding names
 */
function exportsOf(file) {
    if (exportCache.has(file)) return exportCache.get(file);
    const code = sources.get(file) || "";
    const names = new Set();

    for (const m of code.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/g)) names.add(m[1]);
    for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) {
        for (const part of m[1].split(",")) {
            const name = part
                .trim()
                .split(/\s+as\s+/)
                .pop();
            if (name) names.add(name.trim());
        }
    }
    if (/export\s+default/.test(code)) names.add("default");

    exportCache.set(file, names);
    return names;
}

for (const [file, code] of sources) {
    for (const m of code.matchAll(/import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g)) {
        const clause = m[1];
        const specifier = m[2];

        if (!specifier.startsWith(".")) {
            errors.push(`${rel(file)} imports bare specifier "${specifier}" — the browser cannot resolve it`);
            continue;
        }

        const target = path.resolve(path.dirname(file), specifier);
        if (!sources.has(target)) {
            errors.push(`${rel(file)} imports "${specifier}" which does not exist`);
            continue;
        }

        const named = clause.match(/\{([\s\S]*)\}/);
        if (!named) continue;

        const available = exportsOf(target);
        for (const part of named[1].split(",")) {
            const raw = part.trim();
            if (!raw) continue;
            const original = raw.split(/\s+as\s+/)[0].trim();
            if (!available.has(original)) {
                errors.push(`${rel(file)} imports "${original}" from ${rel(target)}, which does not export it`);
            }
        }
    }

    // side-effect imports: import "./x.js";
    for (const m of code.matchAll(/^import\s+["']([^"']+)["']/gm)) {
        const target = path.resolve(path.dirname(file), m[1]);
        if (!sources.has(target)) errors.push(`${rel(file)} imports "${m[1]}" which does not exist`);
    }
}

// ---------------------------------------------------------- 4. action bus
const registered = new Set();
const invoked = new Map();
for (const [file, code] of sources) {
    for (const m of code.matchAll(/registerAction\(\s*"([^"]+)"/g)) registered.add(m[1]);
    for (const m of code.matchAll(/(?:tryInvokeAction|invokeAction)\(\s*"([^"]+)"/g)) {
        if (!invoked.has(m[1])) invoked.set(m[1], []);
        invoked.get(m[1]).push(rel(file));
    }
}
for (const [name, files] of invoked) {
    if (!registered.has(name)) {
        errors.push(`bus action "${name}" is invoked in ${[...new Set(files)].join(", ")} but never registered`);
    }
}
for (const name of registered) {
    if (!invoked.has(name)) warnings.push(`bus action "${name}" is registered but never invoked`);
}

// ------------------------------------------------------------- 5. secrets
for (const [file, code] of sources) {
    for (const m of code.matchAll(/["'`](AIza[0-9A-Za-z_-]{20,})["'`]/g)) {
        errors.push(`${rel(file)} appears to contain a hard-coded Google API key (${m[1].slice(0, 8)}…)`);
    }
}

// ---------------------------------------------------------------- report
console.log(`NEXUS static verification — ${sources.size} modules, ${markupIds.size} markup ids`);
for (const line of errors) console.error(`  ✗ ${line}`);
for (const line of warnings) console.warn(`  ! ${line}`);
for (const line of info) console.log(`  · ${line}`);

if (errors.length > 0) {
    console.error(`\n${errors.length} error(s) found.`);
    process.exit(1);
}
console.log(`\n✓ no errors (${warnings.length} warning(s), ${info.length} informational)`);
