/**
 * Tests for the local model-gateway proxy (`scripts/proxy.mjs`).
 *
 * The proxy is the documented fallback for a static deployment whose gateway
 * refuses cross-origin browser calls, so its pass-through behaviour is verified
 * against a stub upstream — no network access required.
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { createProxyServer } from "../scripts/proxy.mjs";

/**
 * Every server started by a test.
 *
 * `close()` alone is not enough: undici keeps its sockets open for reuse, so a
 * listening server with an idle keep-alive connection would keep the event loop
 * alive and the test process would never exit. `closeAllConnections()` drops them.
 *
 * @type {import("node:net").Server[]}
 */
const servers = [];

after(() => {
    for (const server of servers) {
        server.closeAllConnections?.();
        server.close();
    }
});

/**
 * @param {import("node:net").Server} server
 * @returns {Promise<string>} the origin it is listening on
 */
function listen(server) {
    servers.push(server);
    server.keepAliveTimeout = 50;
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`));
    });
}

/**
 * A stub gateway that records every forwarded request and answers from a queue.
 *
 * @param {(req: { method: string, url: string, headers: object, body: string }) => object} responder
 */
async function startStubUpstream(responder) {
    const calls = [];
    const server = createServer((req, res) => {
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => {
            body += chunk;
        });
        req.on("end", () => {
            calls.push({ method: req.method, url: req.url, headers: req.headers, body });
            const answer = responder({ method: req.method, url: req.url, headers: req.headers, body });
            res.writeHead(answer.status || 200, answer.headers || { "Content-Type": "application/json" });
            res.end(typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body ?? {}));
        });
    });

    const url = await listen(server);
    return { url, calls };
}

/**
 * @param {string} upstream
 * @param {{ allowOrigin?: string }} [options]
 */
async function startProxy(upstream, options = {}) {
    const lines = [];
    const server = createProxyServer({ upstream, allowOrigin: options.allowOrigin ?? "*", log: (line) => lines.push(line) });
    const url = await listen(server);
    return { url, lines };
}

const SECRET = "coa_0123456789abcdef0123456789abcdef";

// ------------------------------------------------------------------ pass-through
test("a GET is forwarded to the upstream gateway and its answer comes back", async () => {
    const upstream = await startStubUpstream(() => ({
        status: 200,
        body: { object: "list", data: [{ id: "gemini-3-8-flash" }] }
    }));
    const proxy = await startProxy(upstream.url);

    const response = await fetch(`${proxy.url}/api/v1/models`, { headers: { Authorization: `Bearer ${SECRET}` } });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.data, [{ id: "gemini-3-8-flash" }]);
    assert.equal(upstream.calls.length, 1);
    assert.equal(upstream.calls[0].url, "/api/v1/models", "the path is passed through untouched");
    assert.equal(upstream.calls[0].headers.authorization, `Bearer ${SECRET}`, "the key reaches the gateway");
});

test("a POST keeps its method, headers and body", async () => {
    const upstream = await startStubUpstream(() => ({
        status: 200,
        body: { model: "gemini-3-8-flash", choices: [{ message: { content: "pong" } }] }
    }));
    const proxy = await startProxy(upstream.url);

    const payload = { model: "gemini-3-8-flash", messages: [{ role: "user", content: "ping" }], max_tokens: 1 };
    const response = await fetch(`${proxy.url}/api/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).choices[0].message.content, "pong");
    assert.deepEqual(JSON.parse(upstream.calls[0].body), payload, "the body is not rewritten");
    assert.equal(upstream.calls[0].headers["content-type"], "application/json");
    // Hop-by-hop and browser-identity headers must not be replayed upstream.
    assert.equal(upstream.calls[0].headers.origin, undefined);
    assert.equal(upstream.calls[0].headers.referer, undefined);
});

test("upstream status codes and error bodies survive the hop", async () => {
    const upstream = await startStubUpstream(() => ({
        status: 403,
        body: { error: { message: "Terms required", code: "model_api_terms_required" } }
    }));
    const proxy = await startProxy(upstream.url);

    const response = await fetch(`${proxy.url}/api/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET}` },
        body: "{}"
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.error.code, "model_api_terms_required", "the app maps this code to Persian advice");
});

