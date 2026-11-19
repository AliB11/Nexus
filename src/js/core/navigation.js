/**
 * Module navigation: tab switching plus the mobile sidebar drawer.
 */
import { els } from "./dom.js";
import { state } from "./state.js";
export function switchTab(tabName) {
    state.activeTab = tabName;

    els.panels.forEach((panel) => {
        panel.classList.toggle("hidden", panel.id !== `panel-${tabName}`);
    });

    els.navTabs.forEach((btn) => {
        const isActive = btn.dataset.tab === tabName;
        if (isActive) {
            btn.className =
                "nav-tab w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all text-left bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20";
        } else {
            btn.className =
                "nav-tab w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all text-left text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-obsidian-800 border border-transparent";
        }
    });

    closeMobileSidebar();
}

export function openMobileSidebar() {
    els.sidebar.classList.remove("-translate-x-full");
    els.sidebarBackdrop.classList.remove("hidden");
}

export function closeMobileSidebar() {
    els.sidebar.classList.add("-translate-x-full");
    els.sidebarBackdrop.classList.add("hidden");
}
