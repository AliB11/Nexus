/**
 * Gemini REST client.
 *
 * The browser talks to `generativelanguage.googleapis.com` directly. The API key
 * is sent in the `x-goog-api-key` header rather than the query string, so it
 * never ends up in server logs, proxy logs or the address bar. Transient
 * failures (429 / 5xx / network) are retried with exponential backoff.
 */
import { config } from "../config.js";
import { tryInvokeAction } from "../core/bus.js";

/** Error thrown when the request cannot be made at all (e.g. no API key). */
export class NexusApiError extends Error {
    /**
     * @param {string} message
     * @param {{ code?: string, status?: number }} [details]
     */
    constructor(message, details = {}) {
        super(message);
        this.name = "NexusApiError";
        this.code = details.code || "api_error";
        this.status = details.status;
    }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a Gemini `generateContent` client.
 *
 * @param {object} [options]
 * @param {() => string} [options.getApiKey] Supplies the key per request, so a
 *   key added at runtime is picked up without recreating the client.
 * @param {() => string} [options.getModel] Supplies the model id per request.
 * @param {number} [options.maxRetries] Overrides `config.api.maxRetries`.
 * @param {number} [options.backoffBaseMs] Overrides `config.api.backoffBaseMs`.
 * @param {number} [options.timeoutMs] Overrides `config.api.timeoutMs`.
 * @returns {{ generate: (payload: object) => Promise<object>, getModel: () => string, hasKey: () => boolean }}
 */
export function createGeminiClient(options = {}) {
    const getApiKey = options.getApiKey || (() => "");
    const getModel = options.getModel || (() => config.api.textModel);
    const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : config.api.maxRetries;
    // Overridable so tests do not have to wait through real backoff delays.
    const backoffBaseMs = Number.isFinite(options.backoffBaseMs) ? options.backoffBaseMs : config.api.backoffBaseMs;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : config.api.timeoutMs;

    /**
     * @returns {boolean} whether a key is currently configured.
     */
    function hasKey() {
        return Boolean(getApiKey());
    }

    /**
     * Runs a `generateContent` request with silent exponential-backoff retries.
     * @param {object} payload Gemini request body (`contents`, `tools`, ...).
     * @returns {Promise<object>} The raw response JSON.
     * @throws {NexusApiError}
     */
    async function generate(payload) {
        const apiKey = getApiKey();
        if (!apiKey) {
            tryInvokeAction("apikey:prompt");
            throw new NexusApiError(
                "کلید Gemini API تنظیم نشده است. از نوار کناری وارد «تنظیمات» شوید و کلید خود را بچسبانید تا تحلیل زنده فعال شود.",
                { code: "missing_api_key" }
            );
        }

        const model = getModel();
        const apiUrl = `${config.api.baseUrl}/models/${model}:generateContent`;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch(apiUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": apiKey
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                if (!response.ok) {
                    const retryable = response.status === 429 || response.status >= 500;
                    if (retryable && attempt < maxRetries) {
                        await sleep(Math.pow(2, attempt) * backoffBaseMs);
                        continue;
                    }
                    const errorBody = await response.text();
                    throw new NexusApiError(
                        `Gemini API کد وضعیت ${response.status} برگرداند: ${errorBody.slice(0, 180)}`,
                        { code: "http_error", status: response.status }
                    );
                }

                return await response.json();
            } catch (err) {
                const fatal = err instanceof NexusApiError;
                if (!fatal && attempt < maxRetries) {
                    await sleep(Math.pow(2, attempt) * backoffBaseMs);
                    continue;
                }
                if (fatal) throw err;
                throw new NexusApiError(
                    err?.name === "AbortError"
                        ? `درخواست به ${model} پس از ${Math.round(timeoutMs / 1000)} ثانیه منقضی شد.`
                        : `درخواست شبکه ناموفق بود: ${err?.message || "خطای نامشخص"}`,
                    { code: err?.name === "AbortError" ? "timeout" : "network_error" }
                );
            } finally {
                clearTimeout(timer);
            }
        }

        throw new NexusApiError("درخواست پس از چند تلاش ناموفق ماند.", { code: "retries_exhausted" });
    }

    return { generate, getModel, hasKey };
}

/**
 * Reads the first text part out of a `generateContent` response.
 * @param {object} result Raw Gemini response.
 * @returns {string} Trimmed text, or an empty string when the model returned none.
 */
export function firstText(result) {
    const parts = result?.candidates?.[0]?.content?.parts || [];
    return parts
        .filter((part) => typeof part?.text === "string")
        .map((part) => part.text)
        .join("")
        .trim();
}

/**
 * Reads the block-reason, if the safety filters stopped the response.
 * @param {object} result Raw Gemini response.
 * @returns {string | null}
 */
export function blockReason(result) {
    const reason = result?.candidates?.[0]?.finishReason;
    return reason && reason !== "STOP" ? reason : null;
}
/**
 * Extracts grounding citation sources from Gemini's groundingMetadata.
 */
export function extractSources(candidate) {
    const sources = [];
    const seen = new Set();
    const metadata = candidate?.groundingMetadata;

    if (metadata?.groundingAttributions) {
        for (const attr of metadata.groundingAttributions) {
            const uri = attr.web?.uri;
            const title = attr.web?.title;
            if (uri && title && !seen.has(uri)) {
                seen.add(uri);
                sources.push({ uri, title });
            }
        }
    }

    // Fallback support for groundingChunks if returned by API
    if (sources.length === 0 && metadata?.groundingChunks) {
        for (const chunk of metadata.groundingChunks) {
            const uri = chunk.web?.uri;
            const title = chunk.web?.title;
            if (uri && title && !seen.has(uri)) {
                seen.add(uri);
                sources.push({ uri, title });
            }
        }
    }

    return sources;
}
