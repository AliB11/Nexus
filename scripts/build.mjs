#!/usr/bin/env node
/**
 * NEXUS production build.
 *
 *   1. Compiles Tailwind CSS  → dist/styles/main.css (minified, purged)
 *   2. Copies src/index.html  → dist/index.html
 *   3. Copies src/js/**       → dist/js/**
 *   4. Copies public/**       → dist/**   (favicon, manifest, robots, OG image)
 *   5. Writes dist/.nojekyll  (GitHub Pages must not run Jekyll over the output)
 *
 * No bundler is used: the browser loads native ES modules, so the JS is copied
 * as-is. The result is a fully static folder you can host anywhere.
 */
import { spawn } from "node:child_process";
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const PUBLIC = path.join(ROOT, "public");
const DIST = path.join(ROOT, "dist");

/**
 * Runs a command, inheriting stdio.
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<void>}
 */
function run(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: ROOT,
            stdio: "inherit",
            shell: process.platform === "win32",
            env: {
                ...process.env,
                // The bundled caniuse data can lag behind the release calendar; the
                // "outdated" notice is noise for a pinned, reproducible build.
                BROWSERSLIST_IGNORE_OLD_DATA: "1"
            }
        });
        child.on("error", reject);
        child.on("exit", (code) =>
            code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} failed (exit ${code})`))
        );
    });
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>} absolute paths of every file below `dir`.
 */
async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
        entries.map((entry) => {
            const full = path.join(dir, entry.name);
            return entry.isDirectory() ? walk(full) : Promise.resolve([full]);
        })
    );
    return files.flat();
}

/**
 * Builds the static site.
 * @param {{ minify?: boolean, quiet?: boolean }} [options]
 */
export async function build(options = {}) {
    const { minify = true, quiet = false } = options;
    const log = quiet ? () => {} : (msg) => console.log(msg);
    const started = Date.now();

    log(`> NEXUS build (${minify ? "production" : "development"})`);

    await rm(DIST, { recursive: true, force: true });
    await mkdir(path.join(DIST, "styles"), { recursive: true });

    // 1. Tailwind CSS
    const cssArgs = [
        "--no-install",
        "tailwindcss",
        "-i",
        path.join("src", "styles", "main.css"),
        "-o",
        path.join("dist", "styles", "main.css")
    ];
    if (minify) cssArgs.push("--minify");
    await run(process.platform === "win32" ? "npx.cmd" : "npx", cssArgs);

    // 2. Markup
    await cp(path.join(SRC, "index.html"), path.join(DIST, "index.html"));

    // 3. JavaScript modules
    await cp(path.join(SRC, "js"), path.join(DIST, "js"), { recursive: true });

    // 4. Static assets
    try {
        await cp(PUBLIC, DIST, { recursive: true });
    } catch {
        log("  ! no public/ directory — skipped static assets");
    }

    // 5. GitHub Pages
    await writeFile(path.join(DIST, ".nojekyll"), "");

    const files = await walk(DIST);
    let total = 0;
    for (const file of files) total += (await stat(file)).size;

    log(`  ✓ ${files.length} files, ${(total / 1024).toFixed(1)} KB → dist/ (${Date.now() - started} ms)`);
    return { files: files.length, bytes: total };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
    const minify = !process.argv.includes("--no-minify");
    build({ minify }).catch((err) => {
        console.error(`\nBuild failed: ${err.message}`);
        process.exit(1);
    });
}
