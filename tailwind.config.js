/**
 * Tailwind CSS configuration.
 *
 * `content` must include the JavaScript sources as well as the markup: NEXUS
 * builds a lot of its DOM from template strings (toasts, threat badges, dossier
 * rows, chat bubbles, active nav states), so those class names only exist in
 * `src/js/**`. Missing them here would silently drop styles from the build.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
    darkMode: "class",
    content: ["./src/**/*.{html,js}"],
    theme: {
        extend: {
            fontFamily: {
                /* Vazirmatn carries the Persian UI; Inter and Tahoma are the
                   Latin / offline fallbacks, in that order. */
                sans: ["Vazirmatn", "Inter", "Segoe UI", "Tahoma", "system-ui", "sans-serif"],
                mono: ["JetBrains Mono", "Vazirmatn", "Tahoma", "monospace"]
            },
            colors: {
                /** NEXUS dark-shell palette ("obsidian"). */
                obsidian: {
                    950: "#070B12",
                    900: "#0D131F",
                    850: "#131B2C",
                    800: "#1A2438",
                    700: "#26344F"
                }
            }
        }
    },
    plugins: []
};
