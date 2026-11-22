/**
 * Provider layer tests — routing, credential resolution and the connection test.
 *
 * Runs in plain Node with a hand-rolled `localStorage`, because the layer under
 * test must not depend on a browser.
 */
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

/** Minimal localStorage stand-in. */
const store = new Map();
globalThis.localStorage = {
    getItem: (key) => (store.has(String(key)) ? store.get(String(key)) : null),
    setItem: (key, value) => store.set(String(key), String(value)),
    removeItem: (key) => store.delete(String(key)),
    clear: () => store.clear()
};

const { config } = await import("../src/js/config.js");
const { saveSettings } = await import("../src/js/services/settings.js");
const provider = await import("../src/js/services/provider.js");

/**
 * Installs a fetch stub that answers by URL, recording every call.
 *
 * @param {(url: string, init: object) => object} responder
 */
function stubFetch(responder) {
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
        return responder(url, init);
    };
    return calls;
}

const json = (body, extra = {}) => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
    ...extra
});

const catalogue = json({
    object: "list",
    data: [
        { id: "gemini-3-8-flash", display_name: "Gemini 3.8 Flash" },
        { id: "gpt-6-luna", display_name: "GPT-6 Luna" }
    ]
});

const chatOk = (content = "pong", model = "gemini-3-8-flash") =>
    json({ model, choices: [{ finish_reason: "stop", message: { content } }] });

beforeEach(() => {
    store.clear();
    provider.resetModelClient();
});

// -------------------------------------------------------------------- routing
test("Coarena is the default gateway and speaks OpenAI Chat Completions", async () => {
    saveSettings({ apiKey: "coa_default-key" });
    const calls = stubFetch((url) => (url.endsWith("/models") ? catalogue : chatOk("سلام")));

    const result = await provider.runRequest({ messages: [{ role: "user", text: "ping" }] });

    assert.equal(provider.getModelClient().transport, "openai");
    assert.equal(calls[0].url, "https://coarena.ai/api/v1/chat/completions");
    assert.equal(calls[0].init.headers.Authorization, "Bearer coa_default-key");
    assert.equal(calls[0].body.model, "gemini-3-8-flash");
    assert.equal(result.text, "سلام");
    assert.equal(result.model, "gemini-3-8-flash");
});

test("switching the stored provider rebuilds the client on the Gemini transport", async () => {
    saveSettings({ apiKey: "AIza-google-key", provider: "google" });
    const calls = stubFetch(() =>
        json({
            modelVersion: "gemini-3-flash-preview",
            candidates: [{ finishReason: "STOP", content: { parts: [{ text: "direct" }] } }]
        })
    );

    const result = await provider.runRequest({ messages: [{ role: "user", text: "ping" }] });

    assert.equal(provider.getModelClient().transport, "gemini");
    assert.equal(
        calls[0].url,
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent"
    );
    assert.equal(calls[0].init.headers["x-goog-api-key"], "AIza-google-key");
    assert.equal(result.text, "direct");
});

test("an unknown stored provider falls back to the default gateway", () => {
    saveSettings({ apiKey: "coa_x", provider: "openrouter-ish" });
    assert.equal(provider.getProvider(), config.api.provider);
    assert.equal(provider.getProviderDefinition().transport, "openai");
});

test("the client is cached per provider and picks up new credentials without a rebuild", async () => {
    saveSettings({ apiKey: "coa_first", model: "gemini-3-8-flash" });
    stubFetch(() => chatOk());

    const before = provider.getModelClient();
    await provider.runRequest({ messages: [{ role: "user", text: "a" }] });

    // A new key and model must apply immediately — no reset, no reload.
    saveSettings({ apiKey: "coa_second", model: "gpt-6-luna" });
    const after = provider.getModelClient();
    assert.equal(before, after, "the same provider keeps the same client instance");

    const calls = stubFetch(() => chatOk());
    await provider.runRequest({ messages: [{ role: "user", text: "b" }] });
    assert.equal(calls[0].init.headers.Authorization, "Bearer coa_second");
    assert.equal(calls[0].body.model, "gpt-6-luna");
});

