/**
 * Engine settings dialog — API key + model selection.
 *
 * A static site has no server to hold a secret, so NEXUS asks the person using
 * it for their own key, keeps it in that browser only, and surfaces the current
 * connection state in the sidebar at all times.
 */
import { byId, els } from "../core/dom.js";
import { registerAction } from "../core/bus.js";
import { showToast } from "../core/toast.js";
import { config } from "../config.js";
import {
    clearApiKey,
    getApiKey,
    getModel,
    hasApiKey,
    isKeyInjected,
    maskKey,
    saveSettings
} from "../services/settings.js";

import { formatModelLabel } from "../core/format.js";

/** Chip styling per connection state. */
const CHIP_STYLES = {
    ready: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
    injected: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30",
    missing: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
};

let lastFocused = null;

/**
 * Default hint under the key field: where the value lives, in plain words.
 * @returns {string}
 */
function storedHint() {
    return `فقط در همین مرورگر ذخیره می‌شود (localStorage → "${config.storage.settings}").`;
}

/**
 * Syncs the sidebar engine read-out with the current settings.
 */
export function refreshEngineStatus() {
    if (els.engineModelLabel) {
        els.engineModelLabel.textContent = formatModelLabel(getModel());
        els.engineModelLabel.title = getModel();
    }

    const chip = els.apiKeyStatusChip;
    if (!chip) return;

    if (isKeyInjected()) {
        chip.textContent = "تزریق‌شده";
        chip.className = `text-[10px] font-bold px-1.5 py-0.5 rounded-md ${CHIP_STYLES.injected}`;
    } else if (hasApiKey()) {
        chip.textContent = "تنظیم‌شده";
        chip.className = `text-[10px] font-bold px-1.5 py-0.5 rounded-md ${CHIP_STYLES.ready}`;
    } else {
        chip.textContent = "ناموجود";
        chip.className = `text-[10px] font-bold px-1.5 py-0.5 rounded-md ${CHIP_STYLES.missing}`;
    }
}

/**
 * Opens the dialog, pre-filled with the stored values.
 * @param {{ reason?: string }} [options]
 */
export function openSettingsDialog(options = {}) {
    if (!els.apiKeyModal) return;

    lastFocused = document.activeElement;
    const injected = isKeyInjected();

    els.apiKeyInput.value = injected ? "" : getApiKey();
    els.apiKeyInput.disabled = injected;
    els.apiKeyInput.placeholder = injected ? "توسط صفحهٔ میزبان تأمین شده است" : "AIza…";
    els.apiKeyModelInput.value = getModel();
    els.apiKeyClearBtn.disabled = injected || !getApiKey();
    els.apiKeyClearBtn.classList.toggle("opacity-40", els.apiKeyClearBtn.disabled);

    els.apiKeyModalHint.textContent = injected
        ? "یک کلید از سوی صفحهٔ میزبان تزریق شده و بر هر مقدار ذخیره‌شده در این مرورگر اولویت دارد."
        : getApiKey()
          ? `فقط در همین مرورگر ذخیره شده: ${maskKey(getApiKey())}`
          : storedHint();

    if (options.reason) {
        els.apiKeyModalHint.textContent = `${options.reason} ${els.apiKeyModalHint.textContent}`;
    }

    els.apiKeyModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    els.apiKeyInput.focus();
    if (!injected) els.apiKeyInput.select();
}

/**
 * Closes the dialog and restores focus.
 */
export function closeSettingsDialog() {
    if (!els.apiKeyModal || els.apiKeyModal.classList.contains("hidden")) return;

    els.apiKeyModal.classList.add("hidden");
    document.body.style.overflow = "";
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
}

/**
 * @returns {boolean} whether the dialog is currently open.
 */
export function isSettingsDialogOpen() {
    return Boolean(els.apiKeyModal && !els.apiKeyModal.classList.contains("hidden"));
}

/**
 * Keeps Tab focus inside the dialog while it is open.
 * @param {KeyboardEvent} event
 */
function trapFocus(event) {
    if (event.key !== "Tab" || !isSettingsDialogOpen()) return;

    const focusable = els.apiKeyModalCard.querySelectorAll(
        "button:not([disabled]), input:not([disabled]), a[href], select, textarea"
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

/**
 * Persists the dialog inputs.
 */
function saveFromDialog() {
    const model = els.apiKeyModelInput.value.trim();
    const key = els.apiKeyInput.value.trim();

    if (!isKeyInjected() && !key && !hasApiKey()) {
        showToast("یک کلید API وارد کنید، یا این پنجره را ببندید تا رابط را بدون اتصال مرور کنید.", "error");
        els.apiKeyInput.focus();
        return;
    }

    saveSettings({ apiKey: isKeyInjected() ? undefined : key, model });
    refreshEngineStatus();
    closeSettingsDialog();
    showToast(
        key && !isKeyInjected() ? "کلید API در همین مرورگر ذخیره شد." : "تنظیمات موتور به‌روزرسانی شد.",
        "success"
    );
}

/**
 * Wires the dialog, the sidebar status chip and the `apikey:prompt` action that
 * the API client triggers when a request is attempted without credentials.
 */
export function initSettingsDialog() {
    registerAction("apikey:prompt", () => openSettingsDialog({ reason: "این درخواست به اعتبارنامه نیاز دارد." }));

    els.apiKeySettingsBtn.addEventListener("click", () => {
        isSettingsDialogOpen() ? closeSettingsDialog() : openSettingsDialog();
    });
    els.apiKeySaveBtn.addEventListener("click", saveFromDialog);
    els.apiKeyCancelBtn.addEventListener("click", closeSettingsDialog);
    els.apiKeyClearBtn.addEventListener("click", () => {
        clearApiKey();
        els.apiKeyInput.value = "";
        refreshEngineStatus();
        showToast("کلید API ذخیره‌شده از این مرورگر حذف شد.", "info");
        els.apiKeyModalHint.textContent = storedHint();
    });

    byId("apiKeyModalBackdrop")?.addEventListener("click", closeSettingsDialog);

    els.apiKeyInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            saveFromDialog();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeSettingsDialog();
        trapFocus(event);
    });

    refreshEngineStatus();
}
