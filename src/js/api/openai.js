/**
 * OpenAI-compatible Chat Completions client.
 *
 * This is the transport NEXUS uses for gateways that speak OpenAI's protocol —
 * by default **Coarena** (`https://coarena.ai/api/v1`), which fronts Gemini,
 * Claude, GPT, DeepSeek and others behind one key. Point the base URL at any
 * compatible gateway and it works the same way.
 *
 * Protocol notes that shaped this file:
 * - auth is `Authorization: Bearer <key>` — never a query parameter, so the key
 *   cannot land in a proxy log or the address bar;
 * - Coarena answers a daily-quota 429 with `x-should-retry: false`. Retrying
 *   that is pointless and burns the per-minute budget, so it is treated as fatal;
 * - a per-minute 429 carries `Retry-After`, which the backoff honours;
 * - Coarena may **substitute a cheaper model** on the free plan. The response
 *   body's `model` field names whatever actually answered, so it is surfaced;
 * - there is no Google-Search grounding tool on this protocol, so a request
 *   asking for one is answered without it and the caller is told;
 * - `image_url: false` on Coarena's Gemini models means *remote* image URLs are
 *   refused — inline base64 data URLs are the supported form.
 */
import { config } from "../config.js";
import { tryInvokeAction } from "../core/bus.js";
import { NexusApiError, backoffDelay, parseOpenAIError, sleep } from "./errors.js";

/** How much of an error body is kept in a message. */
const ERROR_BODY_LIMIT = 240;

/**
 * Creates an OpenAI-compatible `chat/completions` client.
 *
 * @param {object} [options]
 * @param {() => string} [options.getApiKey] Read per request, so a key typed at
 *   runtime is used without rebuilding the client.
 * @param {() => string} [options.getBaseUrl] e.g. `https://coarena.ai/api/v1`
 * @param {() => string} [options.getModel]
 * @param {number} [options.maxRetries]
 * @param {number} [options.backoffBaseMs] Overridable so tests skip real waits.
 * @param {number} [options.timeoutMs]
 * @param {typeof globalThis.fetch} [options.fetchImpl] Injectable for tests.
 * @returns {{ generate: Function, listModels: Function, getModel: Function, hasKey: Function, provider: string }}
 */