test("a custom base URL is used verbatim, so another gateway needs no code change", async () => {
    saveSettings({ apiKey: "sk-local", baseUrl: "http://127.0.0.1:8080/v1/", model: "qwen-local" });
    const calls = stubFetch(() => chatOk("local answer", "qwen-local"));

    const result = await provider.runRequest({ messages: [{ role: "user", text: "ping" }] });

    assert.equal(calls[0].url, "http://127.0.0.1:8080/v1/chat/completions");
    assert.equal(result.text, "local answer");
});

test("a stored base URL that is not absolute is ignored", () => {
    saveSettings({ apiKey: "coa_x", baseUrl: "javascript:alert(1)" });
    assert.equal(provider.getBaseUrl(), config.api.baseUrl);
});

// -------------------------------------------------------------------- payloads
test("a grounding request is flagged as unavailable on the Coarena transport", async () => {
    saveSettings({ apiKey: "coa_x" });
    stubFetch(() => chatOk("بدون منبع"));

    const result = await provider.runRequest({ messages: [{ role: "user", text: "news?" }], grounding: true });

    assert.equal(result.groundingUnavailable, true);
    assert.deepEqual(result.sources, []);
    assert.equal(result.groundingApplied, false);
});

test("the same request yields real citations on the Google transport", async () => {
    saveSettings({ apiKey: "AIza_x", provider: "google" });
    stubFetch(() =>
        json({
            candidates: [
                {
                    finishReason: "STOP",
                    content: { parts: [{ text: "با منبع" }] },
                    groundingMetadata: {
                        groundingAttributions: [{ web: { uri: "https://example.com/a", title: "A" } }]
                    }
                }
            ]
        })
    );

    const result = await provider.runRequest({ messages: [{ role: "user", text: "news?" }], grounding: true });

    assert.equal(result.groundingApplied, true);
    assert.ok(!result.groundingUnavailable);
    assert.deepEqual(result.sources, [{ uri: "https://example.com/a", title: "A" }]);
});

test("a structured request is mapped to the schema form of each protocol", async () => {
    const schema = { type: "object", properties: { headline: { type: "string" } }, required: ["headline"] };

    saveSettings({ apiKey: "coa_x" });
    let calls = stubFetch(() => chatOk('{"headline":"x"}'));
    await provider.runRequest({ messages: [{ role: "user", text: "extract" }], jsonSchema: schema });
    assert.equal(calls[0].body.response_format.type, "json_schema");
    // Strict mode closes objects; the rest of the schema passes through.
    assert.deepEqual(calls[0].body.response_format.json_schema.schema, {
        ...schema,
        additionalProperties: false
    });

    provider.resetModelClient();
    saveSettings({ provider: "google" });
    calls = stubFetch(() => json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "{}" }] } }] }));
    await provider.runRequest({ messages: [{ role: "user", text: "extract" }], jsonSchema: schema });
    assert.equal(calls[0].body.generationConfig.responseMimeType, "application/json");
    assert.deepEqual(calls[0].body.generationConfig.responseSchema, schema);
});

test("an image travels inline as base64 on both transports", async () => {
    const images = [{ mimeType: "image/jpeg", data: "zz9" }];

    saveSettings({ apiKey: "coa_x" });
    let calls = stubFetch(() => chatOk("دیدم"));
    await provider.runRequest({ messages: [{ role: "user", text: "what is this" }], images });
    assert.deepEqual(calls[0].body.messages[0].content[1], {
        type: "image_url",
        image_url: { url: "data:image/jpeg;base64,zz9" }
    });

    provider.resetModelClient();
    saveSettings({ provider: "google" });
    calls = stubFetch(() => json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "دیدم" }] } }] }));
    await provider.runRequest({ messages: [{ role: "user", text: "what is this" }], images });
    assert.deepEqual(calls[0].body.contents[0].parts[1], { inlineData: { mimeType: "image/jpeg", data: "zz9" } });
});

