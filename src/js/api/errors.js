/**
 * Shared API error type.
 *
 * Both provider clients (`gemini.js`, `openai.js`) throw this, so callers can
 * branch on `code` without knowing which gateway answered.
 */

/** Error thrown when a request cannot be completed. */
export class NexusApiError extends Error {
    /**
     * @param {string} message
     * @param {{ code?: string, status?: number, detail?: unknown, retryable?: boolean }} [details]
     */
    constructor(message, details = {}) {
        super(message);
        this.name = "NexusApiError";
        /**
         * One of: `missing_api_key` | `http_error` | `timeout` | `network_error`
         * | `retries_exhausted` | `cors_blocked` | `api_error`.
         */
        this.code = details.code || "api_error";
        this.status = details.status;
        /** Provider-specific error body, when one was returned. */
        this.detail = details.detail;
    }
}

/**
 * Reads the human-readable message out of an OpenAI-shaped error body:
 * `{ error: { message, type, code } }`.
 *
 * @param {string} bodyText Raw response body (already truncated by the caller).
 * @returns {{ message: string, code: string | null, type: string | null }}
 */
export function parseOpenAIError(bodyText) {
    try {
        const parsed = JSON.parse(bodyText);
        const error = parsed?.error;
        if (error && typeof error === "object") {
            return {
                message: String(error.message || "").trim(),
                code: error.code ? String(error.code) : null,
                type: error.type ? String(error.type) : null
            };
        }
    } catch {
        // Not JSON — fall through and use the raw text.
    }
    return { message: String(bodyText || "").trim(), code: null, type: null };
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * Exponential backoff: `base * 2^attempt`, honouring a server `Retry-After`
 * when it asks for longer.
 *
 * @param {number} attempt Zero-based attempt index.
 * @param {number} baseMs
 * @param {Headers | { get?: Function } | null} [headers]
 * @returns {number} milliseconds to wait
 */
export function backoffDelay(attempt, baseMs, headers = null) {
    const exponential = Math.pow(2, attempt) * baseMs;
    const retryAfter = typeof headers?.get === "function" ? headers.get("retry-after") : null;
    const seconds = Number.parseFloat(retryAfter);
    const fromHeader = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
    return Math.max(exponential, fromHeader);
}
