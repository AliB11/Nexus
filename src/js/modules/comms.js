/**
 * Module 04 — Analyst Comms.
 *
 * A multi-turn conversation with the NEXUS analyst persona. Google Search
 * grounding is optional per message; failed turns are rolled back so the
 * transcript never desynchronises from the server-side history.
 *
 * DIRECTION: the document is RTL, so `justify-end` puts the analyst's own
 * messages on the inline-end (visually the left) and the assistant's bubbles on
 * the inline-start — the conventional Persian chat layout. Bubble corners use the
 * logical `rounded-ss-*` / `rounded-se-*` utilities so they follow the text.
 */
import { config } from "../config.js";
import { els } from "../core/dom.js";
import { state } from "../core/state.js";
import { escapeHtml, safeUrl } from "../core/sanitize.js";
import { renderMarkdown } from "../core/markdown.js";
import { hideError, showError, showToast } from "../core/toast.js";
import { runRequest } from "../services/provider.js";
import { ANALYST_SYSTEM_PROMPT } from "../core/prompts.js";
import { trimChatHistory } from "../core/history.js";

/** The live «در حال تحلیل…» bubble, or `null` when no request is in flight. */
let typingIndicator = null;

/**
 * Removes the in-flight placeholder bubble, if there is one.
 */
export function removeTypingIndicator() {
    if (!typingIndicator) return;
    typingIndicator.remove();
    typingIndicator = null;
}

/**
 * Appends a chat bubble. Model output is rendered through the safe Markdown
 * renderer and its citations are limited to `config.limits.citationDisplayMax`.
 *
 * @param {"user" | "model"} role
 * @param {string} content
 * @param {Array<{ uri: string, title: string }>} [sources]
 */
export function appendChatBubble(role, content, sources = []) {
    const wrapper = document.createElement("div");

    if (role === "user") {
        wrapper.className = "flex justify-end";
        wrapper.innerHTML = `
            <div class="max-w-2xl rounded-2xl rounded-se-none bg-gradient-to-r from-cyan-600 to-indigo-600 text-white px-4 py-3 text-sm leading-relaxed shadow-sm">
                ${escapeHtml(content)}
            </div>
        `;
    } else {
        wrapper.className = "flex items-start gap-3 max-w-3xl";
        let sourcesHtml = "";
        if (sources.length > 0) {
            sourcesHtml = `
                <div class="mt-3 pt-3 border-t border-slate-200 dark:border-obsidian-700 flex flex-wrap gap-1.5">
                    ${sources
                        .slice(0, config.limits.citationDisplayMax)
                        .map(
                            (s, i) => `
                        <a href="${safeUrl(s.uri)}" target="_blank" rel="noopener noreferrer"
                            class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-obsidian-700 text-[11px] font-mono text-cyan-700 dark:text-cyan-300 hover:border-cyan-500 transition-colors max-w-[220px] truncate">
                            <span dir="ltr">[${i + 1}]</span>
                            <span class="truncate">${escapeHtml(s.title)}</span>
                        </a>
                    `
                        )
                        .join("")}
                </div>
            `;
        }
        wrapper.innerHTML = `
            <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">NX</div>
            <div class="rounded-2xl rounded-ss-none bg-slate-100 dark:bg-obsidian-800 border border-slate-200 dark:border-obsidian-700 p-4 text-sm text-slate-700 dark:text-slate-200 space-y-2 min-w-0 flex-1">
                ${renderMarkdown(content)}
                ${sourcesHtml}
            </div>
        `;
    }

    els.chatMessages.appendChild(wrapper);
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

export function appendTypingIndicator() {
    removeTypingIndicator();

    const div = document.createElement("div");
    div.id = "chatTypingIndicator";
    div.className = "flex items-start gap-3 max-w-3xl";
    div.innerHTML = `
        <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">NX</div>
        <div class="rounded-2xl rounded-ss-none bg-slate-100 dark:bg-obsidian-800 border border-slate-200 dark:border-obsidian-700 px-4 py-3 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-cyan-500 animate-ping"></span>
            <span>در حال تحلیل پرسش اطلاعاتی…</span>
        </div>
    `;
    els.chatMessages.appendChild(div);
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    typingIndicator = div;
}

/**
 * Replaces the transcript with the greeting bubble (used on reset and on boot).
 */
function renderWelcomeBubble(title, body) {
    els.chatMessages.innerHTML = `
        <div class="flex items-start gap-3 max-w-3xl">
            <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">NX</div>
            <div class="rounded-2xl rounded-ss-none bg-slate-100 dark:bg-obsidian-800 border border-slate-200 dark:border-obsidian-700 p-4 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                <p class="font-semibold text-slate-900 dark:text-white mb-1">${escapeHtml(title)}</p>
                <p>${body}</p>
            </div>
        </div>
    `;
}

export async function handleChatSubmit(e) {
    e.preventDefault();
    hideError();

    const message = els.chatInput.value.trim();
    if (!message) return;

    els.chatInput.value = "";
    els.chatSendBtn.disabled = true;

    appendChatBubble("user", message);
    state.chatHistory.push({ role: "user", text: message });
    appendTypingIndicator();

    try {
        const result = await runRequest({
            system: ANALYST_SYSTEM_PROMPT,
            messages: state.chatHistory,
            grounding: els.chatGroundingToggle.checked
        });
        const replyText = result.text;

        if (!replyText) {
            throw new Error(
                result.finishReason
                    ? `پاسخ تحلیل‌گر مسدود شد (دلیل پایان: ${result.finishReason}).`
                    : "پاسخ تحلیل‌گر خالی بود."
            );
        }

        if (result.groundingUnavailable) {
            showToast("جست‌وجوی زنده در این درگاه در دسترس نیست؛ پاسخ از دانش مدل آمد.", "info");
        }

        state.chatHistory.push({ role: "assistant", text: replyText });
        trimChatHistory(state.chatHistory, config.limits.chatHistoryMaxMessages);

        removeTypingIndicator();
        appendChatBubble("model", replyText, result.sources);
    } catch (err) {
        removeTypingIndicator();
        state.chatHistory.pop(); // Roll back failed turn
        showError(`ارسال پیام به تحلیل‌گر ناموفق بود: ${err.message}`);
    } finally {
        els.chatSendBtn.disabled = false;
        els.chatInput.focus();
    }
}

/**
 * Wires Module 04.
 */
export function initComms() {
    els.chatForm.addEventListener("submit", handleChatSubmit);
    els.clearChatBtn.addEventListener("click", () => {
        // Drop any bubble still in flight first, otherwise the pending request
        // would re-attach a typing indicator to a transcript the user just reset.
        removeTypingIndicator();
        state.chatHistory = [];
        renderWelcomeBubble("گفت‌وگو بازنشانی شد.", "آمادهٔ یک بریفینگ اطلاعاتی تازه یا وارسی راهبردی.");
        showToast("گفت‌وگو با تحلیل‌گر پاک شد.", "info");
    });
}