export function createOpenAIClient(options = {}) {
    const getApiKey = options.getApiKey || (() => "");
    const getBaseUrl = options.getBaseUrl || (() => config.api.baseUrl);
    const getModel = options.getModel || (() => config.api.textModel);
    const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : config.api.maxRetries;
    const backoffBaseMs = Number.isFinite(options.backoffBaseMs) ? options.backoffBaseMs : config.api.backoffBaseMs;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : config.api.timeoutMs;
    const doFetch = options.fetchImpl || ((...args) => fetch(...args));

    /** @returns {boolean} whether a key is currently configured. */
    function hasKey() {
        return Boolean(getApiKey());
    }

    /**
     * Turns a non-2xx response into a `NexusApiError` carrying Coarena's advice
     * for its error code, so a 403 explains itself instead of showing JSON.
     *
     * @param {Response} response
     * @returns {Promise<NexusApiError>}
     */
    async function toHttpError(response) {
        const body = (await response.text()).slice(0, ERROR_BODY_LIMIT);
        const parsed = parseOpenAIError(body);
        const advice = parsed.code && COARENA_ADVICE[parsed.code] ? ` ${COARENA_ADVICE[parsed.code]}` : "";
        const message = parsed.message
            ? `${parsed.message}${advice}`
            : `درگاه مدل کد وضعیت ${response.status} برگرداند: ${body}`;

        return new NexusApiError(message, {
            code: "http_error",
            status: response.status,
            detail: { type: parsed.type, errorCode: parsed.code, body }
        });
    }

    /**
     * Runs one `chat/completions` request with bounded retries.
     *
     * @param {object} payload OpenAI Chat Completions body.
     * @param {{ timeoutMs?: number, maxRetries?: number }} [callOptions] Per-call
     *   overrides — the connection test uses a short timeout and no retries.
     * @returns {Promise<object>} the raw response JSON
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
        const url = `${normalizeBaseUrl(getBaseUrl())}/chat/completions`;

        for (let attempt = 0; attempt <= callMaxRetries; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), callTimeoutMs);

            try {
                const response = await doFetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({ ...payload, model }),
                    signal: controller.signal
                });

                if (!response.ok) {
                    // A daily-quota 429 states outright that retrying will not help.
                    if (response.headers?.get?.("x-should-retry") === "false") throw await toHttpError(response);

                    const retryable = response.status === 429 || response.status >= 500;
                    if (retryable && attempt < callMaxRetries) {
                        await sleep(backoffDelay(attempt, backoffBaseMs, response.headers));
                        continue;
                    }
                    throw await toHttpError(response);
                }

                return await response.json();
            } catch (err) {
                if (err instanceof NexusApiError) throw err;

                if (attempt < callMaxRetries) {
                    await sleep(backoffDelay(attempt, backoffBaseMs));
                    continue;
                }
                throw new NexusApiError(
                    err?.name === "AbortError"
                        ? `درخواست به ${model} پس از ${Math.round(callTimeoutMs / 1000)} ثانیه منقضی شد.`
                        : networkErrorMessage(err, url),
                    { code: err?.name === "AbortError" ? "timeout" : "network_error" }
                );
            } finally {
                clearTimeout(timer);
            }
        }

        throw new NexusApiError("درخواست پس از چند تلاش ناموفق ماند.", { code: "retries_exhausted" });
    }

    /**
     * `GET {base}/models` — public on Coarena, so it doubles as a reachability
     * and CORS probe and as the source for the model picker.
     *
     * @param {{ timeoutMs?: number }} [callOptions]
     * @returns {Promise<Array<{ id: string, display_name?: string, capabilities?: object }>>}
     * @throws {NexusApiError}
     */
    async function listModels(callOptions = {}) {
        const url = `${normalizeBaseUrl(getBaseUrl())}/models`;
        const headers = { Accept: "application/json" };
        const apiKey = getApiKey();
        // Gateways that keep the list behind auth still accept the key.
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), callOptions.timeoutMs ?? timeoutMs);

        let response;
        try {
            response = await doFetch(url, { method: "GET", headers, signal: controller.signal });
        } catch (err) {
            throw new NexusApiError(
                err?.name === "AbortError" ? "فهرست مدل‌ها در مهلت مقرر نرسید." : networkErrorMessage(err, url),
                { code: err?.name === "AbortError" ? "timeout" : "network_error" }
            );
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) throw await toHttpError(response);
        const body = await response.json();
        return Array.isArray(body?.data) ? body.data : [];
    }

    return { generate, listModels, getModel, getBaseUrl, hasKey, provider: "coarena" };
}

/**
 * Coarena error codes an analyst can actually act on.
 * @type {Record<string, string>}
 */
export const COARENA_ADVICE = {
    model_api_terms_required: "ابتدا شرایط Model API را در حساب Coarena بپذیرید.",
    invalid_api_key: "کلید نامعتبر است؛ آن را در صفحهٔ حساب Coarena دوباره بسازید.",
    api_key_revoked: "این کلید لغو شده است.",
    api_key_expired: "این کلید منقضی شده است؛ کلید تازه بسازید.",
    insufficient_quota: "سهمیهٔ رایگان امروز تمام شده است (بازنشانی ساعت ۰۰:۰۰ UTC).",
    payment_required: "این مدل به اعتبار (credit) نیاز دارد.",
    insufficient_balance: "موجودی اعتبار کافی نیست.",
    model_not_found: "این شناسهٔ مدل در فهرست درگاه وجود ندارد.",
    model_off: "این مدل روی حساب شما خاموش است.",
    provider_restricted: "ارائه‌دهندهٔ این مدل برای حساب شما بسته است.",
    context_length_exceeded: "متن ورودی از پنجرهٔ زمینهٔ مدل بزرگ‌تر است.",
    unsupported_parameter: "درگاه این پارامتر را پشتیبانی نمی‌کند.",
    request_too_large: "حجم درخواست بیش از حد مجاز است.",
    rate_limit_exceeded: "به سقف درخواست در دقیقه رسیده‌اید؛ کمی صبر کنید.",
    concurrency_limit_exceeded: "سقف درخواست هم‌زمان (۲) پر است.",
    upstream_error: "خطا از سمت ارائه‌دهندهٔ بالادستی؛ دوباره تلاش کنید.",
    model_unavailable: "مدل موقتاً در دسترس نیست.",
    account_blocked: "حساب مسدود است."
};

