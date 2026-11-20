#!/usr/bin/env node
/**
 * Local pass-through proxy for the model gateway.
 *
 * WHY THIS EXISTS
 * NEXUS is a static site: the browser calls the gateway directly. That works
 * only while the gateway answers a cross-origin request — i.e. sends
 * `Access-Control-Allow-Origin`. Coarena's documentation describes server-side
 * clients (curl, the OpenAI and Anthropic SDKs) and says nothing about browser
 * access, so a direct call may be refused by the browser with a CORS error.
 *
 * This script removes that unknown without changing a line of app code: it
 * forwards everything it receives to the upstream gateway and adds permissive
 * CORS headers on the way back. Point the app's «نشانی درگاه (URL)» field at it
 * and the three-field form works exactly as before.
 *
 *   npm run proxy                     # listens on 0.0.0.0:8787
 *   PORT=9000 npm run proxy
 *   NEXUS_UPSTREAM=https://coarena.ai npm run proxy
 *
 * Then in the app:  URL = http://127.0.0.1:8787/api/v1
 *
 * Browsers treat `http://127.0.0.1` as a potentially trustworthy origin, so this
 * also works from an HTTPS deployment such as GitHub Pages.
 *
 * SAFETY
 * - It is a development tool. Do not expose it to the internet: with `*` as the
 *   allowed origin, any site the machine visits could use it to reach the
 *   gateway with whatever key the browser sends. Set `NEXUS_ALLOW_ORIGIN` to a
 *   single origin if you must run it on a shared network.
 * - The `Authorization` header is forwarded but never logged.
 */
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { pathToFileURL } from "node:url";

/** Hop-by-hop headers that must not be forwarded in either direction. */
const HOP_BY_HOP = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "host",
    "origin",
    "referer"
]);

/** Response headers the app reads, which CORS hides unless they are exposed. */
const EXPOSE_HEADERS = [
    "x-coarena-request-id",
    "x-coarena-model",
    "x-coarena-substituted-from",
    "x-coarena-substituted-to",
    "x-coarena-substitution-reason",
    "x-coarena-dropped-params",
    "retry-after",
    "x-should-retry"
].join(", ");

/**
 * Builds the proxy server. Exported so `tests/proxy.test.js` can point it at a
 * stub upstream instead of the real gateway.
 *
 * @param {object} [options]
 * @param {string} [options.upstream] Gateway origin, e.g. `https://coarena.ai`.
 * @param {string} [options.allowOrigin] Value for `Access-Control-Allow-Origin`.
 * @param {(line: string) => void} [options.log] Log sink; defaults to `console.log`.
 * @returns {import("node:http").Server}
 */
export function createProxyServer(options = {}) {
    const upstream = String(options.upstream || process.env.NEXUS_UPSTREAM || "https://coarena.ai").replace(/\/+$/, "");
    const allowOrigin = String(options.allowOrigin || process.env.NEXUS_ALLOW_ORIGIN || "*");
    const log = options.log || ((line) => console.log(line));

    /**
     * CORS headers for one request. A preflight's requested headers are echoed
     * back, because a fixed list would break gateways that use `x-api-key`.
     *
     * @param {import("node:http").IncomingMessage} req
     */
    function corsHeaders(req) {
        return {
            "Access-Control-Allow-Origin": allowOrigin,
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers":
                req.headers["access-control-request-headers"] || "Authorization, Content-Type, x-api-key",
            "Access-Control-Expose-Headers": EXPOSE_HEADERS,
            "Access-Control-Max-Age": "86400",
            Vary: "Origin"
        };
    }

    return createServer((req, res) => {
        const started = Date.now();

        if (req.method === "OPTIONS") {
            res.writeHead(204, corsHeaders(req));
            res.end();
            log(`← OPTIONS ${req.url} 204 (preflight)`);
            return;
        }

        if (req.url === "/" || req.url === "/healthz") {
            const body = JSON.stringify({
                ok: true,
                proxy: "nexus-model-proxy",
                upstream,
                hint: "Set the app's gateway URL to this origin plus the API path, e.g. /api/v1"
            });
            res.writeHead(200, {
                ...corsHeaders(req),
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body)
            });
            res.end(body);
            return;
        }

        const target = new URL(req.url, upstream);

        /** @type {Record<string, string | string[]>} */
        const headers = {};
        for (const [name, value] of Object.entries(req.headers)) {
            if (!HOP_BY_HOP.has(name.toLowerCase()) && value !== undefined) headers[name] = value;
        }

        // Both schemes are supported so the upstream can be a local gateway too.
        const forward = target.protocol === "http:" ? httpRequest : httpsRequest;

        const forwarded = forward(target, { method: req.method, headers }, (upstreamResponse) => {
            /** @type {Record<string, unknown>} */
            const out = {};
            for (const [name, value] of Object.entries(upstreamResponse.headers)) {
                // The proxy's own CORS headers win, so the browser never sees
                // a duplicated or stricter policy from upstream.
                if (!name.toLowerCase().startsWith("access-control-") && !HOP_BY_HOP.has(name.toLowerCase())) {
                    out[name] = value;
                }
            }
            res.writeHead(upstreamResponse.statusCode || 502, { ...out, ...corsHeaders(req) });
            upstreamResponse.pipe(res);
            upstreamResponse.on("end", () => {
                log(`→ ${req.method} ${req.url} ${upstreamResponse.statusCode} (${Date.now() - started} ms)`);
            });
        });

        forwarded.on("error", (err) => {
            const body = JSON.stringify({
                error: {
                    message: `پروکسی به ${target.origin} نرسید: ${err.message}`,
                    type: "proxy_error",
                    code: "upstream_error"
                }
            });
            if (!res.headersSent) {
                res.writeHead(502, {
                    ...corsHeaders(req),
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(body)
                });
            }
            res.end(body);
            log(`✗ ${req.method} ${req.url} → ${err.message}`);
        });

        // Stream the request body through untouched, so large base64 images and
        // (later) SSE responses both work without buffering.
        req.pipe(forwarded);
    });
}

/**
 * Starts the proxy when this file is run directly.
 */
export function main() {
    const host = process.env.HOST || "0.0.0.0";
    const port = Number(process.env.PORT || 8787);
    const server = createProxyServer();

    server.listen(port, host, () => {
        const upstream = process.env.NEXUS_UPSTREAM || "https://coarena.ai";
        console.log(`
NEXUS model proxy
  listening  http://127.0.0.1:${port}
  upstream   ${upstream}
  CORS       ${process.env.NEXUS_ALLOW_ORIGIN || "*"}

در NEXUS، در پنجرهٔ تنظیمات، نشانی درگاه را بگذارید:
  http://127.0.0.1:${port}/api/v1
سپس «تست اتصال» را بزنید.
`);
    });

    for (const signal of ["SIGINT", "SIGTERM"]) {
        process.on(signal, () => {
            server.close(() => process.exit(0));
        });
    }
    return server;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
