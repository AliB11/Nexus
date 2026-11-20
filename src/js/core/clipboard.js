/**
 * Clipboard writer.
 *
 * Prefers the async Clipboard API and falls back to a hidden textarea plus
 * `document.execCommand("copy")`, which still works inside sandboxed iframes
 * where `navigator.clipboard` is unavailable.
 */
import { showToast } from "./toast.js";

/**
 * Legacy fallback for contexts where the async Clipboard API is blocked.
 * @param {string} text
 * @returns {boolean}
 */
function legacyCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    let ok = false;
    try {
        ok = document.execCommand("copy");
    } catch {
        ok = false;
    }
    document.body.removeChild(textarea);
    return ok;
}

/**
 * Copies text to the clipboard and reports the outcome with a toast.
 * @param {string} text
 * @param {string} [successMessage]
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text, successMessage = "گزارش اطلاعاتی در حافظهٔ موقت کپی شد.") {
    if (!text) return false;

    let ok = false;
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            ok = true;
        } catch {
            ok = false;
        }
    }
    if (!ok) ok = legacyCopy(text);

    showToast(ok ? successMessage : "کپی خودکار متن ممکن نشد.", ok ? "success" : "error");
    return ok;
}
