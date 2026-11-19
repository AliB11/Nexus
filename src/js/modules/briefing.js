/**
 * Module 01 — OSINT Strategic Briefing.
 *
 * Sends a web-grounded `generateContent` request (Google Search tool enabled),
 * renders the Markdown report with its verified citations, and exposes the
 * result to the archive and to the Signal Matrix.
 */
import { els } from "../core/dom.js";
import { state } from "../core/state.js";
import { api } from "../api/client.js";
import { escapeHtml, safeUrl } from "../core/sanitize.js";
import { renderMarkdown } from "../core/markdown.js";
import { copyToClipboard } from "../core/clipboard.js";
import { hideError, showError, showToast } from "../core/toast.js";
import { blockReason, extractSources, firstText } from "../api/gemini.js";
import { registerAction, invokeAction } from "../core/bus.js";
import { formatUtcTimestamp } from "../core/format.js";
import { BRIEFING_SYSTEM_PROMPT, buildBriefingQuery } from "../core/prompts.js";
import { persistDossiers } from "../services/dossiers.js";
export function renderBriefing(dossier) {
    els.briefingEmpty.classList.add("hidden");
    els.briefingOutput.classList.remove("hidden");

    els.briefingBadgeFocus.textContent = dossier.focus.toUpperCase();
    els.briefingTimestamp.textContent = dossier.timestamp;
    els.briefingResultTitle.textContent = dossier.topic;
    els.briefingContent.innerHTML = renderMarkdown(dossier.rawText);

    // Render verified web citations
    if (dossier.sources && dossier.sources.length > 0) {
        els.briefingSourcesCard.classList.remove("hidden");
        els.sourcesCountBadge.textContent = `${dossier.sources.length} VERIFIED`;
        els.briefingSourcesGrid.innerHTML = dossier.sources
            .map(
                (src, idx) => `
                <a href="${safeUrl(src.uri)}" target="_blank" rel="noopener noreferrer"
                    class="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 hover:bg-cyan-500/10 border border-slate-200 dark:border-obsidian-700 hover:border-cyan-500/30 transition-all group">
                    <div class="min-w-0">
                        <div class="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-cyan-600 dark:group-hover:text-cyan-300 truncate">${escapeHtml(src.title)}</div>
                        <div class="text-[11px] font-mono text-slate-400 truncate">${escapeHtml(src.uri)}</div>
                    </div>
                    <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-obsidian-800 text-slate-500 shrink-0">#${idx + 1}</span>
                </a>
            `
            )
            .join("");
    } else {
        els.briefingSourcesCard.classList.add("hidden");
    }
}

export async function handleBriefingSubmit(e) {
    e.preventDefault();
    hideError();

    const topic = els.briefingTopic.value.trim();
    const focus = els.briefingFocus.value;
    if (!topic) return;

    els.generateBriefingBtn.disabled = true;
    els.briefingEmpty.classList.add("hidden");
    els.briefingOutput.classList.add("hidden");
    els.briefingLoader.classList.remove("hidden");

    const systemPrompt = BRIEFING_SYSTEM_PROMPT;

    const userQuery = buildBriefingQuery({ topic, focus });

    try {
        const payload = {
            contents: [{ parts: [{ text: userQuery }] }],
            tools: [{ google_search: {} }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
        };

        const result = await api.generate(payload);
        const candidate = result.candidates?.[0];
        const text = firstText(result);

        if (!text) {
            const blocked = blockReason(result);
            throw new Error(
                blocked
                    ? `The model returned no text (finish reason: ${blocked}). Try a narrower topic.`
                    : "No intelligence synthesis returned from the model. Please refine your query."
            );
        }

        const sources = extractSources(candidate);
        const timestamp = formatUtcTimestamp();

        const dossier = {
            id: "dos_" + Date.now(),
            topic,
            focus,
            timestamp,
            rawText: text,
            sources
        };

        state.currentBriefing = dossier;
        renderBriefing(dossier);
    } catch (err) {
        showError(`Briefing generation failed: ${err.message}`);
        els.briefingEmpty.classList.remove("hidden");
    } finally {
        els.briefingLoader.classList.add("hidden");
        els.generateBriefingBtn.disabled = false;
    }
}

/**
 * Wires Module 01 and publishes the actions other modules can call.
 */
export function initBriefing() {
    registerAction("briefing:render", (dossier) => {
        state.currentBriefing = dossier;
        renderBriefing(dossier);
    });

    els.briefingForm.addEventListener("submit", handleBriefingSubmit);
    els.presetBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            els.briefingTopic.value = btn.dataset.preset;
            els.briefingForm.dispatchEvent(new Event("submit"));
        });
    });

    els.copyBriefingBtn.addEventListener("click", () => {
        if (!state.currentBriefing) return;
        const fullReport = `# ${state.currentBriefing.topic}\nFocus: ${state.currentBriefing.focus} | ${state.currentBriefing.timestamp}\n\n${state.currentBriefing.rawText}`;
        copyToClipboard(fullReport);
    });

    els.saveDossierBtn.addEventListener("click", () => {
        if (!state.currentBriefing) return;
        const exists = state.dossiers.some((d) => d.id === state.currentBriefing.id);
        if (exists) {
            showToast("Dossier is already in your archive.", "info");
            return;
        }
        state.dossiers.unshift(state.currentBriefing);
        persistDossiers();
        showToast("Dossier archived locally.", "success");
    });

    els.sendToMatrixBtn.addEventListener("click", () => {
        if (!state.currentBriefing) return;
        invokeAction("matrix:runFromText", state.currentBriefing);
    });
}
