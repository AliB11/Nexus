/**
 * Presentation formatting helpers.
 *
 * Pure functions only — no DOM, no state — so they are trivially unit-testable
 * (`tests/format.test.js`) and reusable from any module.
 */

/**
 * Turns a model id into a compact display label:
 * `gemini-3-flash-preview` → `GEMINI 3 FLASH`.
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
 * @returns {string}
 */
export function formatCharacterCount(count) {
    return `${count} characters`;
}
