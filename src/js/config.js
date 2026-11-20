/**
 * NEXUS runtime configuration.
 *
 * Every tunable value in the app lives here. Defaults can be overridden without
 * editing source in two supported ways:
 *
 *   1. A global set before the app boots — ideal for a hosted deployment:
 *        <script>window.NEXUS_CONFIG = { api: { textModel: "gemini-2.5-flash" } };</script>
 *   2. The in-app Settings dialog (provider + API key + base URL + model),
 *      persisted to localStorage under `storage.settings`.
 *
 * Nothing secret belongs in this file: it is committed to the repository.
 */

/** Immutable defaults, deep-cloned before merging. */
export const DEFAULT_CONFIG = Object.freeze({
    api: {
        /** Gateway used before the analyst picks one: `coarena` or `google`. */
        provider: "coarena",
        /** Coarena base URL — an OpenAI-compatible gateway (one key, 24 models). */
        baseUrl: "https://coarena.ai/api/v1",
        /** Default model. Free on Coarena's free plan: 1M context + vision. */
        textModel: "gemini-3-8-flash",
        /** Seed list for the model field; the live list comes from `/models`. */
        modelSuggestions: ["gemini-3-8-flash", "gpt-6-luna", "deepseek-v4-1-flash-1017"],
        /** Google AI Studio defaults, used when `provider === "google"`. */
        google: {
            baseUrl: "https://generativelanguage.googleapis.com/v1beta",
            textModel: "gemini-3-flash-preview"
        },
        /** Retry attempts for 429 / 5xx / network failures. Coarena allows 30
         *  requests/minute, so retries stay modest. */
        maxRetries: 3,
        /** Base delay for exponential backoff: 1s, 2s, 4s, 8s… */
        backoffBaseMs: 1000,
        /** Per-request timeout. Long briefings with web grounding take a while. */
        timeoutMs: 120000
    },
    storage: {
        theme: "nexus_theme",
        dossiers: "nexus_intel_dossiers_v1",
        settings: "nexus_settings_v1"
    },
    limits: {
        /** Maximum accepted upload size for Visual Intel. Coarena reports
         *  `max_image_bytes: 8388608` for its Gemini models, so 8 MiB is the
         *  real ceiling for an inline image. */
        imageMaxBytes: 8 * 1024 * 1024,
        imageMimeTypes: ["image/png", "image/jpeg", "image/webp"],
        /** Chat turns kept in the request payload before the oldest are dropped. */
        chatHistoryMaxMessages: 30,
        /** Citations rendered under a single chat answer. */
        citationDisplayMax: 5
    },
    ui: {
        toastDurationMs: 3200,
        clockIntervalMs: 1000
    }
});

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively merges `source` into `target`. Arrays and scalars are replaced
 * wholesale; plain objects are merged key by key.
 *
 * @template T
 * @param {T} target
 * @param {Partial<T> | undefined} source
 * @returns {T}
 */
export function deepMerge(target, source) {
    if (!isPlainObject(source)) return target;

    for (const [key, value] of Object.entries(source)) {
        if (value === undefined) continue;
        if (isPlainObject(value) && isPlainObject(target[key])) {
            target[key] = deepMerge({ ...target[key] }, value);
        } else {
            target[key] = value;
        }
    }
    return target;
}

/** Host-supplied overrides, when the page defines them before boot. */
const hostOverrides = typeof window !== "undefined" && isPlainObject(window.NEXUS_CONFIG) ? window.NEXUS_CONFIG : {};

/** The effective configuration used by every module. */
export const config = deepMerge(structuredClone(DEFAULT_CONFIG), hostOverrides);
