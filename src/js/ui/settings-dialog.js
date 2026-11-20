/**
 * Engine settings dialog — provider, API key, base URL, model, and a
 * connection test.
 *
 * A static site has no server to hold a secret, so NEXUS asks the person using
 * it for their own credentials and keeps them in that browser only. The sidebar
 * always shows which gateway and model are live.
 *
 * The three credential fields are independent on purpose: Coarena, OpenRouter or
 * a self-hosted proxy all speak the same OpenAI protocol, so pointing NEXUS at
 * one of them is a matter of typing a different URL — no code change.
 */
import { byId, els } from "../core/dom.js";
import { registerAction } from "../core/bus.js";
import { showToast } from "../core/toast.js";
import { escapeHtml } from "../core/sanitize.js";
import { config } from "../config.js";
import {
    clearApiKey,
    getApiKey,
    getBaseUrl,
    getModel,
    getProvider,
    hasApiKey,
    isKeyInjected,
    maskKey,
    providerDefaults,
    saveSettings
} from "../services/settings.js";
import { PROVIDERS, PROVIDER_ORDER, getProviderDefinition, testConnection } from "../services/provider.js";
import { formatModelLabel, formatNumber } from "../core/format.js";

/** Chip styling per connection state. */
const CHIP_STYLES = {
    ready: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
    injected: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30",
    missing: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
};

/** Result box styling for the connection test. */
const RESULT_STYLES = {
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
    fail: "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300",
    busy: "border-cyan-500/30 bg-cyan-500/10 text-cyan-800 dark:text-cyan-300"
};

let lastFocused = null;

/**
 * Models offered before the live catalogue has been fetched.
 *
 * `config.api.modelSuggestions` is a list of ids; the picker renders
 * `{ id, label }` entries, so the seeds are normalised here — and
 * `renderModelOptions()` accepts either shape to stay safe against a host that
 * overrides the config with objects.
 *
 * @type {Array<{ id: string, label: string }>}
 */
let knownModels = (config.api.modelSuggestions || []).map((entry) => toModelEntry(entry)).filter(Boolean);

/**
 * Default hint under the key field: where the value lives, in plain words.
 * @returns {string}
 */
function storedHint() {
    return `فقط در همین مرورگر ذخیره می‌شود (localStorage → "${config.storage.settings}").`;
}

/**
 * Fills the provider `<select>` from the registry, so adding a gateway never
 * means editing markup.
 */
function renderProviderOptions() {
    if (!els.apiKeyProviderSelect) return;
    els.apiKeyProviderSelect.innerHTML = PROVIDER_ORDER.map(
        (id) =>
            `<option value="${id}">${escapeHtml(PROVIDERS[id].label)} — ${escapeHtml(PROVIDERS[id].description)}</option>`
    ).join("");
}

/**
 * Re-renders the copy that depends on the chosen gateway: notes, placeholders
 * and the link to where a key is issued.
 *
 * @param {string} providerId
 */
function renderProviderCopy(providerId) {
    const definition = getProviderDefinition(providerId);
    const defaults = providerDefaults(definition.id);

    if (els.apiKeyProviderNote) {
        els.apiKeyProviderNote.innerHTML = `${escapeHtml(definition.note)} <a href="${definition.docsUrl}" target="_blank" rel="noopener noreferrer" class="text-cyan-600 dark:text-cyan-400 underline">مستندات درگاه</a>`;
    }
    if (els.apiKeyKeyHint) {
        els.apiKeyKeyHint.innerHTML = `${escapeHtml(definition.keyHint)} <a href="${definition.keyUrl}" target="_blank" rel="noopener noreferrer" class="text-cyan-600 dark:text-cyan-400 underline">دریافت کلید</a>`;
    }
    if (els.apiKeyInput) els.apiKeyInput.placeholder = definition.id === "google" ? "AIza…" : "coa_…";
    if (els.apiKeyBaseUrlInput) els.apiKeyBaseUrlInput.placeholder = defaults.baseUrl;
    if (els.apiKeyModelInput) els.apiKeyModelInput.placeholder = defaults.model;
}

/**
 * Normalises one catalogue entry — a bare id string or `{ id, label }`.
 *
 * @param {string | { id?: string, label?: string, display_name?: string } | null} entry
 * @returns {{ id: string, label: string } | null} `null` when there is no usable id
 */
