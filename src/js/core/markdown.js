/**
 * A tiny, dependency-free Markdown renderer.
 *
 * Input is HTML-escaped first, then formatted, so model output can never inject
 * markup. Supports the subset the Gemini briefings actually emit: ATX headings,
 * unordered/ordered lists, bold, italic and inline code.
 */
import { escapeHtml } from "./sanitize.js";
/**
 * Lightweight, safe Markdown-to-HTML renderer styled with Tailwind classes.
 */
export function renderMarkdown(md) {
    if (!md) return "";
    const lines = escapeHtml(md).split("\n");
    let html = "";
    let inList = false;

    const formatInline = (text) => {
        return text
            .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-900 dark:text-white">$1</strong>')
            .replace(/\*(.+?)\*/g, '<em class="italic">$1</em>')
            .replace(
                /`([^`]+)`/g,
                '<code class="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-obsidian-800 font-mono text-xs text-cyan-700 dark:text-cyan-300">$1</code>'
            );
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            if (inList) {
                html += "</ul>";
                inList = false;
            }
            continue;
        }

        // Headings
        if (line.startsWith("### ")) {
            if (inList) {
                html += "</ul>";
                inList = false;
            }
            html += `<h4 class="text-sm font-mono font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 pt-3">${formatInline(line.slice(4))}</h4>`;
        } else if (line.startsWith("## ")) {
            if (inList) {
                html += "</ul>";
                inList = false;
            }
            html += `<h3 class="text-base sm:text-lg font-bold text-slate-900 dark:text-white pt-4 pb-1 border-b border-slate-200 dark:border-obsidian-700/70">${formatInline(line.slice(3))}</h3>`;
        } else if (line.startsWith("# ")) {
            if (inList) {
                html += "</ul>";
                inList = false;
            }
            html += `<h2 class="text-lg sm:text-xl font-bold text-slate-900 dark:text-white pt-3">${formatInline(line.slice(2))}</h2>`;
        } else if (/^[-*•]\s+/.test(line)) {
            if (!inList) {
                html += '<ul class="space-y-2 pl-5 list-disc marker:text-cyan-500">';
                inList = true;
            }
            html += `<li>${formatInline(line.replace(/^[-*•]\s+/, ""))}</li>`;
        } else if (/^\d+\.\s+/.test(line)) {
            if (!inList) {
                html += '<ul class="space-y-2 pl-5 list-decimal marker:text-cyan-500 marker:font-mono">';
                inList = true;
            }
            html += `<li>${formatInline(line.replace(/^\d+\.\s+/, ""))}</li>`;
        } else {
            if (inList) {
                html += "</ul>";
                inList = false;
            }
            html += `<p class="leading-relaxed">${formatInline(line)}</p>`;
        }
    }

    if (inList) html += "</ul>";
    return html;
}
