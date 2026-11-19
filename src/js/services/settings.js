/**
 * Persisted runtime settings: the Gemini API key and the model override.
 *
 * Resolution order for the key (highest priority first):
 *   1. `window.NEXUS_CONFIG.apiKey` / `window.NEXUS_API_KEY` — injected by the
 *      host page or a server-rendered template, never committed to git.
 *   2. `localStorage["nexus_settings_v1"].apiKey` — entered through the in-app
 *      Settings dialog by the person using the browser.
 *
 * SECURITY: NEXUS is a static, client-side app, so any key it uses is visible to
 * the browser that runs it. Never commit a key, never deploy a shared key to a
 * public origin, and restrict whichever key you use (see SECURITY.md).
 */
import { config } from "../config.js";

/**
 * @typedef {object} Settings
 * @property {string} [apiKey]
 * @property {string} [model]
 */

/**
 * @returns {Settings} the persisted settings object (never throws).
 */
function readStore() {
    try {
        const raw = localStorage.getItem(config.storage.settings);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

/**
 * @param {Settings} next
 */
function writeStore(next) {
    try {
        localStorage.setItem(config.storage.settings, JSON.stringify(next));
    } catch {
        // Private mode / sandboxed iframe: settings simply won't persist.
    }
}

/**
 * @returns {string} a key injected by the host page, or an empty string.
 */
export function getInjectedApiKey() {
    if (typeof window === "undefined") return "";
    const candidates = [window.NEXUS_CONFIG?.apiKey, window.NEXUS_API_KEY];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    return "";
}

/**
 * @returns {boolean} whether the key comes from the host page (and is therefore
 *   read-only in the UI).
 */
export function isKeyInjected() {
    return getInjectedApiKey().length > 0;
}

/**
 * @returns {string} the effective API key, or an empty string when unset.
 */
export function getApiKey() {
    const injected = getInjectedApiKey();
    if (injected) return injected;

    const stored = readStore().apiKey;
    return typeof stored === "string" ? stored.trim() : "";
}

/**
 * @returns {string} the effective model id.
 */
export function getModel() {
    const stored = readStore().model;
    return typeof stored === "string" && stored.trim() ? stored.trim() : config.api.textModel;
}

/**
 * @returns {boolean}
 */
export function hasApiKey() {
    return getApiKey().length > 0;
}

/**
 * Persists a new key and/or model. Empty strings clear the stored value.
 * @param {{ apiKey?: string, model?: string }} patch
 * @returns {Settings} the resulting settings.
 */
export function saveSettings(patch = {}) {
    const current = readStore();
    const next = { ...current };

    if (typeof patch.apiKey === "string") {
        const value = patch.apiKey.trim();
        if (value) next.apiKey = value;
        else delete next.apiKey;
    }
    if (typeof patch.model === "string") {
        const value = patch.model.trim();
        if (value) next.model = value;
        else delete next.model;
    }

    writeStore(next);
    return next;
}

/**
 * Removes the stored key (an injected key cannot be removed from here).
 */
export function clearApiKey() {
    const next = readStore();
    delete next.apiKey;
    writeStore(next);
}

/**
 * Redacts a key for display: `AIza…x9Qk`.
 * @param {string} key
 * @returns {string}
 */
export function maskKey(key) {
    const value = String(key || "").trim();
    if (!value) return "";
    if (value.length <= 8) return "•".repeat(value.length);
    return `${value.slice(0, 4)}${"•".repeat(6)}${value.slice(-4)}`;
}