/**
 * Strips trailing slashes so `${base}/chat/completions` never doubles up.
 * @param {string} url
 * @returns {string}
 */
export function normalizeBaseUrl(url) {
    return String(url || "")
        .trim()
        .replace(/\/+$/, "");
}

/**
 * A browser `fetch` that fails because of CORS, a blocked origin or DNS looks
 * identical to a network failure: a `TypeError` with no status. Say so plainly,
 * because for a static site that is by far the most common cause.
 *
 * @param {unknown} err
 * @param {string} url
 * @returns {string}
 */
export function networkErrorMessage(err, url) {
    const detail = err?.message ? ` (${err.message})` : "";
    return `اتصال به ${safeOrigin(url)} ممکن نشد${detail}. اگر کنسول مرورگر خطای CORS نشان می‌دهد، این درگاه اجازهٔ درخواست مستقیم از مرورگر را نمی‌دهد؛ در این صورت «npm run proxy» را اجرا کنید و نشانی درگاه را در تنظیمات به «http://127.0.0.1:8787/api/v1» تغییر دهید (docs/DEPLOYMENT.md بخش ۵.۲).`;
}

/**
 * @param {string} url
 * @returns {string} just the origin, so error text stays short
 */
function safeOrigin(url) {
    try {
        return new URL(url).origin;
    } catch {
        return String(url || "").slice(0, 60);
    }
}

// ---------------------------------------------------------------------------
// Neutral request  ⇄  OpenAI wire format
// ---------------------------------------------------------------------------

/**
 * Gemini-style type names this app uses in `core/schema.js`, mapped onto their
 * JSON Schema equivalents.
 * @type {Record<string, string>}
 */
const SCHEMA_TYPE_MAP = {
    OBJECT: "object",
    STRING: "string",
    NUMBER: "number",
    INTEGER: "integer",
    BOOLEAN: "boolean",
    ARRAY: "array"
};

/**
 * Normalises the shared schema onto the wire shape Chat Completions expects.
 *
 * `core/schema.js` is written in Gemini's dialect (upper-case types,
 * `propertyOrdering`) because that is where structured output lives most
 * visibly. OpenAI's `response_format: { type: "json_schema" }` however speaks
 * plain JSON Schema — lower-case types — and its `strict` mode additionally
 * requires every object to declare `additionalProperties: false` and list all
 * of its properties under `required`. Sending the Gemini dialect verbatim gets
 * the request rejected by strict endpoints (OpenAI, OpenRouter, vLLM…), so the
 * mapper translates it once, here.
 *
 * @param {object} schema The neutral (Gemini-dialect) schema.
 * @param {{ strict?: boolean }} [options]
 * @returns {object} a JSON Schema the OpenAI protocol can enforce
 */
export function toOpenAISchema(schema, options = {}) {
    const strict = Boolean(options.strict);
    return convertSchemaNode(schema, strict);
}

/**
 * Recursive worker for `toOpenAISchema`.
 * @param {unknown} node
 * @param {boolean} strict
 * @returns {unknown}
 */
