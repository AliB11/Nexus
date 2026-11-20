import test from "node:test";
import assert from "node:assert/strict";

import { NexusApiError, blockReason, createGeminiClient, extractSources, firstText } from "../src/js/api/gemini.js";
import { registerAction } from "../src/js/core/bus.js";

/**
 * Installs a fake `fetch` and records every call.
 * @param {Array<(call: number) => Response | Promise<Response>>} responders
 */
function stubFetch(responders) {
    const calls = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        const index = calls.length;
        calls.push({ url, init });
        const responder = responders[Math.min(index, responders.length - 1)];
        return responder(index);
    };
    return {
        calls,
        restore() {
            globalThis.fetch = original;
        }
    };
}

/** @returns {Response} a minimal Response-like object. */
function jsonResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body)
    };
}

// --------------------------------------------------------------- extractSources
test("extractSources reads groundingAttributions", () => {
    const candidate = {
        groundingMetadata: {
            groundingAttributions: [
                { web: { uri: "https://a.example/1", title: "First" } },
                { web: { uri: "https://b.example/2", title: "Second" } }
            ]
        }
    };
    assert.deepEqual(extractSources(candidate), [
        { uri: "https://a.example/1", title: "First" },
        { uri: "https://b.example/2", title: "Second" }
    ]);
});

test("extractSources falls back to groundingChunks and de-duplicates by URI", () => {
    const candidate = {
        groundingMetadata: {
            groundingAttributions: [{ web: { uri: "https://a.example/1", title: "First" } }],
            groundingChunks: [
                { web: { uri: "https://a.example/1", title: "Duplicate" } },
                { web: { uri: "https://c.example/3", title: "Third" } }
            ]
        }
    };
    // Chunks are only consulted when no attribution produced a source.
    assert.deepEqual(extractSources(candidate), [{ uri: "https://a.example/1", title: "First" }]);

    const chunksOnly = {
        groundingMetadata: { groundingChunks: [{ web: { uri: "https://c.example/3", title: "Third" } }] }
    };
    assert.deepEqual(extractSources(chunksOnly), [{ uri: "https://c.example/3", title: "Third" }]);
});

test("extractSources ignores incomplete entries and missing metadata", () => {
    assert.deepEqual(extractSources({ groundingMetadata: { groundingAttributions: [{ web: { uri: "x" } }] } }), []);
    assert.deepEqual(extractSources({}), []);
    assert.deepEqual(extractSources(undefined), []);
});

// --------------------------------------------------------------- firstText / blockReason
test("firstText joins every text part of the first candidate", () => {
    const response = {
        candidates: [{ content: { parts: [{ text: "Alpha " }, { text: "Beta" }, { thought: true }] } }]
    };
    assert.equal(firstText(response), "Alpha Beta");
});

test("firstText returns an empty string when the model produced nothing usable", () => {
    assert.equal(firstText({}), "");
    assert.equal(firstText({ candidates: [] }), "");
    assert.equal(firstText({ candidates: [{ content: { parts: [] } }] }), "");
    assert.equal(firstText(undefined), "");
});

test("blockReason reports anything that is not a normal STOP", () => {
    assert.equal(blockReason({ candidates: [{ finishReason: "STOP" }] }), null);
    assert.equal(blockReason({ candidates: [{ finishReason: "SAFETY" }] }), "SAFETY");
    assert.equal(blockReason({}), null);
});

// ------------------------------------------------------------------ api client
test("the client refuses to call the API without a key and asks the UI for one", async () => {
    let prompted = 0;
    registerAction("apikey:prompt", () => {
        prompted += 1;
    });

    const client = createGeminiClient({ getApiKey: () => "" });
    await assert.rejects(
        () => client.generate({ contents: [] }),
        (err) => {
            assert.ok(err instanceof NexusApiError);
            assert.equal(err.code, "missing_api_key");
            return true;
        }
    );
    assert.equal(prompted, 1);
});

test("the client sends the key as a header, never in the query string", async () => {
    const fetchStub = stubFetch([() => jsonResponse(200, { candidates: [] })]);
    try {
        const client = createGeminiClient({ getApiKey: () => "AIza-secret", getModel: () => "gemini-test" });
        await client.generate({ contents: [{ parts: [{ text: "ping" }] }] });

        const [call] = fetchStub.calls;
        assert.equal(call.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
        assert.ok(!call.url.includes("key="), "the key must not appear in the URL");
        assert.equal(call.init.headers["x-goog-api-key"], "AIza-secret");
        assert.equal(call.init.headers["Content-Type"], "application/json");
        assert.equal(call.init.method, "POST");
        assert.deepEqual(JSON.parse(call.init.body), { contents: [{ parts: [{ text: "ping" }] }] });
    } finally {
        fetchStub.restore();
    }
});

test("429 and 5xx responses are retried with backoff, then succeed", async () => {
    const fetchStub = stubFetch([
        () => jsonResponse(429, { error: "rate limited" }),
        () => jsonResponse(503, { error: "unavailable" }),
        () => jsonResponse(200, { candidates: [{ content: { parts: [{ text: "ok" }] } }] })
    ]);
    try {
        const client = createGeminiClient({
            getApiKey: () => "AIza-secret",
            maxRetries: 3,
            backoffBaseMs: 1 // keep the test fast
        });
        const result = await client.generate({ contents: [] });
        assert.equal(firstText(result), "ok");
        assert.equal(fetchStub.calls.length, 3);
    } finally {
        fetchStub.restore();
    }
});

test("a 400 is fatal and is not retried", async () => {
    const fetchStub = stubFetch([() => jsonResponse(400, { error: { message: "API key not valid" } })]);
    try {
        const client = createGeminiClient({ getApiKey: () => "bad", maxRetries: 3, backoffBaseMs: 1 });
        await assert.rejects(
            () => client.generate({ contents: [] }),
            (err) => {
                assert.equal(err.code, "http_error");
                assert.equal(err.status, 400);
                assert.match(err.message, /وضعیت 400/);
                return true;
            }
        );
        assert.equal(fetchStub.calls.length, 1);
    } finally {
        fetchStub.restore();
    }
});

test("exhausted retries surface a NexusApiError", async () => {
    const fetchStub = stubFetch([() => jsonResponse(500, { error: "boom" })]);
    try {
        const client = createGeminiClient({ getApiKey: () => "k", maxRetries: 2, backoffBaseMs: 1 });
        await assert.rejects(() => client.generate({ contents: [] }), NexusApiError);
        assert.equal(fetchStub.calls.length, 3, "initial attempt plus two retries");
    } finally {
        fetchStub.restore();
    }
});

test("network failures are retried and then reported as network errors", async () => {
    const fetchStub = stubFetch([
        () => {
            throw new Error("Failed to fetch");
        }
    ]);
    try {
        const client = createGeminiClient({ getApiKey: () => "k", maxRetries: 1, backoffBaseMs: 1 });
        await assert.rejects(
            () => client.generate({ contents: [] }),
            (err) => {
                assert.equal(err.code, "network_error");
                assert.match(err.message, /Failed to fetch/);
                return true;
            }
        );
        assert.equal(fetchStub.calls.length, 2);
    } finally {
        fetchStub.restore();
    }
});

test("hasKey and getModel reflect the injected providers", () => {
    let key = "";
    const client = createGeminiClient({ getApiKey: () => key, getModel: () => "gemini-x" });
    assert.equal(client.hasKey(), false);
    key = "AIza";
    assert.equal(client.hasKey(), true);
    assert.equal(client.getModel(), "gemini-x");
});