// --------------------------------------------------------------------- labels
test("the status label names the gateway and the model", () => {
    saveSettings({ apiKey: "coa_x" });
    assert.equal(provider.getModelLabel(), "Coarena · gemini-3-8-flash");

    saveSettings({ provider: "google" });
    assert.equal(provider.getModelLabel(), "Google AI Studio · gemini-3-flash-preview");
});

test("getAnsweringModel prefers what the gateway reported", () => {
    saveSettings({ apiKey: "coa_x" });
    assert.equal(provider.getAnsweringModel({ model: "deepseek-v4-1-flash-1017" }), "deepseek-v4-1-flash-1017");
    assert.equal(provider.getAnsweringModel({}), "gemini-3-8-flash");
});

test("matchModelAlias corrects punctuation and vendor prefixes only", () => {
    const models = [
        { id: "gemini-3-8-flash", label: "Gemini 3.8 Flash" },
        { id: "google/gemini-3-8-flash", label: "Gemini 3.8 Flash" },
        { id: "gpt-6-luna", label: "GPT-6 Luna" }
    ];

    assert.equal(provider.matchModelAlias(models, "gemini-3.8-flash"), "gemini-3-8-flash");
    assert.equal(provider.matchModelAlias(models, "gpt-6-luna"), null, "an exact match needs no correction");
    assert.equal(provider.matchModelAlias(models, "claude-opus-4"), null, "an unrelated id is not guessed at");
    assert.equal(provider.matchModelAlias([], "gemini-3.8-flash"), null);
    assert.equal(provider.matchModelAlias(models, ""), null);
});

// ----------------------------------------------------------- connection test
test("a healthy connection reports the answering model, latency and catalogue", async () => {
    saveSettings({ apiKey: "coa_healthy", baseUrl: "https://coarena.ai/api/v1", model: "gemini-3-8-flash" });
    const calls = stubFetch((url) => (url.endsWith("/models") ? catalogue : chatOk("pong", "gemini-3-8-flash")));

    const result = await provider.testConnection();

    assert.equal(result.ok, true);
    assert.equal(result.model, "gemini-3-8-flash");
    assert.match(result.message, /اتصال برقرار است/);
    assert.ok(result.latencyMs >= 0);
    assert.deepEqual(
        result.models.map((entry) => entry.id),
        ["gemini-3-8-flash", "gpt-6-luna"]
    );
    assert.equal(calls.length, 2, "the catalogue is public, so the key is only spent once");
    assert.equal(JSON.parse(calls[1].init.body).max_tokens, 1, "the probe is one token");
});

test("the test probes the values passed in, not the ones already stored", async () => {
    saveSettings({ apiKey: "coa_stored", model: "gemini-3-8-flash" });
    const calls = stubFetch((url) => (url.endsWith("/models") ? catalogue : chatOk()));

    await provider.testConnection({ apiKey: "coa_typed-in-the-form", model: "gpt-6-luna" });

    assert.equal(calls[1].init.headers.Authorization, "Bearer coa_typed-in-the-form");
    assert.equal(JSON.parse(calls[1].init.body).model, "gpt-6-luna");
    assert.equal(provider.getApiKey(), "coa_stored", "testing must not persist anything");
});

test("cost routing is reported when the gateway answers with another model", async () => {
    saveSettings({ apiKey: "coa_x" });
    stubFetch((url) => (url.endsWith("/models") ? catalogue : chatOk("pong", "deepseek-v4-1-flash-1017")));

    const result = await provider.testConnection();

    assert.equal(result.ok, true);
    assert.equal(result.model, "deepseek-v4-1-flash-1017");
    assert.match(result.message, /مسیریابی هزینه/);
});

test("a missing key is reported without calling the gateway", async () => {
    store.clear();
    const calls = stubFetch((url) => (url.endsWith("/models") ? catalogue : chatOk()));

    const result = await provider.testConnection();

    assert.equal(result.ok, false);
    assert.match(result.message, /کلید API خالی است/);
    assert.equal(calls.length, 1, "only the public catalogue was fetched");
});

