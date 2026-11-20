import test from "node:test";
import assert from "node:assert/strict";

import { invokeAction, registerAction, tryInvokeAction } from "../src/js/core/bus.js";
import { deepMerge, DEFAULT_CONFIG, config } from "../src/js/config.js";

// ------------------------------------------------------------------ action bus
test("registerAction + invokeAction pass arguments through and return the result", () => {
    registerAction("test:sum", (a, b) => a + b);
    assert.equal(invokeAction("test:sum", 2, 3), 5);
});

test("invoking an unknown action fails loudly", () => {
    assert.throws(() => invokeAction("test:missing"), /Unknown NEXUS action: test:missing/);
});

test("tryInvokeAction is silent when nothing is registered", () => {
    assert.equal(tryInvokeAction("test:never-registered"), undefined);
    registerAction("test:present", () => "here");
    assert.equal(tryInvokeAction("test:present"), "here");
});

// ------------------------------------------------------------------- deepMerge
test("deepMerge merges nested objects instead of replacing them", () => {
    const merged = deepMerge(
        { api: { baseUrl: "a", maxRetries: 4 }, ui: { toastDurationMs: 3200 } },
        { api: { maxRetries: 1 } }
    );
    assert.deepEqual(merged, { api: { baseUrl: "a", maxRetries: 1 }, ui: { toastDurationMs: 3200 } });
});

test("deepMerge replaces arrays wholesale", () => {
    const merged = deepMerge(
        { limits: { imageMimeTypes: ["image/png", "image/jpeg"] } },
        { limits: { imageMimeTypes: ["image/webp"] } }
    );
    assert.deepEqual(merged.limits.imageMimeTypes, ["image/webp"]);
});

test("deepMerge ignores undefined and non-object sources", () => {
    const base = { api: { textModel: "gemini" } };
    assert.deepEqual(deepMerge({ ...base }, { api: { textModel: undefined } }), base);
    assert.deepEqual(deepMerge({ ...base }, undefined), base);
    assert.deepEqual(deepMerge({ ...base }, "nope"), base);
});

test("deepMerge does not mutate the source override object", () => {
    const overrides = { api: { maxRetries: 0 } };
    deepMerge(structuredClone(DEFAULT_CONFIG), overrides);
    assert.deepEqual(overrides, { api: { maxRetries: 0 } });
});

// ---------------------------------------------------------------------- config
test("the effective config exposes every section the modules rely on", () => {
    // Coarena is the default gateway; Google stays available as an alternative.
    assert.equal(config.api.provider, "coarena");
    assert.equal(config.api.baseUrl, "https://coarena.ai/api/v1");
    assert.equal(config.api.textModel, "gemini-3-8-flash");
    assert.ok(config.api.modelSuggestions.includes(config.api.textModel));
    assert.ok(config.api.google.baseUrl.startsWith("https://generativelanguage.googleapis.com/"));
    assert.ok(config.api.google.textModel.length > 0);
    assert.equal(config.storage.dossiers, "nexus_intel_dossiers_v1");
    assert.equal(config.storage.theme, "nexus_theme");
    assert.equal(config.limits.imageMaxBytes, 8 * 1024 * 1024);
    assert.deepEqual(config.limits.imageMimeTypes, ["image/png", "image/jpeg", "image/webp"]);
    assert.ok(config.limits.chatHistoryMaxMessages > 0);
});

test("DEFAULT_CONFIG is frozen so nothing can rewrite the documented defaults", () => {
    assert.ok(Object.isFrozen(DEFAULT_CONFIG));
});
