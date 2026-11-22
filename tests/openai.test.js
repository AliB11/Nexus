/**
 * OpenAI-compatible transport tests (the Coarena path).
 *
 * DOM-free on purpose: the wire format, retry policy and error mapping are the
 * parts most likely to break silently, and they need no browser to verify.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    COARENA_ADVICE,
    createOpenAIClient,
    fromOpenAIResult,
    networkErrorMessage,
    normalizeBaseUrl,
    toOpenAIPayload,
    toOpenAISchema
} from "../src/js/api/openai.js";
import { NexusApiError, backoffDelay, parseOpenAIError } from "../src/js/api/errors.js";
import { registerAction } from "../src/js/core/bus.js";
import { MATRIX_RESPONSE_SCHEMA } from "../src/js/core/schema.js";

/** Records every request and replays canned responses. */
function stubFetch(responder) {
    const calls = [];
    const impl = async (url, init) => {
        calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
        return responder(calls.length - 1, url, init);
    };
    return { calls, impl };
}

/** A minimal successful Chat Completions response. */
const okResponse = (content = "pong", model = "gemini-3-8-flash") => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ model, choices: [{ finish_reason: "stop", message: { content } }] }),
    text: async () => ""
});

// ----------------------------------------------------------------- wire format
test("a neutral request becomes a Chat Completions body", () => {
    const payload = toOpenAIPayload({
        system: "You are an analyst.",
        messages: [
            { role: "user", text: "First" },
            { role: "assistant", text: "Answer" },
            { role: "user", text: "Second" }
        ],
        maxTokens: 2048
    });

    assert.deepEqual(payload.messages, [
        { role: "system", content: "You are an analyst." },
        { role: "user", content: "First" },
        { role: "assistant", content: "Answer" },
        { role: "user", content: "Second" }
    ]);
    assert.equal(payload.max_tokens, 2048);
    // The client adds `model` per request, so the mapper must not bake one in.
    assert.ok(!("model" in payload));
});

test("images are attached to the last user turn as base64 data URLs", () => {
    const payload = toOpenAIPayload({
        messages: [
            { role: "user", text: "earlier" },
            { role: "user", text: "What is in this photo?" }
        ],
        images: [{ mimeType: "image/png", data: "QUJD" }]
    });

    // Coarena's Gemini models refuse remote image URLs, so inline data only.
    assert.equal(payload.messages[0].content, "earlier");
    assert.deepEqual(payload.messages[1].content, [
        { type: "text", text: "What is in this photo?" },
        { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } }
    ]);
});

test("structured output asks for an enforced JSON schema", () => {
    const schema = { type: "object", properties: { headline: { type: "string" } } };

    // Strict mode closes objects (`additionalProperties: false`) and marks every
    // property required — what OpenAI's `json_schema` contract demands.
    assert.deepEqual(
        toOpenAIPayload({ messages: [], jsonSchema: schema }, { jsonSchemaStrict: true }).response_format,
        {
            type: "json_schema",
            json_schema: {
                name: "nexus_signal_matrix",
                strict: true,
                schema: {
                    type: "object",
                    properties: { headline: { type: "string" } },
                    additionalProperties: false,
                    required: ["headline"]
                }
            }
        }
    );
    assert.deepEqual(toOpenAIPayload({ messages: [], jsonSchema: schema }).response_format, { type: "json_object" });
});

test("a Gemini-dialect schema is translated to JSON Schema for strict endpoints", () => {
    const payload = toOpenAIPayload({ messages: [], jsonSchema: MATRIX_RESPONSE_SCHEMA }, { jsonSchemaStrict: true });
    const wire = payload.response_format.json_schema.schema;

    assert.equal(wire.type, "object", "upper-case OBJECT becomes lower-case object");
    assert.equal(wire.properties.headline.type, "string");
    assert.equal(wire.properties.confidenceScore.type, "number");
    assert.ok(!("propertyOrdering" in wire), "the Gemini-only hint must not reach the wire");
    assert.ok(!("propertyOrdering" in wire.properties.entities.items), "nested objects are translated too");
    assert.equal(wire.additionalProperties, false, "strict mode closes the root object");
    assert.ok(Array.isArray(wire.required) && wire.required.length > 0, "every property is required");
    assert.equal(wire.properties.entities.items.additionalProperties, false, "nested objects are closed too");

    // The neutral contract is untouched: the Gemini transport still receives
    // its own dialect verbatim.
    assert.ok("propertyOrdering" in MATRIX_RESPONSE_SCHEMA);
});

test("toOpenAISchema keeps already-lower-case JSON Schema intact apart from strict closure", () => {
    const passthrough = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };
    assert.deepEqual(toOpenAISchema(passthrough), passthrough);

    const closed = toOpenAISchema(passthrough, { strict: true });
    assert.deepEqual(closed, {
        type: "object",
        properties: { a: { type: "string" } },
        required: ["a"],
        additionalProperties: false
    });
});

