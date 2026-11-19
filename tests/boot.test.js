/**
 * Boot smoke test — runs the real `src/index.html` + `src/js/main.js` inside
 * jsdom and drives the UI the way a person would.
 *
 * This is the check that a pure-unit suite cannot make: it proves the `els` map
 * matches the markup, that the boot order works, that the action bus is wired, and
 * that a module can go from a form submit to rendered output.
 *
 * The DOM globals must exist *before* any app module is imported, because
 * `core/dom.js` resolves its element map at module scope — hence the dynamic
 * `await import(...)` below.
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
const dom = new JSDOM(html, { url: "http://localhost/", pretendToBeVisual: true });

const windowGlobals = [
    "window",
    "document",
    "localStorage",
    "sessionStorage",
    "HTMLElement",
    "HTMLInputElement",
    "Node",
    "NodeList",
    "Event",
    "CustomEvent",
    "KeyboardEvent",
    "MouseEvent",
    "DragEvent",
    "FileReader",
    "Blob",
    "File",
    "FormData",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "matchMedia",
    "navigator",
    "location",
    "history"
];

for (const name of windowGlobals) {
    if (dom.window[name] === undefined) continue;
    Object.defineProperty(globalThis, name, {
        value: dom.window[name],
        configurable: true,
        writable: true
    });
}

// Capture interval handles created during boot so the test process can exit.
const intervals = [];
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (...args) => {
    const handle = realSetInterval(...args);
    intervals.push(handle);
    return handle;
};

const { boot } = await import("../src/js/main.js");
const { els } = await import("../src/js/core/dom.js");
const { state } = await import("../src/js/core/state.js");
const { invokeAction } = await import("../src/js/core/bus.js");

/** @returns {string} the on-page error banner text (empty when hidden). */
const bannerText = () => (els.globalError.classList.contains("hidden") ? "" : els.globalErrorText.textContent.trim());

