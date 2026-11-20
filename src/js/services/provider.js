/**
 * Model provider layer — the single place that decides *where* NEXUS talks to.
 *
 * Two transports sit behind one neutral interface:
 *
 * | provider  | protocol                 | default endpoint                             |
 * | --------- | ------------------------ | -------------------------------------------- |
 * | `coarena` | OpenAI Chat Completions  | `https://coarena.ai/api/v1`                  |
 * | `google`  | Gemini `generateContent` | `generativelanguage.googleapis.com/v1beta`   |
 *
 * Coarena is the default: one free key fronts 24 models (Gemini, Claude, GPT,
 * DeepSeek, …) instead of a single vendor.
 *
 * Modules never import a transport. They call `runRequest({ messages, … })` and
 * get back `{ text, sources, finishReason, model, groundingApplied }`, so
 * switching gateway is a settings change, not a code change.
 *
 * @typedef {object} NexusRequest
 * @property {string} [system] System instruction.
 * @property {Array<{ role: "user" | "assistant", text: string }>} messages
 * @property {Array<{ mimeType: string, data: string }>} [images] Base64, no data-URI prefix.
 * @property {object} [jsonSchema] Request structured JSON output in this shape.
 * @property {boolean} [grounding] Ask for live web results where supported.
 * @property {number} [maxTokens] Output token budget.
 *
 * @typedef {object} NexusResult
 * @property {string} text Model output (empty when blocked).
 * @property {Array<{ uri: string, title: string }>} sources Grounding citations, if any.
 * @property {string | null} finishReason Non-null when the provider stopped early.
 * @property {string | null} model The model that actually answered.
 * @property {boolean} groundingApplied Whether live web grounding was used.
 * @property {boolean} [groundingUnavailable] Set when grounding was requested but
 *   the active gateway has no such tool.
 * @property {object} raw Untouched provider response, for debugging.
 *
 * @typedef {object} ConnectionTest
 * @property {boolean} ok
 * @property {string} model Model that answered the probe ("" when it did not).
 * @property {number} latencyMs Round-trip time of the whole test.
 * @property {string} message Detail or advice, in Persian.
 * @property {Array<{ id: string, label: string }>} models Catalogue, when the
 *   gateway exposes one.
 * @property {string} [suggestedModel] A corrected id, when the typed one was a
 *   near-miss of a real model (`gemini-3.8-flash` → `gemini-3-8-flash`).
 */
import { config } from "../config.js";
import { NexusApiError } from "../api/errors.js";
import { createGeminiClient, fromGeminiResult, toGeminiRequest } from "../api/gemini.js";
import { createOpenAIClient, fromOpenAIResult, toOpenAIPayload } from "../api/openai.js";
import { formatNumber } from "../core/format.js";
import {
    getApiKey,
    getBaseUrl,
    getModel,
    getProvider,
    hasApiKey,
    isKeyInjected,
    normalizeBaseUrl as normalizeStoredUrl,
    providerDefaults
} from "./settings.js";

/** Per-probe timeout for the connection test: short enough to stay usable. */
const TEST_TIMEOUT_MS = 30_000;

/**
 * Provider metadata the settings dialog renders from. Adding a gateway means
 * adding an entry here plus a `config.api` default — nothing else.
 */
export const PROVIDERS = {
    coarena: {
        id: "coarena",
        label: "Coarena",
        transport: "openai",
        description: "یک کلید رایگان برای ۲۴ مدل (Gemini، Claude، GPT، DeepSeek و …)",
        keyUrl: "https://coarena.ai/account/api/keys",
        docsUrl: "https://coarena.ai/docs",
        keyHint: "کلید با coa_ شروع می‌شود و از صفحهٔ حساب Coarena ساخته می‌شود.",
        note: "پلن رایگان: ۳۰ درخواست در دقیقه، ۲ درخواست هم‌زمان، ۱٬۰۰۰ درخواست در روز. هر پرسش و پاسخ در سمت Coarena ذخیره می‌شود؛ دادهٔ حساس نفرستید."
    },
    google: {
        id: "google",
        label: "Google AI Studio",
        transport: "gemini",
        description: "اتصال مستقیم به Gemini با کلید شخصی گوگل",
        keyUrl: "https://aistudio.google.com/app/apikey",
        docsUrl: "https://ai.google.dev/gemini-api/docs",
        keyHint: "کلید با AIza شروع می‌شود و از Google AI Studio گرفته می‌شود.",
        note: "این مسیر از جست‌وجوی زندهٔ گوگل (grounding) پشتیبانی می‌کند؛ درگاه Coarena این ابزار را ندارد."
    }
};

/** Order used by the provider `<select>`. */
export const PROVIDER_ORDER = ["coarena", "google"];

/** @type {{ provider: string, client: object } | null} */
let cached = null;

