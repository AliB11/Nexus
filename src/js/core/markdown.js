/**
 * A tiny, dependency-free Markdown renderer.
 *
 * Input is HTML-escaped *first*, then formatted, so model output can never inject
 * markup. Supports the subset the Gemini briefings actually emit: ATX headings,
 * unordered and ordered lists, blockquotes, horizontal rules, bold, italic,
 * inline code and links.
 *
 * Links are the one place where escaping is not enough, so every `href` goes
 * through `safeUrl()` (scheme allowlist) and opens with `rel="noopener noreferrer"`.
 */
import { escapeHtml, safeUrl, unescapeHtml } from "./sanitize.js";

const LINK_CLASSES =
    "text-cyan-700 dark:text-cyan-300 underline decoration-cyan-500/40 underline-offset-2 hover:decoration-cyan-500 break-words";

/**
 * Lightweight, safe Markdown-to-HTML renderer styled with Tailwind classes.
 *
 * @param {string} md Raw (untrusted) Markdown.
 * @returns {string} HTML safe to assign to `innerHTML`.
 */
export function renderMarkdown(md) {
    if (!md) return "";
    const lines = escapeHtml(md).split("\n");
    let html = "";
    /** @type {null | "ul" | "ol"} */
    let openList = null;

    const closeList = () => {
        if (!openList) return;
        html += `</${openList}>`;
        openList = null;
    };

    const openListOf = (type) => {
        if (openList === type) return;
        closeList();
        html +=
            type === "ol"
                ? '<ol class="space-y-2 ps-5 list-decimal marker:text-cyan-500 marker:font-mono">'
                : '<ul class="space-y-2 ps-5 list-disc marker:text-cyan-500">';
        openList = type;
    };

    /**
     * Inline formatting. Links are lifted out into placeholders first so that a
     * `*` or a backtick inside a URL cannot corrupt the generated anchor.
     */
    const formatInline = (text) => {
        const links = [];
        const withPlaceholders = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, url) => {
            links.push({ label, url });
            return `\uE000NXLINK${links.length - 1}\uE001`;
        });

        const formatted = withPlaceholders
            .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-900 dark:text-white">$1</strong>')
            .replace(/\*(.+?)\*/g, '<em class="italic">$1</em>')
            .replace(
                /`([^`]+)`/g,
                '<code class="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-obsidian-800 font-mono text-xs text-cyan-700 dark:text-cyan-300" dir="ltr">$1</code>'
            );

        return formatted.replace(/\uE000NXLINK(\d+)\uE001/g, (match, index) => {
            const link = links[Number(index)];
            if (!link) return match;
            // The URL was escaped with the rest of the line; safeUrl() re-escapes
            // its output, so decode first and let the allowlist decide.
            return `<a href="${safeUrl(unescapeHtml(link.url))}" target="_blank" rel="noopener noreferrer" class="${LINK_CLASSES}">${link.label}</a>`;
        });
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            closeList();
            continue;
        }

        // Horizontal rule
        if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line)) {
            closeList();
            html += '<hr class="my-4 border-slate-200 dark:border-obsidian-700">';
            continue;
        }

        // Headings
        if (line.startsWith("### ")) {
            closeList();
            html += `<h4 class="text-sm font-mono font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 pt-3">${formatInline(line.slice(4))}</h4>`;
        } else if (line.startsWith("## ")) {
            closeList();
            html += `<h3 class="text-base sm:text-lg font-bold text-slate-900 dark:text-white pt-4 pb-1 border-b border-slate-200 dark:border-obsidian-700/70">${formatInline(line.slice(3))}</h3>`;
        } else if (line.startsWith("# ")) {
            closeList();
            html += `<h2 class="text-lg sm:text-xl font-bold text-slate-900 dark:text-white pt-3">${formatInline(line.slice(2))}</h2>`;
        } else if (line.startsWith("&gt;")) {
            // Blockquote — the ">" arrived escaped.
            closeList();
            html += `<blockquote class="border-s-2 border-cyan-500/50 ps-3 my-2 text-slate-600 dark:text-slate-400 italic">${formatInline(line.replace(/^&gt;\s?/, ""))}</blockquote>`;
        } else if (/^[-*•]\s+/.test(line)) {
            openListOf("ul");
            html += `<li>${formatInline(line.replace(/^[-*•]\s+/, ""))}</li>`;
        } else if (/^\d+[.)]\s+/.test(line)) {
            openListOf("ol");
            html += `<li>${formatInline(line.replace(/^\d+[.)]\s+/, ""))}</li>`;
        } else {
            closeList();
            html += `<p class="leading-relaxed">${formatInline(line)}</p>`;
        }
    }

    closeList();
    return html;
}
