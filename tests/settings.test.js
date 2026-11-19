import test from "node:test";
import assert from "node:assert/strict";

import {
    clearApiKey,
    getApiKey,
    getInjectedApiKey,
    getModel,
    hasApiKey,
    isKeyInjected,
    maskKey,
    saveSettings
} from "../src/js/services/settings.js";
import { config } from "../src/js/config.js";

/**
 * Minimal in-memory localStorage/window stub. The module under test touches the
 * real globals lazily (inside functions), so installing them per test is safe.
 */
function withBrowser({ windowValue = undefined, initialStorage = {} } = {}) {
    const store = new Map(Object.entries(initialStorage));
    const previous = {
        localStorage: globalThis.localStorage,
        window: globalThis.window,
        hadLocalStorage: Object.hasOwn(globalThis, "localStorage"),
        hadWindow: Object.hasOwn(globalThis, "window")
    };

    globalThis.localStorage = {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
        clear: () => store.clear()
    };
    if (windowValue === undefined) delete globalThis.window;
    else globalThis.window = windowValue;

    return {
        store,
        restore() {
            if (previous.hadLocalStorage) globalThis.localStorage = previous.localStorage;
            else delete globalThis.localStorage;
            if (previous.hadWindow) globalThis.window = previous.window;
            else delete globalThis.window;
        }
    };
}

test("maskKey redacts the middle of a key and never reveals it fully", () => {
    assert.equal(maskKey("AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxx9Qk"), "AIza••••••x9Qk");
    assert.equal(maskKey(""), "");
    assert.equal(maskKey(undefined), "");
    assert.equal(maskKey("short"), "•••••", "short values are masked entirely");
});

test("maskKey keeps only the first four and last four characters", () => {
    const masked = maskKey("AIzaSyD1234567890abcdefghijkl9Qk");
    assert.ok(masked.startsWith("AIza"));
    assert.ok(masked.endsWith("9Qk"));
    assert.ok(!masked.includes("SyD1234"));
});

test("settings persist to localStorage under the configured key", () => {
    const browser = withBrowser();
    try {
        assert.equal(hasApiKey(), false);
        assert.equal(getApiKey(), "");

        saveSettings({ apiKey: "  AIza-stored  ", model: "gemini-test-model" });

        assert.equal(getApiKey(), "AIza-stored", "the key is trimmed on save");
        assert.equal(getModel(), "gemini-test-model");
        assert.equal(hasApiKey(), true);

        const raw = JSON.parse(browser.store.get(config.storage.settings));
        assert.deepEqual(raw, { apiKey: "AIza-stored", model: "gemini-test-model" });
    } finally {
        browser.restore();
    }
});

test("an empty model falls back to the configured default", () => {
    const browser = withBrowser();
    try {
        saveSettings({ model: "   " });
        assert.equal(getModel(), config.api.textModel);
    } finally {
        browser.restore();
    }
});

test("clearApiKey removes the stored key but keeps other settings", () => {
    const browser = withBrowser({ initialStorage: {} });
    try {
        saveSettings({ apiKey: "AIza-temp", model: "gemini-kept" });
        clearApiKey();
        assert.equal(getApiKey(), "");
        assert.equal(getModel(), "gemini-kept");
    } finally {
        browser.restore();
    }
});

test("a host-injected key always wins over the stored key", () => {
    const browser = withBrowser({
        windowValue: { NEXUS_CONFIG: { apiKey: "AIza-injected" } },
        initialStorage: { [config.storage.settings]: JSON.stringify({ apiKey: "AIza-stored" }) }
    });
    try {
        assert.equal(isKeyInjected(), true);
        assert.equal(getInjectedApiKey(), "AIza-injected");
        assert.equal(getApiKey(), "AIza-injected");
    } finally {
        browser.restore();
    }
});

test("window.NEXUS_API_KEY is also accepted as an injection point", () => {
    const browser = withBrowser({ windowValue: { NEXUS_API_KEY: "AIza-global" } });
    try {
        assert.equal(getApiKey(), "AIza-global");
        assert.equal(isKeyInjected(), true);
    } finally {
        browser.restore();
    }
});

test("corrupt or hostile localStorage content is ignored, not thrown", () => {
    const browser = withBrowser({ initialStorage: { [config.storage.settings]: "{not json" } });
    try {
        assert.equal(getApiKey(), "");
        assert.equal(getModel(), config.api.textModel);
    } finally {
        browser.restore();
    }

    const arrayStore = withBrowser({ initialStorage: { [config.storage.settings]: "[1,2,3]" } });
    try {
        assert.equal(getApiKey(), "");
    } finally {
        arrayStore.restore();
    }
});

test("a throwing localStorage (private mode) degrades to an empty key", () => {
    const previous = globalThis.localStorage;
    const had = Object.hasOwn(globalThis, "localStorage");
    globalThis.localStorage = {
        getItem() {
            throw new Error("denied");
        },
        setItem() {
            throw new Error("denied");
        }
    };
    try {
        assert.equal(getApiKey(), "");
        assert.doesNotThrow(() => saveSettings({ apiKey: "AIza-x" }));
        assert.equal(getModel(), config.api.textModel);
    } finally {
        if (had) globalThis.localStorage = previous;
        else delete globalThis.localStorage;
    }
});