/** Polls until `predicate()` is true, or fails with `message`. */
async function waitFor(predicate, message, timeoutMs = 2000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out waiting for: ${message} (banner: "${bannerText()}")`);
}

/** Installs a canned Gemini response. */
function stubFetch(response) {
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push({ url, init });
        return {
            ok: true,
            status: 200,
            json: async () => response,
            text: async () => JSON.stringify(response)
        };
    };
    return calls;
}

const click = (el) => el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
const submit = (el) => el.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));

after(() => {
    for (const handle of intervals) clearInterval(handle);
    globalThis.setInterval = realSetInterval;
});

// --------------------------------------------------------------------- boot
test("boot completes and marks the document ready", () => {
    assert.equal(typeof boot, "function");
    assert.equal(document.documentElement.dataset.nexusReady, "true", `banner: "${bannerText()}"`);
    assert.equal(bannerText(), "", "boot must not raise an error banner");
});

test("every element in the els map resolved against the real markup", () => {
    const unresolved = Object.entries(els)
        .filter(([, value]) => value === null || value === undefined)
        .filter(([key]) => !["navTabs", "panels", "presetBtns"].includes(key))
        .map(([key]) => key);
    assert.deepEqual(unresolved, [], `unresolved element references: ${unresolved.join(", ")}`);

    assert.equal(els.navTabs.length, 4, "the sidebar must expose four module tabs");
    assert.equal(els.panels.length, 4, "there must be four module panels");
    assert.equal(els.presetBtns.length, 4, "Module 01 ships four presets");
});

test("the header clock is running and shows a UTC timestamp", () => {
    assert.match(els.utcClock.textContent, /^\d{2}:\d{2}:\d{2} UTC$/);
    assert.ok(intervals.length >= 1, "the clock must register an interval");
});

// --------------------------------------------------------- first-run dialog
test("first run without a key opens the settings dialog and flags the chip", () => {
    assert.ok(!els.apiKeyModal.classList.contains("hidden"), "dialog should be open on first run");
    assert.equal(els.apiKeyStatusChip.textContent, "MISSING");
    assert.ok(els.engineModelLabel.textContent.length > 0, "engine label must be populated");
    assert.match(els.apiKeyModalHint.textContent, /localStorage/);
});

test("saving a key through the dialog persists it and updates the chip", () => {
    els.apiKeyInput.value = "AIza-boot-test-key";
    els.apiKeyModelInput.value = "gemini-boot-model";
    click(els.apiKeySaveBtn);

    assert.ok(els.apiKeyModal.classList.contains("hidden"), "dialog should close after save");
    assert.equal(els.apiKeyStatusChip.textContent, "SET");
    assert.equal(els.engineModelLabel.textContent, "GEMINI BOOT MODEL");

    const stored = JSON.parse(localStorage.getItem("nexus_settings_v1"));
    assert.equal(stored.apiKey, "AIza-boot-test-key");
    assert.equal(stored.model, "gemini-boot-model");
});

// ---------------------------------------------------------------- navigation
test("clicking a tab swaps panels and moves the active styling", () => {
    const matrixTab = [...els.navTabs].find((btn) => btn.dataset.tab === "matrix");
    click(matrixTab);

    assert.equal(state.activeTab, "matrix");
    assert.ok(!document.getElementById("panel-matrix").classList.contains("hidden"));
    assert.ok(document.getElementById("panel-briefing").classList.contains("hidden"));
    assert.match(matrixTab.className, /bg-cyan-500\/10/);

    const briefingTab = [...els.navTabs].find((btn) => btn.dataset.tab === "briefing");
    click(briefingTab);
    assert.equal(state.activeTab, "briefing");
});

test("the theme toggle flips the dark class and persists the choice", () => {
    assert.ok(document.documentElement.classList.contains("dark"));
    click(els.themeToggleBtn);
    assert.ok(!document.documentElement.classList.contains("dark"));
    assert.equal(localStorage.getItem("nexus_theme"), "light");
    click(els.themeToggleBtn);
    assert.equal(localStorage.getItem("nexus_theme"), "dark");
});

test("the mobile drawer opens and closes", () => {
    click(els.mobileMenuBtn);
    assert.ok(!els.sidebar.classList.contains("-translate-x-full"));
    assert.ok(!els.sidebarBackdrop.classList.contains("hidden"));
    click(els.sidebarBackdrop);
    assert.ok(els.sidebar.classList.contains("-translate-x-full"));
});

// ------------------------------------------------------- module interactions
test("Module 02 sample loader fills the textarea and the character counter", () => {
    click(els.loadSampleTextBtn);
    assert.match(els.matrixInput.value, /FIELD REPORT/);
    assert.equal(els.matrixCharCount.textContent, `${els.matrixInput.value.length} characters`);
});

test("Module 04 clears its transcript and history", () => {
    state.chatHistory.push({ role: "user", parts: [{ text: "stale" }] });
    click(els.clearChatBtn);
    assert.deepEqual(state.chatHistory, []);
    assert.match(els.chatMessages.textContent, /Session Reset/);
});

test("Module 03 rejects a non-image upload with a toast, not an exception", async () => {
    const { handleImageFile } = await import("../src/js/modules/visual.js");

    handleImageFile({ name: "report.pdf", type: "application/pdf", size: 2048 });
    await waitFor(() => els.toastContainer.textContent.includes("PNG, JPG, or WEBP"), "the format toast");
    assert.equal(state.visualImage, null, "an invalid file must not be staged");

    handleImageFile({ name: "huge.png", type: "image/png", size: 11 * 1024 * 1024 });
    await waitFor(() => els.toastContainer.textContent.includes("smaller than"), "the size toast");
    assert.equal(state.visualImage, null, "an oversized file must not be staged");
});

test("the apikey:prompt bus action opens and closes the dialog", () => {
    invokeAction("apikey:prompt");
    assert.ok(!els.apiKeyModal.classList.contains("hidden"));
    assert.match(els.apiKeyModalHint.textContent, /needs credentials/);
    click(els.apiKeyCancelBtn);
    assert.ok(els.apiKeyModal.classList.contains("hidden"));
});

// ------------------------------------------------- end-to-end through the API
test("Module 04 renders a grounded answer with citations from a stubbed API", async () => {
    const calls = stubFetch({
        candidates: [
            {
                finishReason: "STOP",
                content: {
                    parts: [{ text: "Confirmed: **three** new interconnectors.\n\nEstimate: capacity rises." }]
                },
                groundingMetadata: {
                    groundingAttributions: [{ web: { uri: "https://example.com/grid", title: "Grid Report 2026" } }]
                }
            }
        ]
    });

    els.chatInput.value = "What changed in Nordic grid capacity?";
    submit(els.chatForm);

    await waitFor(
        () => els.chatMessages.querySelectorAll("a[target='_blank']").length > 0,
        "a model bubble with a citation link"
    );

    const transcript = els.chatMessages.innerHTML;
    assert.match(transcript, /<strong[^>]*>three<\/strong>/, "markdown should be rendered");
    assert.match(transcript, /Grid Report 2026/, "the citation title should appear");
    assert.ok(transcript.includes('href="https://example.com/grid"'), "the citation should link to its source");
    assert.equal(state.chatHistory.length, 2, "user + model turns are recorded");

    const [call] = calls;
    assert.equal(call.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-boot-model:generateContent");
    assert.equal(call.init.headers["x-goog-api-key"], "AIza-boot-test-key");
    assert.ok(!call.url.includes("key="), "the key must never appear in the URL");

    const body = JSON.parse(call.init.body);
    assert.equal(body.contents.length, 1, "only the new user turn is sent after a session reset");
    assert.ok(Array.isArray(body.tools), "grounding is on by default");
});

test("Module 01 renders a briefing and archives it as a dossier", async () => {
    stubFetch({
        candidates: [
            {
                finishReason: "STOP",
                content: {
                    parts: [
                        {
                            text: "## Executive Summary\n\n- **Supply** tightened.\n- Prices rose 14%.\n\n## Recommended Next Actions\n\n1. Dual-source."
                        }
                    ]
                },
                groundingMetadata: {
                    groundingAttributions: [{ web: { uri: "https://example.com/chips", title: "Chip Watch" } }]
                }
            }
        ]
    });

    els.briefingTopic.value = "Semiconductor supply chain";
    els.briefingFocus.value = "Market & Competitive";
    submit(els.briefingForm);

    await waitFor(() => !els.briefingOutput.classList.contains("hidden"), "the briefing output to appear");

    assert.equal(els.briefingResultTitle.textContent, "Semiconductor supply chain");
    assert.equal(els.briefingBadgeFocus.textContent, "MARKET & COMPETITIVE");
    assert.match(els.briefingContent.innerHTML, /<h3[^>]*>Executive Summary<\/h3>/);
    assert.match(els.briefingContent.innerHTML, /list-decimal/, "numbered actions become a list");
    assert.match(els.briefingTimestamp.textContent, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
    assert.ok(!els.briefingSourcesCard.classList.contains("hidden"));
    assert.equal(els.sourcesCountBadge.textContent, "1 VERIFIED");
    assert.ok(els.briefingSourcesGrid.innerHTML.includes("Chip Watch"));

    // Archive it
    click(els.saveDossierBtn);
    assert.equal(state.dossiers.length, 1);
    assert.equal(els.dossierCount.textContent, "1");
    assert.match(els.dossierList.textContent, /Semiconductor supply chain/);
    assert.equal(JSON.parse(localStorage.getItem("nexus_intel_dossiers_v1")).length, 1);

    // Hand the same briefing to Module 02 through the bus
    click(els.sendToMatrixBtn);
    assert.equal(state.activeTab, "matrix");
    assert.match(els.matrixInput.value, /^TOPIC: Semiconductor supply chain/);

    // The hand-off auto-submits Module 02. A Markdown briefing is not valid JSON,
    // so the guarded parse must fail cleanly instead of throwing.
    await waitFor(() => bannerText().length > 0, "the matrix module to report invalid JSON");
    assert.match(bannerText(), /valid JSON/);
    click(els.dismissErrorBtn);
    assert.equal(bannerText(), "");
    assert.ok(els.matrixLoader.classList.contains("hidden"), "the loader must be hidden after a failure");
});

test("a failed request surfaces in the banner and rolls the chat turn back", async () => {
    globalThis.fetch = async () => ({
        ok: false,
        status: 400,
        json: async () => ({}),
        text: async () => '{"error":{"message":"API key not valid"}}'
    });

    const before = state.chatHistory.length;
    els.chatInput.value = "Anything new on export controls?";
    submit(els.chatForm);

    await waitFor(() => bannerText().length > 0, "the error banner to appear");
    assert.match(bannerText(), /status 400/);
    assert.equal(state.chatHistory.length, before, "the failed turn must be rolled back");

    click(els.dismissErrorBtn);
    assert.equal(bannerText(), "");
});