test("a mistyped model id yields the corrected one", async () => {
    saveSettings({ apiKey: "coa_x", model: "gemini-3.8-flash" });
    stubFetch((url) => (url.endsWith("/models") ? catalogue : chatOk()));

    const result = await provider.testConnection();

    assert.equal(result.ok, false);
    assert.equal(result.suggestedModel, "gemini-3-8-flash");
    assert.match(result.message, /شکل درست آن «gemini-3-8-flash»/);
});

test("an unknown model id says how many models the gateway offers", async () => {
    saveSettings({ apiKey: "coa_x", model: "nexus-imaginary-9" });
    stubFetch((url) => (url.endsWith("/models") ? catalogue : chatOk()));

    const result = await provider.testConnection();

    assert.equal(result.ok, false);
    assert.match(result.message, /در فهرست این درگاه نیست/);
    assert.match(result.message, /۲ مدل/);
    assert.ok(!result.suggestedModel);
});

test("terms that were never accepted are explained, not shown as raw JSON", async () => {
    saveSettings({ apiKey: "coa_x" });
    stubFetch((url) =>
        url.endsWith("/models")
            ? catalogue
            : {
                  ok: false,
                  status: 403,
                  headers: { get: () => null },
                  text: async () => '{"error":{"message":"Terms required","code":"model_api_terms_required"}}',
                  json: async () => ({})
              }
    );

    const result = await provider.testConnection();

    assert.equal(result.ok, false);
    assert.match(result.message, /شرایط Model API را در حساب Coarena بپذیرید/);
});

test("an expired key is reported as such", async () => {
    saveSettings({ apiKey: "coa_expired" });
    stubFetch((url) =>
        url.endsWith("/models")
            ? catalogue
            : {
                  ok: false,
                  status: 401,
                  headers: { get: () => null },
                  text: async () => '{"error":{"message":"Key expired","code":"api_key_expired"}}',
                  json: async () => ({})
              }
    );

    const result = await provider.testConnection();

    assert.equal(result.ok, false);
    assert.match(result.message, /کلید منقضی شده است/);
});

test("a spent daily quota is not retried into the ground", async () => {
    saveSettings({ apiKey: "coa_x" });
    const calls = stubFetch((url) =>
        url.endsWith("/models")
            ? catalogue
            : {
                  ok: false,
                  status: 429,
                  headers: { get: (name) => (name === "x-should-retry" ? "false" : null) },
                  text: async () => '{"error":{"message":"Daily limit","code":"insufficient_quota"}}',
                  json: async () => ({})
              }
    );

    const result = await provider.testConnection();

    assert.equal(result.ok, false);
    assert.match(result.message, /سهمیهٔ رایگان امروز تمام شده است/);
    assert.equal(calls.length, 2, "one catalogue call plus one probe — no retries");
});

test("an unreachable gateway stops the test before spending a call", async () => {
    saveSettings({ apiKey: "coa_x" });
    const calls = stubFetch(() => {
        throw new TypeError("Failed to fetch");
    });

    const result = await provider.testConnection();

    assert.equal(result.ok, false);
    assert.match(result.message, /CORS/);
    assert.equal(calls.length, 1);
});

test("a gateway that gates its model list still tests the key", async () => {
    saveSettings({ apiKey: "coa_x", model: "some-model" });
    const calls = stubFetch((url) =>
        url.endsWith("/models")
            ? { ok: false, status: 401, headers: { get: () => null }, text: async () => "nope", json: async () => ({}) }
            : chatOk("pong", "some-model")
    );

    const result = await provider.testConnection();

    assert.equal(result.ok, true, "an unavailable catalogue must not fail the test");
    assert.deepEqual(result.models, []);
    assert.equal(calls.length, 2);
});

test("listModels degrades to an empty list instead of throwing", async () => {
    saveSettings({ apiKey: "coa_x" });
    stubFetch(() => {
        throw new TypeError("Failed to fetch");
    });

    assert.deepEqual(await provider.listModels(), []);
});
