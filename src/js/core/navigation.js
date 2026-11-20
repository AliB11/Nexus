/**
 * Module navigation: tab switching plus the mobile sidebar drawer.
 *
 * Tab styling is owned by `.nav-tab` / `.nav-tab-active` in `styles/main.css`.
 * Rebuilding the whole `className` here (as this module used to) duplicated the
 * markup and let the two drift apart, and it also wiped `data-tab`-adjacent
 * state on every switch.
 */
import { els } from "./dom.js";
import { state } from "./state.js";

/** Class that slides the drawer off-screen on small viewports. */
export const DRAWER_CLOSED_CLASS = "drawer-closed";

export function switchTab(tabName) {
    state.activeTab = tabName;

    els.panels.forEach((panel) => {
        panel.classList.toggle("hidden", panel.id !== `panel-${tabName}`);
    });

    els.navTabs.forEach((btn) => {
        const isActive = btn.dataset.tab === tabName;
        btn.classList.toggle("nav-tab-active", isActive);
        // `aria-current` keeps screen readers in step with the visible panel.
        if (isActive) btn.setAttribute("aria-current", "page");
        else btn.removeAttribute("aria-current");
    });

    closeMobileSidebar();
}

export function openMobileSidebar() {
    els.sidebar.classList.remove(DRAWER_CLOSED_CLASS);
    els.sidebarBackdrop.classList.remove("hidden");
    els.mobileMenuBtn?.setAttribute("aria-expanded", "true");
}

export function closeMobileSidebar() {
    els.sidebar.classList.add(DRAWER_CLOSED_CLASS);
    els.sidebarBackdrop.classList.add("hidden");
    els.mobileMenuBtn?.setAttribute("aria-expanded", "false");
}

/**
 * @returns {boolean} whether the mobile drawer is currently hidden.
 */
export function isMobileSidebarClosed() {
    return els.sidebar.classList.contains(DRAWER_CLOSED_CLASS);
}
