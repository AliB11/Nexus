/**
 * NEXUS — application entry point.
 *
 * Boot order matters: theme (before first paint settles) → clock → settings →
 * archive → feature modules → shell events. Modules publish their cross-module
 * actions during `init*()`, so anything invoked later through the bus is already
 * registered.
 *
 * Loaded as `<script type="module">`, which defers execution until the document
 * has been parsed — no DOMContentLoaded wrapper needed.
 */
import { config } from "./config.js";
import { assertElements, els } from "./core/dom.js";
import { state } from "./core/state.js";
import { startClock } from "./core/clock.js";
import { hideError, showError } from "./core/toast.js";
import { initTheme, toggleTheme } from "./core/theme.js";
import { closeMobileSidebar, openMobileSidebar, switchTab } from "./core/navigation.js";
import { loadDossiers } from "./services/dossiers.js";
import { hasApiKey, isKeyInjected } from "./services/settings.js";
import { initSettingsDialog, openSettingsDialog } from "./ui/settings-dialog.js";
import { initBriefing } from "./modules/briefing.js";
import { initMatrix } from "./modules/matrix.js";
import { initVisual } from "./modules/visual.js";
import { initComms } from "./modules/comms.js";

/** Elements that must exist for the shell to work at all. */
const REQUIRED_ELEMENTS = [
    "sidebar",
    "sidebarBackdrop",
    "mobileMenuBtn",
    "themeToggleBtn",
    "globalError",
    "globalErrorText",
    "dismissErrorBtn",
    "toastContainer",
    "apiKeyModal",
    "apiKeySettingsBtn"
];

/**
 * Shell-level interactions: theme, mobile drawer, tabs and the error banner.
 */
function bindShellEvents() {
    // Theme & Mobile Drawer
    els.themeToggleBtn.addEventListener("click", toggleTheme);
    els.mobileMenuBtn.addEventListener("click", () => {
        const isClosed = els.sidebar.classList.contains("-translate-x-full");
        isClosed ? openMobileSidebar() : closeMobileSidebar();
    });
    els.sidebarBackdrop.addEventListener("click", closeMobileSidebar);
    els.dismissErrorBtn.addEventListener("click", hideError);

    // Tab Switching
    els.navTabs.forEach((btn) => {
        btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });
}

/**
 * Surfaces anything that escapes a module's own try/catch instead of failing
 * silently in the console.
 */
function registerGlobalErrorHandlers() {
    window.addEventListener("error", (event) => {
        if (event.message) showError(`Unexpected error: ${event.message}`);
    });

    window.addEventListener("unhandledrejection", (event) => {
        const reason = event.reason;
        showError(`Unexpected error: ${reason?.message || reason || "unknown rejection"}`);
    });
}

/**
 * Starts the application.
 */
export function boot() {
    assertElements(els, REQUIRED_ELEMENTS);

    initTheme();
    startClock(config.ui.clockIntervalMs);
    initSettingsDialog();
    loadDossiers();

    initBriefing();
    initMatrix();
    initVisual();
    initComms();

    bindShellEvents();
    registerGlobalErrorHandlers();
    switchTab(state.activeTab);

    // Nothing works without credentials, so ask for them up front (once).
    if (!hasApiKey() && !isKeyInjected()) {
        openSettingsDialog({ reason: "NEXUS needs a Gemini API key to run live analysis." });
    }

    document.documentElement.dataset.nexusReady = "true";
}

try {
    boot();
} catch (err) {
    // The shell itself failed — report it on the page rather than only in the console.
    document.documentElement.dataset.nexusReady = "false";
    showError(`NEXUS failed to start: ${err?.message || err}`);
    console.error("[NEXUS] boot failure", err);
}