function toModelEntry(entry) {
    if (typeof entry === "string") {
        const id = entry.trim();
        return id ? { id, label: id } : null;
    }
    const id = String(entry?.id || "").trim();
    if (!id) return null;
    return { id, label: String(entry?.label || entry?.display_name || id) };
}

/**
 * Fills the model field's suggestion list. An entry without an id would render
 * as the literal string "undefined" in the picker, so it is dropped.
 *
 * @param {Array<string | { id?: string, label?: string }>} models
 */
function renderModelOptions(models) {
    if (!els.apiKeyModelOptions) return;
    els.apiKeyModelOptions.innerHTML = (models || [])
        .map(toModelEntry)
        .filter(Boolean)
        .map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.label)}</option>`)
        .join("");
}

/**
 * Syncs the sidebar engine read-out with the current settings.
 */
export function refreshEngineStatus() {
    if (els.engineModelLabel) {
        const label = `${getProviderDefinition().label} · ${formatModelLabel(getModel())}`;
        els.engineModelLabel.textContent = label;
        els.engineModelLabel.title = `${getBaseUrl()} → ${getModel()}`;
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
 * Writes a message into the test-result box.
 *
 * @param {"ok" | "fail" | "busy"} tone
 * @param {string} html
 */
function setTestResult(tone, html) {
    const box = els.apiKeyTestResult;
    if (!box) return;
    box.className = `mt-2.5 text-xs leading-relaxed rounded-lg border px-3 py-2 ${RESULT_STYLES[tone]}`;
    box.innerHTML = html;
    box.classList.remove("hidden");
}

/** Hides the test-result box. */
function clearTestResult() {
    els.apiKeyTestResult?.classList.add("hidden");
}

/**
 * Reads the form as it stands — the test must probe what the analyst typed,
 * not what was saved last time.
 *
 * @returns {{ provider: string, apiKey: string, baseUrl: string, model: string }}
 */
function readForm() {
    return {
        provider: els.apiKeyProviderSelect?.value || getProvider(),
        apiKey: isKeyInjected() ? getApiKey() : (els.apiKeyInput?.value || "").trim(),
        baseUrl: (els.apiKeyBaseUrlInput?.value || "").trim(),
        model: (els.apiKeyModelInput?.value || "").trim()
    };
}

/**
 * Runs the connection test against the form values.
 */
async function runConnectionTest() {
    const button = els.apiKeyTestBtn;
    const form = readForm();

    if (!form.baseUrl) {
        setTestResult("fail", "نشانی درگاه خالی است.");
        els.apiKeyBaseUrlInput?.focus();
        return;
    }
    if (!form.apiKey) {
        setTestResult("fail", "کلید API خالی است؛ بدون کلید نمی‌توان اتصال را آزمود.");
        els.apiKeyInput?.focus();
        return;
    }

    if (button) {
        button.disabled = true;
        button.dataset.label = button.textContent;
        button.textContent = "در حال تست…";
    }
    setTestResult("busy", `در حال تماس با <span dir="ltr">${escapeHtml(form.baseUrl)}</span> …`);

    try {
        const result = await testConnection(form);

        // The gateway's own catalogue is the best suggestion list there is.
        if (result.models?.length) {
            knownModels = result.models.map(toModelEntry).filter(Boolean);
            renderModelOptions(knownModels);
        }

        const latency = `${formatNumber(result.latencyMs)} میلی‌ثانیه`;
        const models = result.models?.length ? `${formatNumber(result.models.length)} مدل در فهرست درگاه` : "";
        const meta = [latency, models].filter(Boolean).join(" · ");

        // A near-miss model id is corrected in place, so the analyst can save
        // straight away instead of retyping it.
        if (result.suggestedModel && els.apiKeyModelInput) {
            els.apiKeyModelInput.value = result.suggestedModel;
        }

        if (result.ok) {
            setTestResult(
                "ok",
                `<span class="font-bold">اتصال برقرار است.</span> ${escapeHtml(result.message)}<br><span class="opacity-80">${escapeHtml(meta)} — مدل پاسخ‌دهنده: </span><span dir="ltr">${escapeHtml(result.model)}</span>`
            );
        } else {
            setTestResult(
                "fail",
                `<span class="font-bold">اتصال ناموفق بود.</span> ${escapeHtml(result.message)}${meta ? `<br><span class="opacity-80">${escapeHtml(meta)}</span>` : ""}`
            );
        }
    } catch (err) {
        setTestResult(
            "fail",
            `<span class="font-bold">تست اجرا نشد:</span> ${escapeHtml(err?.message || "خطای نامشخص")}`
        );
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = button.dataset.label || "تست اتصال";
            delete button.dataset.label;
        }
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
    const provider = getProvider();

    if (els.apiKeyProviderSelect) els.apiKeyProviderSelect.value = provider;
    renderProviderCopy(provider);
    renderModelOptions(knownModels);

    els.apiKeyInput.value = injected ? "" : getApiKey();
    els.apiKeyInput.disabled = injected;
    if (els.apiKeyBaseUrlInput) els.apiKeyBaseUrlInput.value = getBaseUrl();
    if (els.apiKeyModelInput) els.apiKeyModelInput.value = getModel();

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

    clearTestResult();
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
 * Persists the dialog inputs after validating them.
 */
function saveFromDialog() {
    const form = readForm();

    if (!isKeyInjected() && !form.apiKey && !hasApiKey()) {
        showToast("یک کلید API وارد کنید، یا این پنجره را ببندید تا رابط را بدون اتصال مرور کنید.", "error");
        els.apiKeyInput.focus();
        return;
    }

    if (!/^https?:\/\/[^\s]+$/i.test(form.baseUrl)) {
        showToast("نشانی درگاه باید با http:// یا https:// شروع شود.", "error");
        els.apiKeyBaseUrlInput?.focus();
        return;
    }

    if (!form.model) {
        showToast("شناسهٔ مدل را وارد کنید.", "error");
        els.apiKeyModelInput?.focus();
        return;
    }

    saveSettings({
        provider: form.provider,
        apiKey: isKeyInjected() ? undefined : form.apiKey,
        baseUrl: form.baseUrl,
        model: form.model
    });
    refreshEngineStatus();
    closeSettingsDialog();
    showToast(
        !isKeyInjected() && form.apiKey ? "تنظیمات درگاه در همین مرورگر ذخیره شد." : "تنظیمات موتور به‌روزرسانی شد.",
        "success"
    );
}

/**
 * Switching gateway resets the URL and model to that gateway's defaults — but
 * only when the current values still belong to the previous one, so a custom
 * proxy URL typed by hand is never thrown away.
 */
function handleProviderChange() {
    const next = els.apiKeyProviderSelect.value;
    const previous = getProvider();
    if (next === previous) return;

    renderProviderCopy(next);
    clearTestResult();

    const previousDefaults = providerDefaults(previous);
    const nextDefaults = providerDefaults(next);
    const baseUrl = els.apiKeyBaseUrlInput.value.trim();
    const model = els.apiKeyModelInput.value.trim();

    if (!baseUrl || baseUrl === previousDefaults.baseUrl) els.apiKeyBaseUrlInput.value = nextDefaults.baseUrl;
    if (!model || model === previousDefaults.model) els.apiKeyModelInput.value = nextDefaults.model;
}

/**
 * Wires the dialog, the sidebar status chip and the `apikey:prompt` action that
 * the API client triggers when a request is attempted without credentials.
 */
export function initSettingsDialog() {
    registerAction("apikey:prompt", () => openSettingsDialog({ reason: "این درخواست به اعتبارنامه نیاز دارد." }));

    renderProviderOptions();
    renderProviderCopy(getProvider());
    renderModelOptions(knownModels);

    els.apiKeySettingsBtn.addEventListener("click", () => {
        isSettingsDialogOpen() ? closeSettingsDialog() : openSettingsDialog();
    });
    els.apiKeyProviderSelect?.addEventListener("change", handleProviderChange);
    els.apiKeyTestBtn?.addEventListener("click", runConnectionTest);
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

    // Enter saves from any field, except the model field where it may be picking
    // a suggestion from the datalist.
    for (const field of [els.apiKeyInput, els.apiKeyBaseUrlInput, els.apiKeyModelInput]) {
        field?.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                saveFromDialog();
            }
        });
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeSettingsDialog();
        trapFocus(event);
    });

    refreshEngineStatus();
}
