/**
 * Local dossier archive (localStorage).
 *
 * Briefings can be saved for offline review. Storage is wrapped in try/catch
 * because Safari private mode and sandboxed iframes can throw on write.
 */
import { config } from "../config.js";
import { els } from "../core/dom.js";
import { state } from "../core/state.js";
import { escapeHtml } from "../core/sanitize.js";
import { invokeAction } from "../core/bus.js";
import { switchTab } from "../core/navigation.js";
import { showToast } from "../core/toast.js";
import { formatNumber } from "../core/format.js";
import { focusLabel } from "../core/labels.js";
export function loadDossiers() {
    try {
        const raw = localStorage.getItem(config.storage.dossiers);
        state.dossiers = raw ? JSON.parse(raw) : [];
    } catch (_) {
        state.dossiers = [];
    }
    renderDossierList();
}

export function persistDossiers() {
    try {
        localStorage.setItem(config.storage.dossiers, JSON.stringify(state.dossiers));
    } catch (_) {}
    renderDossierList();
}

export function renderDossierList() {
    els.dossierCount.textContent = formatNumber(state.dossiers.length);

    if (state.dossiers.length === 0) {
        els.dossierList.innerHTML = `
            <div class="p-3 rounded-xl border border-dashed border-slate-200 dark:border-obsidian-700 text-center">
                <p class="text-xs text-slate-400">هنوز پرونده‌ای بایگانی نشده است.</p>
            </div>
        `;
        return;
    }

    els.dossierList.innerHTML = "";
    state.dossiers.forEach((dossier) => {
        const item = document.createElement("div");
        item.className =
            "group p-2.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 border border-slate-200/80 dark:border-obsidian-700/70 transition-colors flex items-start justify-between gap-2 cursor-pointer";

        const info = document.createElement("div");
        info.className = "min-w-0 flex-1";
        info.innerHTML = `
            <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">${escapeHtml(dossier.topic)}</p>
            <p class="text-[10px] font-mono text-slate-400 mt-0.5">${escapeHtml(focusLabel(dossier.focus))} &middot; <span dir="ltr">${escapeHtml(dossier.timestamp)}</span></p>
        `;
        info.addEventListener("click", () => {
            state.currentBriefing = dossier;
            invokeAction("briefing:render", dossier);
            switchTab("briefing");
            showToast("پروندهٔ بایگانی‌شده بارگذاری شد.", "info");
        });

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.setAttribute("aria-label", "حذف پرونده");
        delBtn.className =
            "p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 opacity-70 group-hover:opacity-100 transition-all shrink-0";
        delBtn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`;
        delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            state.dossiers = state.dossiers.filter((d) => d.id !== dossier.id);
            persistDossiers();
            showToast("پرونده از بایگانی حذف شد.", "info");
        });

        item.appendChild(info);
        item.appendChild(delBtn);
        els.dossierList.appendChild(item);
    });
}
