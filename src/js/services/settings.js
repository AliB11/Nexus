/**
 * Persisted runtime settings: which model gateway to use, its key, base URL and
 * model id.
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

/** Provider ids this build understands; anything else falls back to the default. */
export const KNOWN_PROVIDERS = ["coarena", "google"];

/**
 * @typedef {object} Settings
 * @property {string} [provider] `coarena` (default) or `google`.
 * @property {string} [apiKey]
 * @property {string} [baseUrl] Gateway base URL, e.g. `https://coarena.ai/api/v1`.
 * @property {string} [model]
 */

/**
 * Defaults for one provider, straight from `config.api`.
 *
 * @param {string} provider
 * @returns {{ baseUrl: string, model: string }}
 */
export function providerDefaults(provider = config.api.provider) {
    return provider === "google"
        ? { baseUrl: config.api.google.baseUrl, model: config.api.google.textModel }
        : { baseUrl: config.api.baseUrl, model: config.api.textModel };
}

/**
 * Keeps a base URL usable but never surprising: trims whitespace, requires an
 * http(s) scheme and drops trailing slashes.
 *
 * @param {string} url
 * @returns {string} the cleaned URL, or an empty string when unusable
 */
export function normalizeBaseUrl(url) {
    const candidate = String(url || "")
        .trim()
        .replace(/\/+$/, "");
    return /^https?:\/\/[^\s]+$/i.test(candidate) ? candidate : "";
}

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
 * @returns {string} the active provider id.
 */
export function getProvider() {
    const stored = readStore().provider;
    return KNOWN_PROVIDERS.includes(stored) ? stored : config.api.provider;
}

/**
 * @returns {string} the effective model id (falls back to the provider default).
 */
export function getModel() {
    const stored = readStore().model;
    return typeof stored === "string" && stored.trim() ? stored.trim() : providerDefaults(getProvider()).model;
}

/**
 * A stored base URL wins only when it is still a usable absolute URL, so a
 * half-typed value can never break every request.
 *
 * @returns {string} the effective gateway base URL.
 */
export function getBaseUrl() {
    const stored = normalizeBaseUrl(readStore().baseUrl);
    return stored || providerDefaults(getProvider()).baseUrl;
}

/**
 * @returns {boolean}
 */
export function hasApiKey() {
    return getApiKey().length > 0;
}

/**
 * Persists provider / key / base URL / model. Empty strings clear the stored
 * value, so the provider default takes over again.
 *
 * @param {{ provider?: string, apiKey?: string, baseUrl?: string, model?: string }} patch
 * @returns {Settings} the resulting settings.
 */
export function saveSettings(patch = {}) {
    const current = readStore();
    const next = { ...current };

    if (typeof patch.provider === "string") {
        const value = patch.provider.trim();
        if (KNOWN_PROVIDERS.includes(value)) next.provider = value;
        else delete next.provider;
    }
    if (typeof patch.apiKey === "string") {
        const value = patch.apiKey.trim();
        if (value) next.apiKey = value;
        else delete next.apiKey;
    }
    if (typeof patch.baseUrl === "string") {
        const value = normalizeBaseUrl(patch.baseUrl);
        if (value) next.baseUrl = value;
        else delete next.baseUrl;
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
 * The whole effective configuration, for the settings dialog and status bar.
 *
 * @returns {{ provider: string, apiKey: string, baseUrl: string, model: string, injected: boolean }}
 */
export function getEffectiveSettings() {
    return {
        provider: getProvider(),
        apiKey: getApiKey(),
        baseUrl: getBaseUrl(),
        model: getModel(),
        injected: isKeyInjected()
    };
}

/**
 * Redacts a key for display: `coa_…2a8e`.
 * @param {string} key
 * @returns {string}
 */
export function maskKey(key) {
    const value = String(key || "").trim();
    if (!value) return "";
    if (value.length <= 8) return "•".repeat(value.length);
    return `${value.slice(0, 4)}${"•".repeat(6)}${value.slice(-4)}`;
}
