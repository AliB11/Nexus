/**
 * Output encoding helpers. All model output is untrusted input: it is escaped
 * before it ever reaches `innerHTML`, and every generated URL is restricted to
 * safe schemes so a `javascript:` URI can never be rendered as a link.
 */
/**
 * Escapes raw HTML entities to prevent XSS before formatting markdown.
 */
export function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Reverses `escapeHtml()`.
 *
 * Only used on values that were escaped by this module moments earlier — for
 * example a Markdown link URL, which must be decoded before `safeUrl()` can
 * parse it. Never use it on raw, untrusted input.
 *
 * @param {string} str
 * @returns {string}
 */
export function unescapeHtml(str) {
    return String(str ?? "")
        .replace(/&#039;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&amp;/g, "&");
}

/** URL schemes that may be rendered as clickable links. */
const SAFE_URL_SCHEMES = ["http:", "https:", "mailto:"];

/**
 * Returns a URL that is safe to place inside an `href` attribute.
 * Relative URLs and safe absolute schemes pass through (HTML-escaped);
 * everything else (`javascript:`, `data:`, `vbscript:`, ...) becomes `#`.
 * @param {string} url
 * @returns {string}
 */
export function safeUrl(url) {
    const raw = String(url ?? "").trim();
    if (!raw) return "#";

    if (raw.startsWith("/") || raw.startsWith("#") || raw.startsWith("./")) {
        return escapeHtml(raw);
    }

    try {
        const parsed = new URL(raw, "https://nexus.invalid/");
        if (SAFE_URL_SCHEMES.includes(parsed.protocol)) return escapeHtml(parsed.href);
    } catch {
        // Fall through to the blocked value below.
    }
    return "#";
}