test("fromOpenAIResult normalises content, model and finish reason", () => {
    assert.deepEqual(
        fromOpenAIResult({
            model: "gemini-3-8-flash",
            choices: [{ finish_reason: "stop", message: { content: "  hi  " } }]
        }),
        {
            text: "hi",
            sources: [],
            finishReason: "stop",
            model: "gemini-3-8-flash",
            groundingApplied: false,
            raw: { model: "gemini-3-8-flash", choices: [{ finish_reason: "stop", message: { content: "  hi  " } }] }
        }
    );

    // Some gateways answer with an array of parts.
    assert.equal(
        fromOpenAIResult({
            choices: [
                {
                    message: {
                        content: [
                            { type: "text", text: "A" },
                            { type: "text", text: "B" }
                        ]
                    }
                }
            ]
        }).text,
        "AB"
    );
    assert.equal(fromOpenAIResult({}).text, "");
    assert.equal(fromOpenAIResult(undefined).model, null);
    assert.equal(
        fromOpenAIResult({ choices: [{ finish_reason: "length", message: { content: "" } }] }).finishReason,
        "length"
    );
});

test("normalizeBaseUrl drops trailing slashes without touching the path", () => {
    assert.equal(normalizeBaseUrl("https://coarena.ai/api/v1/"), "https://coarena.ai/api/v1");
    assert.equal(normalizeBaseUrl("  https://coarena.ai/api/v1///  "), "https://coarena.ai/api/v1");
    assert.equal(normalizeBaseUrl("https://coarena.ai/api"), "https://coarena.ai/api");
});

// -------------------------------------------------------------------- requests
test("the client refuses to call the gateway without a key and asks the UI for one", async () => {
    let prompted = 0;
    registerAction("apikey:prompt", () => {
        prompted += 1;
    });

    const client = createOpenAIClient({ getApiKey: () => "" });
    await assert.rejects(
        () => client.generate({ messages: [] }),
        (err) => {
            assert.ok(err instanceof NexusApiError);
            assert.equal(err.code, "missing_api_key");
            return true;
        }
    );
    assert.equal(prompted, 1);
});

test("the key travels in an Authorization header, never in the URL", async () => {
    const { calls, impl } = stubFetch(() => okResponse());
    const client = createOpenAIClient({
        getApiKey: () => "coa_secret",
        getBaseUrl: () => "https://coarena.ai/api/v1/",
        getModel: () => "gemini-3-8-flash",
        fetchImpl: impl
    });

    await client.generate(toOpenAIPayload({ messages: [{ role: "user", text: "ping" }] }));

    assert.equal(calls[0].url, "https://coarena.ai/api/v1/chat/completions");
    assert.ok(!calls[0].url.includes("coa_secret"), "the key must not appear in the URL");
    assert.equal(calls[0].init.headers.Authorization, "Bearer coa_secret");
    assert.equal(calls[0].init.headers["Content-Type"], "application/json");
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(calls[0].body, { messages: [{ role: "user", content: "ping" }], model: "gemini-3-8-flash" });
});

test("429 and 5xx are retried with backoff, then succeed", async () => {
    const { calls, impl } = stubFetch((index) =>
        index < 2
            ? {
                  ok: false,
                  status: index === 0 ? 429 : 503,
                  headers: { get: () => null },
                  text: async () => '{"error":{"message":"busy"}}'
              }
            : okResponse("ok")
    );

    const client = createOpenAIClient({ getApiKey: () => "k", maxRetries: 3, backoffBaseMs: 1, fetchImpl: impl });
    const result = await client.generate({ messages: [] });

    assert.equal(fromOpenAIResult(result).text, "ok");
    assert.equal(calls.length, 3);
});

test("a daily-quota 429 that says not to retry is fatal", async () => {
    const { calls, impl } = stubFetch(() => ({
        ok: false,
        status: 429,
        headers: { get: (name) => (name === "x-should-retry" ? "false" : null) },
        text: async () => '{"error":{"message":"Daily free limit reached","code":"insufficient_quota"}}'
    }));

    const client = createOpenAIClient({ getApiKey: () => "k", maxRetries: 3, backoffBaseMs: 1, fetchImpl: impl });
    await assert.rejects(
        () => client.generate({ messages: [] }),
        (err) => {
            assert.equal(err.status, 429);
            assert.match(err.message, /سهمیهٔ رایگان امروز تمام شده است/);
            return true;
        }
    );
    assert.equal(calls.length, 1, "retrying a spent daily quota only wastes the minute budget");
});

test("Retry-After is honoured when it asks for longer than the backoff", () => {
    assert.equal(backoffDelay(0, 1000, { get: () => "5" }), 5000);
    assert.equal(backoffDelay(0, 1000, { get: () => null }), 1000);
    assert.equal(backoffDelay(3, 1000, { get: () => "1" }), 8000);
    assert.equal(backoffDelay(1, 800, null), 1600);
});

