/**
 * Light/dark theme management.
 *
 * The initial class is applied by an inline snippet in `<head>` (see index.html)
 * so there is no flash of the wrong theme; this module owns every change after
 * boot and persists the choice to localStorage.
 */
import { config } from "../config.js";
export function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.classList.toggle("dark");
    try {
        localStorage.setItem(config.storage.theme, isDark ? "dark" : "light");
    } catch (_) {}
}

export function initTheme() {
    try {
        const saved = localStorage.getItem(config.storage.theme);
        if (saved === "light") {
            document.documentElement.classList.remove("dark");
        } else {
            document.documentElement.classList.add("dark");
        }
    } catch (_) {}
}

/**
 * @returns {"dark" | "light"} the currently active theme.
 */
export function getTheme() {
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