/**
 * @param {string} [id]
 * @returns {object} provider metadata, falling back to Coarena
 */
export function getProviderDefinition(id = getProvider()) {
    return PROVIDERS[id] || PROVIDERS.coarena;
}

/**
 * The client for the current settings. Rebuilt only when the *provider* changes,
 * because that is what selects the transport; key, base URL and model are read
 * per request, so editing them needs no rebuild.
 *
 * @returns {{ run: Function, testConnection: Function, listModels: Function, getModel: Function, getBaseUrl: Function, hasKey: Function, provider: string, transport: string }}
 */
export function getModelClient() {
    const provider = getProvider();
    if (!cached || cached.provider !== provider) {
        cached = { provider, client: buildClient(getProviderDefinition(provider)) };
    }
    return cached.client;
}

/** Drops the cached client. Used by tests after injecting different settings. */
export function resetModelClient() {
    cached = null;
}

/**
 * Builds a client for one provider.
 *
 * @param {object} definition
 * @param {{ apiKey: string, baseUrl: string, model: string } | null} [fixed]
 *   Pin the credentials instead of reading persisted settings — used by the
 *   connection test, which must probe the values still sitting in the form.
 */
function buildClient(definition, fixed = null) {
    const isGemini = definition.transport === "gemini";
    const readApiKey = fixed ? () => fixed.apiKey : getApiKey;
    const readBaseUrl = fixed ? () => fixed.baseUrl : getBaseUrl;
    const readModel = fixed ? () => fixed.model : getModel;

    const transport = isGemini
        ? createGeminiClient({ getApiKey: readApiKey, getModel: readModel, getBaseUrl: readBaseUrl })
        : createOpenAIClient({ getApiKey: readApiKey, getModel: readModel, getBaseUrl: readBaseUrl });

    const toWire = isGemini ? toGeminiRequest : (request) => toOpenAIPayload(request, { jsonSchemaStrict: true });
    const fromWire = isGemini ? fromGeminiResult : fromOpenAIResult;

    /**
     * Runs one provider-neutral request.
     *
     * @param {NexusRequest} request
     * @returns {Promise<NexusResult>}
     * @throws {NexusApiError}
     */
    async function run(request) {
        const raw = await transport.generate(toWire(request));
        const result = fromWire(raw);
        // Grounding is a Google-only tool. Report its absence honestly instead
        // of implying the citations came from a live search that never ran.
        if (request.grounding && !result.groundingApplied && !isGemini) {
            result.groundingUnavailable = true;
        }
        return result;
    }

    /**
     * Verifies endpoint + key + model with the cheapest possible round trip.
     *
     * Order matters: `GET /models` is public on Coarena, so it separates
     * "gateway unreachable / blocked by CORS" from "your key is wrong" before
     * spending an authenticated call.
     *
     * Named apart from the exported `testConnection` wrapper, which resolves the
     * values typed into the settings dialog before calling this.
     *
     * @returns {Promise<ConnectionTest>}
     */
    async function probeConnection() {
        const started = Date.now();
        const latencyMs = () => Date.now() - started;
        const model = readModel();

        /** @type {Array<{ id: string, label: string }>} */
        let models = [];

        if (typeof transport.listModels === "function") {
            try {
                const list = await transport.listModels({ timeoutMs: TEST_TIMEOUT_MS });
                models = list
                    .filter((entry) => entry?.id)
                    .map((entry) => ({ id: String(entry.id), label: String(entry.display_name || entry.id) }));
            } catch (err) {
                // Unreachable gateway or blocked by CORS: no point probing further.
                if (err instanceof NexusApiError && (err.code === "network_error" || err.code === "timeout")) {
                    return { ok: false, model: "", latencyMs: latencyMs(), message: err.message, models: [] };
                }
                // An HTTP failure here is survivable — some gateways gate the list.
            }
        }

        if (!readApiKey()) {
            return {
                ok: false,
                model,
                latencyMs: latencyMs(),
                message: "کلید API خالی است؛ ابتدا کلید را وارد کنید.",
                models
            };
        }

        // Catch a typo before paying for a chat call, and offer the right id.
        const alias = models.length > 0 ? matchModelAlias(models, model) : null;
        if (models.length > 0 && !models.some((entry) => entry.id === model) && !alias) {
            return {
                ok: false,
                model,
                latencyMs: latencyMs(),
                message: `شناسهٔ «${model}» در فهرست این درگاه نیست. ${formatNumber(models.length)} مدل در دسترس است؛ از فهرست پیشنهادی انتخاب کنید.`,
                models
            };
        }
        if (alias) {
            return {
                ok: false,
                model,
                latencyMs: latencyMs(),
                message: `شناسهٔ «${model}» در فهرست این درگاه نیست؛ شکل درست آن «${alias}» است.`,
                models,
                suggestedModel: alias
            };
        }

        try {
            const probe = { messages: [{ role: "user", text: "ping" }], maxTokens: 1 };
            const result = await transport.generate(toWire(probe), { timeoutMs: TEST_TIMEOUT_MS, maxRetries: 0 });
            const normalized = fromWire(result);
            const answered = normalized.model || model;

            return {
                ok: true,
                model: answered,
                latencyMs: latencyMs(),
                message:
                    answered !== model
                        ? `اتصال برقرار است، اما درگاه به‌جای «${model}» با «${answered}» پاسخ داد (مسیریابی هزینه در پلن رایگان).`
                        : `اتصال برقرار است؛ «${answered}» پاسخ داد.`,
                models
            };
        } catch (err) {
            return {
                ok: false,
                model,
                latencyMs: latencyMs(),
                message: err?.message || "تست اتصال ناموفق بود.",
                models
            };
        }
    }

    return {
        run,
        testConnection: probeConnection,
        listModels: transport.listModels || (async () => []),
        getModel: readModel,
        getBaseUrl: readBaseUrl,
        hasKey: () => Boolean(readApiKey()),
        get provider() {
            return definition.id;
        },
        get transport() {
            return definition.transport;
        }
    };
}

