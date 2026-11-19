/**
 * Non-blocking user feedback: toast notifications and the global error banner.
 *
 * `alert()` / `confirm()` are never used — they are blocked inside sandboxed
 * iframes and they stall the main thread.
 */
import { config } from "../config.js";
import { els } from "./dom.js";
/**
 * Displays a non-blocking toast notification (never uses alert()).
 */
export function showToast(message, type = "info") {
    const toast = document.createElement("div");
    const styles = {
        info: "bg-slate-900 dark:bg-obsidian-800 text-white border-cyan-500/40",
        success: "bg-emerald-950 text-emerald-100 border-emerald-500/40",
        error: "bg-rose-950 text-rose-100 border-rose-500/40"
    };
    toast.className = `pointer-events-auto px-4 py-3 rounded-xl border shadow-xl text-xs font-medium flex items-center gap-2 transition-all duration-300 ${styles[type] || styles.info}`;
    toast.textContent = message;
    els.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("opacity-0", "translate-y-2");
        setTimeout(() => toast.remove(), 300);
    }, config.ui.toastDurationMs);
}
/**
 * Shows or clears the global error banner.
 */
export function showError(msg) {
    els.globalErrorText.textContent = msg;
    els.globalError.classList.remove("hidden");
}

export function hideError() {
    els.globalError.classList.add("hidden");
}
