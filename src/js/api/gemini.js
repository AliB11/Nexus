/**
 * Gemini REST client.
 *
 * The browser talks to `generativelanguage.googleapis.com` directly. The API key
 * is sent in the `x-goog-api-key` header rather than the query string, so it
 * never ends up in server logs, proxy logs or the address bar. Transient
 * failures (429 / 5xx / network) are retried with exponential backoff.
 *
 * Since NEXUS defaults to the Coarena gateway, this client is no longer the
 * only transport: `api/openai.js` speaks OpenAI Chat Completions, and
 * `services/provider.js` decides which one to build. Both share the neutral
 * request/result shape in `api/provider.js` and the error type in
 * `api/errors.js`, so no UI module knows or cares which gateway answered.
 */
import { config } from "../config.js";
import { tryInvokeAction } from "../core/bus.js";
import { NexusApiError, sleep } from "./errors.js";

// Re-exported so callers keep a single import site for the shared error type.
export { NexusApiError };

/**
 * Creates a Gemini `generateContent` client.
 *
 * @param {object} [options]
 * @param {() => string} [options.getApiKey] Supplies the key per request, so a
 *   key added at runtime is picked up without recreating the client.
 * @param {() => string} [options.getModel] Supplies the model id per request.
 * @param {() => string} [options.getBaseUrl] Overrides `config.api.google.baseUrl`.
 * @param {number} [options.maxRetries] Overrides `config.api.maxRetries`.
 * @param {number} [options.backoffBaseMs] Overrides `config.api.backoffBaseMs`.
 * @param {number} [options.timeoutMs] Overrides `config.api.timeoutMs`.
 * @param {typeof globalThis.fetch} [options.fetchImpl] Injectable for tests.
 * @returns {{ generate: Function, getModel: () => string, hasKey: () => boolean, provider: string }}
 */
export function createGeminiClient(options = {}) {
    const getApiKey = options.getApiKey || (() => "");
    const getModel = options.getModel || (() => config.api.textModel);
    const getBaseUrl = options.getBaseUrl || (() => config.api.google.baseUrl);
    const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : config.api.maxRetries;
    // Overridable so tests do not have to wait through real backoff delays.
    const backoffBaseMs = Number.isFinite(options.backoffBaseMs) ? options.backoffBaseMs : config.api.backoffBaseMs;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : config.api.timeoutMs;
    const doFetch = options.fetchImpl || ((...args) => fetch(...args));

    /**
     * @returns {boolean} whether a key is currently configured.
     */
    function hasKey() {
        return Boolean(getApiKey());
    }

    /**
     * Runs a `generateContent` request with silent exponential-backoff retries.
     * @param {object} payload Gemini request body (`contents`, `tools`, ...).
     * @param {{ timeoutMs?: number, maxRetries?: number }} [callOptions] Per-call
     *   overrides — the connection test uses a short timeout and no retries.
     * @returns {Promise<object>} The raw response JSON.
     * @throws {NexusApiError}
     */
    async function generate(payload, callOptions = {}) {
        const callTimeoutMs = Number.isFinite(callOptions.timeoutMs) ? callOptions.timeoutMs : timeoutMs;
        const callMaxRetries = Number.isFinite(callOptions.maxRetries) ? callOptions.maxRetries : maxRetries;
        const apiKey = getApiKey();
        if (!apiKey) {
            tryInvokeAction("apikey:prompt");
            throw new NexusApiError(
                "کلید API تنظیم نشده است. از نوار کناری وارد «تنظیمات» شوید و کلید، نشانی و مدل را وارد کنید تا تحلیل زنده فعال شود.",
                { code: "missing_api_key" }
            );
        }

        const model = getModel();
        // `generateContent` is the RPC name; it is not configurable.
        const apiUrl = `${getBaseUrl().replace(/\/+$/, "")}/models/${model}:generateContent`;

        for (let attempt = 0; attempt <= callMaxRetries; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), callTimeoutMs);

            try {
                const response = await doFetch(apiUrl, {
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
                    if (retryable && attempt < callMaxRetries) {
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
                if (!fatal && attempt < callMaxRetries) {
                    await sleep(Math.pow(2, attempt) * backoffBaseMs);
                    continue;
                }
                if (fatal) throw err;
                throw new NexusApiError(
                    err?.name === "AbortError"
                        ? `درخواست به ${model} پس از ${Math.round(callTimeoutMs / 1000)} ثانیه منقضی شد.`
                        : `درخواست شبکه ناموفق بود: ${err?.message || "خطای نامشخص"}`,
                    { code: err?.name === "AbortError" ? "timeout" : "network_error" }
                );
            } finally {
                clearTimeout(timer);
            }
        }

        throw new NexusApiError("درخواست پس از چند تلاش ناموفق ماند.", { code: "retries_exhausted" });
    }

    return { generate, getModel, getBaseUrl, hasKey, provider: "google-gemini" };
}

// ---------------------------------------------------------------------------
// Neutral request  ⇄  Gemini wire format
// ---------------------------------------------------------------------------

/**
 * Maps a provider-neutral NEXUS request onto a `generateContent` body.
 *
 * @param {import("./provider.js").NexusRequest} request
 * @returns {object}
 */
export function toGeminiRequest(request) {
    const contents = (request.messages || []).map((turn) => ({
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: turn.text }]
    }));

    if (contents.length > 0 && request.images?.length) {
        const last = contents[contents.length - 1];
        if (last.role === "user") {
            last.parts.push(
                ...request.images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } }))
            );
        }
    }

    /** @type {object} */
    const body = { contents };
    const generationConfig = {};

    if (request.system) body.systemInstruction = { parts: [{ text: request.system }] };
    if (request.jsonSchema) {
        generationConfig.responseMimeType = "application/json";
        generationConfig.responseSchema = request.jsonSchema;
    }
    if (request.grounding) body.tools = [{ googleSearch: {} }];
    if (Number.isFinite(request.maxTokens)) generationConfig.maxOutputTokens = request.maxTokens;
    if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;

    return body;
}

/**
 * Normalises a `generateContent` response into the shared NEXUS result shape.
 *
 * @param {object} raw
 * @returns {import("./provider.js").NexusResult}
 */
export function fromGeminiResult(raw) {
    const candidate = raw?.candidates?.[0];
    const metadata = candidate?.groundingMetadata;
    const sources = extractSources(candidate);

    return {
        text: firstText(raw),
        sources,
        finishReason: blockReason(raw),
        model: raw?.modelVersion || null,
        // Citations are the proof that matters to the analyst: a response can
        // carry attributions without chunks, so any of the three counts.
        groundingApplied: Boolean(
            sources.length || metadata?.groundingChunks?.length || metadata?.webSearchQueries?.length
        ),
        raw
    };
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