test("a 400 is fatal and carries Coarena's advice for its error code", async () => {
    const { calls, impl } = stubFetch(() => ({
        ok: false,
        status: 403,
        headers: { get: () => null },
        text: async () => '{"error":{"message":"Terms not accepted","code":"model_api_terms_required"}}'
    }));

    const client = createOpenAIClient({ getApiKey: () => "k", maxRetries: 3, backoffBaseMs: 1, fetchImpl: impl });
    await assert.rejects(
        () => client.generate({ messages: [] }),
        (err) => {
            assert.equal(err.code, "http_error");
            assert.equal(err.status, 403);
            assert.equal(err.detail.errorCode, "model_api_terms_required");
            assert.match(err.message, /Terms not accepted/);
            assert.match(err.message, /شرایط Model API را در حساب Coarena بپذیرید/);
            return true;
        }
    );
    assert.equal(calls.length, 1);
});

test("an exhausted retry budget surfaces a NexusApiError", async () => {
    const { calls, impl } = stubFetch(() => {
        throw new TypeError("Failed to fetch");
    });

    const client = createOpenAIClient({ getApiKey: () => "k", maxRetries: 2, backoffBaseMs: 1, fetchImpl: impl });
    await assert.rejects(() => client.generate({ messages: [] }), NexusApiError);
    assert.equal(calls.length, 3, "initial attempt plus two retries");
});

test("a browser-level failure is reported as a network error that mentions CORS", async () => {
    const { impl } = stubFetch(() => {
        throw new TypeError("Failed to fetch");
    });

    const client = createOpenAIClient({
        getApiKey: () => "k",
        getBaseUrl: () => "https://coarena.ai/api/v1",
        maxRetries: 0,
        fetchImpl: impl
    });

    await assert.rejects(
        () => client.generate({ messages: [] }),
        (err) => {
            assert.equal(err.code, "network_error");
            assert.match(err.message, /coarena\.ai/);
            assert.match(err.message, /CORS/);
            return true;
        }
    );
});

test("an aborted request is reported as a timeout, not a network fault", async () => {
    const client = createOpenAIClient({
        getApiKey: () => "k",
        getModel: () => "gemini-3-8-flash",
        timeoutMs: 5,
        maxRetries: 0,
        fetchImpl: (_url, init) =>
            new Promise((_resolve, reject) => {
                init.signal.addEventListener("abort", () => {
                    const err = new Error("aborted");
                    err.name = "AbortError";
                    reject(err);
                });
            })
    });

    await assert.rejects(
        () => client.generate({ messages: [] }),
        (err) => {
            assert.equal(err.code, "timeout");
            assert.match(err.message, /منقضی شد/);
            return true;
        }
    );
});

test("listModels returns the gateway catalogue and tolerates an odd shape", async () => {
    const { calls, impl } = stubFetch(() => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ object: "list", data: [{ id: "gemini-3-8-flash", display_name: "Gemini 3.8 Flash" }] })
    }));

    const client = createOpenAIClient({
        getApiKey: () => "coa_k",
        getBaseUrl: () => "https://coarena.ai/api/v1",
        fetchImpl: impl
    });
    const models = await client.listModels();

    assert.equal(models.length, 1);
    assert.equal(models[0].id, "gemini-3-8-flash");
    assert.equal(calls[0].url, "https://coarena.ai/api/v1/models");
    assert.equal(calls[0].init.method, "GET");

    const empty = stubFetch(() => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) }));
    const client2 = createOpenAIClient({ getApiKey: () => "k", fetchImpl: empty.impl });
    assert.deepEqual(await client2.listModels(), []);
});

// --------------------------------------------------------------- error mapping
test("parseOpenAIError reads the OpenAI error envelope", () => {
    assert.deepEqual(
        parseOpenAIError('{"error":{"message":"Bad model","code":"model_not_found","type":"invalid_request_error"}}'),
        {
            message: "Bad model",
            code: "model_not_found",
            type: "invalid_request_error"
        }
    );
    // A gateway that answers with HTML must not crash the parser.
    assert.deepEqual(parseOpenAIError("<html>502</html>"), { message: "<html>502</html>", code: null, type: null });
    assert.deepEqual(parseOpenAIError(""), { message: "", code: null, type: null });
});

test("every documented Coarena code has Persian advice", () => {
    const codes = Object.keys(COARENA_ADVICE);
    assert.ok(codes.length >= 15, "the mapping should cover the documented error codes");
    for (const code of codes) {
        assert.ok(COARENA_ADVICE[code].length > 5, `${code} needs a real sentence`);
        assert.match(COARENA_ADVICE[code], /[\u0600-\u06FF]/, `${code} advice must be Persian`);
    }
    assert.ok("model_api_terms_required" in COARENA_ADVICE);
    assert.ok("insufficient_quota" in COARENA_ADVICE);
    assert.ok("model_not_found" in COARENA_ADVICE);
});

test("networkErrorMessage names the origin and points at the proxy docs", () => {
    const message = networkErrorMessage(new TypeError("Failed to fetch"), "https://coarena.ai/api/v1/chat/completions");
    assert.match(message, /https:\/\/coarena\.ai/);
    assert.match(message, /Failed to fetch/);
    assert.match(message, /DEPLOYMENT\.md/);
    assert.ok(!message.includes("/chat/completions"), "only the origin is shown, not the whole endpoint");
});