test("gateway metadata headers are forwarded and exposed to browser JavaScript", async () => {
    const upstream = await startStubUpstream(() => ({
        status: 200,
        headers: {
            "Content-Type": "application/json",
            "x-coarena-request-id": "req_42",
            "x-coarena-model": "gemini-3-8-flash",
            "x-coarena-substituted-from": "claude-fable-5",
            "retry-after": "7"
        },
        body: { ok: true }
    }));
    const proxy = await startProxy(upstream.url);

    const response = await fetch(`${proxy.url}/api/v1/chat/completions`, { method: "POST", body: "{}" });

    assert.equal(response.headers.get("x-coarena-request-id"), "req_42");
    assert.equal(response.headers.get("x-coarena-model"), "gemini-3-8-flash");
    // Without Expose-Headers, fetch() hides every non-CORS-safelisted header.
    const exposed = response.headers.get("access-control-expose-headers") || "";
    assert.match(exposed, /x-coarena-request-id/);
    assert.match(exposed, /x-coarena-substituted-from/);
    assert.match(exposed, /retry-after/);
    assert.match(exposed, /x-should-retry/);
});

// ------------------------------------------------------------------------- CORS
test("every answer carries CORS headers, whatever the upstream sent", async () => {
    const upstream = await startStubUpstream(() => ({
        status: 200,
        // A stricter upstream policy must not leak through and break the app.
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://only-their-own.app" },
        body: { ok: true }
    }));
    const proxy = await startProxy(upstream.url);

    const response = await fetch(`${proxy.url}/api/v1/models`);

    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.equal(response.headers.get("vary"), "Origin");
});

test("an allow-list origin is honoured when the proxy is not run wide open", async () => {
    const upstream = await startStubUpstream(() => ({ status: 200, body: { ok: true } }));
    const proxy = await startProxy(upstream.url, { allowOrigin: "https://alib11.github.io" });

    const response = await fetch(`${proxy.url}/api/v1/models`);

    assert.equal(response.headers.get("access-control-allow-origin"), "https://alib11.github.io");
});

test("a preflight is answered locally without touching the gateway", async () => {
    const upstream = await startStubUpstream(() => ({ status: 200, body: { ok: true } }));
    const proxy = await startProxy(upstream.url);

    const response = await fetch(`${proxy.url}/api/v1/chat/completions`, {
        method: "OPTIONS",
        headers: { Origin: "https://alib11.github.io", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization, content-type" }
    });

    assert.equal(response.status, 204);
    assert.match(response.headers.get("access-control-allow-methods") || "", /POST/);
    assert.match(response.headers.get("access-control-allow-headers") || "", /authorization/i);
    assert.equal(upstream.calls.length, 0, "a preflight must never reach the gateway");
});

// ------------------------------------------------------------------- resilience
test("an unreachable gateway answers 502 in the OpenAI error shape", async () => {
    // Port 1 on loopback refuses the connection immediately.
    const proxy = await startProxy("https://127.0.0.1:1");

    const response = await fetch(`${proxy.url}/api/v1/models`);
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.equal(body.error.code, "upstream_error");
    assert.equal(body.error.type, "proxy_error");
    assert.ok(body.error.message.length > 10);
    assert.equal(response.headers.get("access-control-allow-origin"), "*", "CORS still applies to failures");
});

test("the health endpoint answers without calling the gateway", async () => {
    const upstream = await startStubUpstream(() => ({ status: 200, body: { ok: true } }));
    const proxy = await startProxy(upstream.url);

    const response = await fetch(`${proxy.url}/healthz`);
    const body = await response.json();

    assert.equal(body.ok, true);
    assert.equal(body.upstream, upstream.url);
    assert.match(body.hint, /\/api\/v1/);
    assert.equal(upstream.calls.length, 0);
});

test("the API key is forwarded but never written to the log", async () => {
    const upstream = await startStubUpstream(() => ({ status: 200, body: { ok: true } }));
    const proxy = await startProxy(upstream.url);

    await fetch(`${proxy.url}/api/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET}` },
        body: "{}"
    });

    assert.ok(proxy.lines.length > 0, "the proxy logs something for every request");
    for (const line of proxy.lines) {
        assert.ok(!line.includes(SECRET), `the key leaked into a log line: ${line}`);
        assert.ok(!line.includes("Bearer"), `an Authorization header leaked into a log line: ${line}`);
    }
});
