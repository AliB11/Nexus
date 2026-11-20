/**
 * Presentation formatting helpers.
 *
 * Pure functions only — no DOM, no state — so they are trivially unit-testable
 * (`tests/format.test.js`) and reusable from any module.
 *
 * LANGUAGE: user-facing counters are rendered with Persian digits (`fa-IR`),
 * because the whole UI is Persian. Values that are *data* rather than copy —
 * the UTC clock, briefing timestamps, file sizes handed to the model — stay in
 * their Latin technical form and are marked `dir="ltr"` in the markup.
 */

/** Locale used for every human-facing number. */
const NUMBER_LOCALE = "fa-IR";

/**
 * Formats a number with Persian digits and locale grouping.
 * @param {number} value
 * @returns {string}
 */
export function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "۰";
    try {
        return n.toLocaleString(NUMBER_LOCALE);
    } catch {
        // A runtime without fa-IR locale data: fall back to plain digits.
        return String(n);
    }
}

/**
 * Turns a model id into a compact display label:
 * `gemini-3-flash-preview` → `GEMINI 3 FLASH`.
 *
 * Model ids are Latin by definition, so this stays upper-cased ASCII.
 *
 * @param {string} model
 * @returns {string}
 */
export function formatModelLabel(model) {
    return String(model || "")
        .replace(/[-_]+/g, " ")
        .replace(/\b(preview|latest|exp|rc\d*)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}

/**
 * Timestamp used on briefings and archived dossiers: `2026-11-19 23:15 UTC`.
 *
 * Kept in ISO-ish Latin form on purpose: it is archived data, and Persian digits
 * would make the stored dossiers harder to sort and compare.
 *
 * @param {Date} [date]
 * @returns {string}
 */
export function formatUtcTimestamp(date = new Date()) {
    return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

/**
 * Header telemetry clock: `23:15:04 UTC`.
 *
 * @param {Date} [date]
 * @returns {string}
 */
export function formatUtcClock(date = new Date()) {
    return `${date.toISOString().split("T")[1].slice(0, 8)} UTC`;
}

/**
 * Human-readable byte size, e.g. `1536` → `1.5 KB`.
 *
 * Unit symbols stay Latin (`KB`, `MB`) — they are international abbreviations.
 *
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value < 0) return "0 KB";

    const units = ["B", "KB", "MB", "GB"];
    let size = value;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit += 1;
    }
    return `${unit === 0 ? size : size.toFixed(1)} ${units[unit]}`;
}

/**
 * Character counter label under the Signal Matrix textarea.
 *
 * @param {number} count
 * @returns {string} e.g. `۱٬۲۳۴ نویسه`
 */
export function formatCharacterCount(count) {
    return `${formatNumber(count)} نویسه`;
}

/**
 * Size limit sentence for the Visual Intel uploader.
 *
 * @param {number} maxBytes
 * @returns {string} e.g. `حجم تصویر باید کمتر از ۱۰ مگابایت باشد.`
 */
export function formatMaxImageSize(maxBytes) {
    const mb = Math.round(Number(maxBytes) / (1024 * 1024));
    return `حجم تصویر باید کمتر از ${formatNumber(mb)} مگابایت باشد.`;
}
