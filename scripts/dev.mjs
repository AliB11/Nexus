#!/usr/bin/env node
/**
 * NEXUS local development server.
 *
 *   npm run dev            → build once, serve on http://localhost:5173
 *   npm run dev -- 8080    → serve on a custom port
 *
 * Watches src/, public/ and tailwind.config.js and rebuilds dist/ on change.
 * Refresh the browser to see the result (no live-reload injection, by design:
 * the served output is byte-identical to what gets deployed).
 */
import { watch } from "node:fs";
import path from "node:path";
import { build } from "./build.mjs";
import { startServer } from "./serve.mjs";

const port = Number(process.argv[2] || process.env.PORT || 5173);

await build({ minify: false });
startServer({ root: "dist", port, cache: false });

let pending = null;
let rebuilding = false;
let queued = false;

async function rebuild(reason) {
    if (rebuilding) {
        queued = true;
        return;
    }
    rebuilding = true;
    try {
        console.log(`\n↻ change detected (${reason}) — rebuilding…`);
        await build({ minify: false, quiet: true });
        console.log("  ✓ dist/ up to date — refresh the browser");
    } catch (err) {
        console.error(`  ✗ rebuild failed: ${err.message}`);
    } finally {
        rebuilding = false;
        if (queued) {
            queued = false;
            await rebuild("queued change");
        }
    }
}

function scheduleRebuild(reason) {
    clearTimeout(pending);
    pending = setTimeout(() => rebuild(reason), 120);
}

const watchTargets = ["src", "public", "tailwind.config.js", "postcss.config.js"];
for (const target of watchTargets) {
    const full = path.resolve(target);
    try {
        watch(full, { recursive: true }, (_event, filename) => {
            if (filename && !/\.(html|js|css|json|svg|png|webmanifest)$/.test(filename)) return;
            scheduleRebuild(filename || target);
        });
    } catch (err) {
        console.warn(`  ! could not watch ${target}: ${err.message}`);
    }
}

console.log("  watching src/, public/, tailwind.config.js — Ctrl+C to stop");