/**
 * Convenience wrapper so modules never hold a client reference.
 *
 * @param {NexusRequest} request
 * @returns {Promise<NexusResult>}
 */
export function runRequest(request) {
    return getModelClient().run(request);
}

/**
 * Runs the connection test.
 *
 * Accepts the values currently typed into the settings dialog, so «تست اتصال»
 * checks what the analyst is about to save rather than what was saved earlier.
 *
 * @param {{ provider?: string, apiKey?: string, baseUrl?: string, model?: string }} [overrides]
 * @returns {Promise<ConnectionTest>}
 */
export function testConnection(overrides = {}) {
    const saved = { provider: getProvider(), apiKey: getApiKey(), baseUrl: getBaseUrl(), model: getModel() };
    const pending = { ...saved };

    for (const field of ["provider", "apiKey", "baseUrl", "model"]) {
        if (typeof overrides[field] === "string" && overrides[field].trim() !== "") {
            pending[field] = overrides[field].trim();
        }
    }
    // A blank key in the form means "test without one" — never fall back to the
    // stored key, or the test would pass while the field looks empty.
    if (typeof overrides.apiKey === "string" && overrides.apiKey.trim() === "") pending.apiKey = "";

    pending.provider = getProviderDefinition(pending.provider).id;
    pending.baseUrl = normalizeStoredUrl(pending.baseUrl) || providerDefaults(pending.provider).baseUrl;
    if (!pending.model.trim()) pending.model = providerDefaults(pending.provider).model;

    return buildClient(getProviderDefinition(pending.provider), pending).testConnection();
}

/**
 * Loads the gateway's model catalogue, for the model field's suggestions.
 * @returns {Promise<Array<{ id: string, label: string }>>}
 */
export async function listModels() {
    try {
        const list = await getModelClient().listModels({ timeoutMs: TEST_TIMEOUT_MS });
        return list
            .filter((entry) => entry?.id)
            .map((entry) => ({ id: String(entry.id), label: String(entry.display_name || entry.id) }));
    } catch {
        return [];
    }
}

/**
 * Label for the status bar: `Coarena · gemini-3-8-flash`.
 * @returns {string}
 */
export function getModelLabel() {
    return `${getProviderDefinition().label} · ${getModel()}`;
}

/**
 * The model that actually answered, for result footers.
 *
 * @param {NexusResult} [result]
 * @returns {string}
 */
export function getAnsweringModel(result) {
    return result?.model || getModel();
}

/**
 * Finds a catalogue entry that is a plausible correction of a mistyped id —
 * `gemini-3.8-flash` vs `gemini-3-8-flash`, or a missing `google/` prefix.
 *
 * @param {Array<{ id: string, label: string }>} models
 * @param {string} wanted
 * @returns {string | null}
 */
export function matchModelAlias(models, wanted) {
    const target = normalizeModelId(wanted);
    if (!target) return null;
    for (const entry of models) {
        if (entry.id === wanted) return null; // Exact match needs no correction.
        if (normalizeModelId(entry.id) === target) return entry.id;
    }
    return null;
}

/**
 * @param {string} id
 * @returns {string} alphanumerics only, lower-cased, without a vendor prefix
 */
function normalizeModelId(id) {
    const bare =
        String(id || "")
            .toLowerCase()
            .split("/")
            .pop() || "";
    return bare.replace(/[^a-z0-9]/g, "");
}

export { config, getApiKey, getBaseUrl, getModel, getProvider, hasApiKey, isKeyInjected, NexusApiError };