function convertSchemaNode(node, strict) {
    if (Array.isArray(node)) return node.map((entry) => convertSchemaNode(entry, strict));
    if (!node || typeof node !== "object") return node;

    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, value] of Object.entries(node)) {
        // `propertyOrdering` is a Gemini-only hint; JSON Schema has no such key.
        if (key === "propertyOrdering") continue;
        if (key === "type") {
            const t = typeof value === "string" ? SCHEMA_TYPE_MAP[value.toUpperCase()] || value.toLowerCase() : value;
            out.type = t;
            continue;
        }
        out[key] = convertSchemaNode(value, strict);
    }

    // Strict mode is all-or-nothing: objects must close every property.
    if (strict && out.type === "object" && out.properties && typeof out.properties === "object") {
        out.additionalProperties = false;
        const names = Object.keys(out.properties);
        if (names.length > 0) out.required = names;
    }
    return out;
}

/**
 * Maps a provider-neutral NEXUS request onto a Chat Completions body.
 *
 * @param {import("../services/provider.js").NexusRequest} request
 * @param {{ jsonSchemaStrict?: boolean }} [options]
 * @returns {object}
 */
export function toOpenAIPayload(request, options = {}) {
    /** @type {Array<object>} */
    const messages = [];
    if (request.system) messages.push({ role: "system", content: request.system });

    const images = request.images || [];
    const lastUserTurn = findLastUserTurn(request.messages);

    for (const turn of request.messages || []) {
        const role = turn.role === "assistant" ? "assistant" : "user";
        const attachImages = role === "user" && turn === lastUserTurn && images.length > 0;

        if (attachImages) {
            messages.push({
                role,
                content: [
                    { type: "text", text: turn.text },
                    ...images.map((image) => ({
                        type: "image_url",
                        image_url: { url: `data:${image.mimeType};base64,${image.data}` }
                    }))
                ]
            });
        } else {
            messages.push({ role, content: turn.text });
        }
    }

    /** @type {object} */
    const payload = { messages };

    if (request.jsonSchema) {
        // Coarena reports `json_schema_enforced: true` for its Gemini models, so
        // the strict form genuinely constrains the output; `json_object` is the
        // safe fallback for gateways that do not implement it. The schema itself
        // is translated from the Gemini dialect to JSON Schema first — see
        // `toOpenAISchema()`.
        payload.response_format = options.jsonSchemaStrict
            ? {
                  type: "json_schema",
                  json_schema: {
                      name: "nexus_signal_matrix",
                      strict: true,
                      schema: toOpenAISchema(request.jsonSchema, { strict: true })
                  }
              }
            : { type: "json_object" };
    }

    // Coarena bills the whole output allowance when a call is cut short, so a
    // bounded `max_tokens` is cheaper than relying on the 8,192 default.
    if (Number.isFinite(request.maxTokens)) payload.max_tokens = request.maxTokens;

    return payload;
}

/**
 * @param {Array<{ role: string }>} [messages]
 * @returns {object | null} the final user turn, which carries any images
 */
function findLastUserTurn(messages) {
    for (let i = (messages || []).length - 1; i >= 0; i--) {
        if (messages[i].role !== "assistant") return messages[i];
    }
    return null;
}

/**
 * Normalises a Chat Completions response into the shared NEXUS result shape.
 *
 * @param {object} raw
 * @returns {import("../services/provider.js").NexusResult}
 */
export function fromOpenAIResult(raw) {
    const choice = raw?.choices?.[0];
    const message = choice?.message;

    // Some gateways return content as an array of parts; handle both.
    let text = "";
    if (typeof message?.content === "string") {
        text = message.content;
    } else if (Array.isArray(message?.content)) {
        text = message.content
            .filter((part) => typeof part?.text === "string")
            .map((part) => part.text)
            .join("");
    }

    return {
        text: text.trim(),
        // No grounding tool exists on this protocol.
        sources: [],
        finishReason: choice?.finish_reason || null,
        // Names the model that actually answered — under Coarena cost routing
        // that can differ from the one requested.
        model: raw?.model || null,
        groundingApplied: false,
        raw
    };
}
