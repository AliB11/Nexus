#!/usr/bin/env node
/**
 * Dependency-free static file server for NEXUS.
 *
 * Used by `npm run preview` (dist/) and by `npm run dev`. Binds to 0.0.0.0 so it
 * works inside containers, sandboxes and proxied preview environments.
 *
 *   node scripts/serve.mjs [directory] [port]
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".woff2": "font/woff2"
};

/**
 * Starts the static server.
 * @param {{ root?: string, port?: number, host?: string, cache?: boolean }} [options]
 * @returns {import("node:http").Server}
 */
export function startServer(options = {}) {
    const root = path.resolve(options.root || "dist");
    const port = Number(options.port || process.env.PORT || 4173);
    const host = options.host || process.env.HOST || "0.0.0.0";
    const cache = options.cache !== false;

    const server = createServer(async (req, res) => {
        try {
            const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
            const pathname = decodeURIComponent(url.pathname);

            // Resolve inside `root` only — block ../ traversal. The separator is
            // appended so a sibling directory (e.g. `dist2` next to `dist`)
            // cannot pass a bare startsWith prefix check.
            let filePath = path.resolve(root, `.${path.posix.normalize(pathname)}`);
            if (!filePath.startsWith(root + path.sep) && filePath !== root) {
                res.writeHead(403).end("Forbidden");
                return;
            }

            let info = await stat(filePath).catch(() => null);
            if (info?.isDirectory()) {
                filePath = path.join(filePath, "index.html");
                info = await stat(filePath).catch(() => null);
            }
            if (!info?.isFile()) {
                // SPA-ish fallback, then a real 404.
                const notFound = path.join(root, "404.html");
                const fallback = await stat(notFound).catch(() => null);
                if (fallback?.isFile()) {
                    const body = await readFile(notFound);
                    res.writeHead(404, { "Content-Type": MIME[".html"], "Cache-Control": "no-cache" }).end(body);
                } else {
                    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 — Not found");
                }
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const body = await readFile(filePath);
            res.writeHead(200, {
                "Content-Type": MIME[ext] || "application/octet-stream",
                "Content-Length": body.byteLength,
                "Cache-Control": cache ? "public, max-age=0, must-revalidate" : "no-store",
                "X-Content-Type-Options": "nosniff"
            }).end(body);
        } catch (err) {
            res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end(`500 — ${err.message}`);
        }
    });

    server.listen(port, host, () => {
        const shown = host === "0.0.0.0" ? "localhost" : host;
        console.log(`> NEXUS serving ${path.relative(process.cwd(), root) || root}/ → http://${shown}:${port}`);
    });

    return server;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
    startServer({ root: process.argv[2] || "dist", port: Number(process.argv[3]) || undefined });
}
