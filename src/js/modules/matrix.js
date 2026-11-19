/**
 * Module 02 — Signal Matrix.
 *
 * Converts unstructured text into a strict JSON object using Gemini structured
 * output (`responseMimeType` + `responseSchema`), then renders threat level,
 * sentiment, confidence, entities, opportunities, risks and action items.
 */
import { els } from "../core/dom.js";
import { api } from "../api/client.js";
import { escapeHtml } from "../core/sanitize.js";
import { hideError, showError, showToast } from "../core/toast.js";
import { blockReason, firstText } from "../api/gemini.js";
import { registerAction } from "../core/bus.js";
import { switchTab } from "../core/navigation.js";
import { buildMatrixPrompt } from "../core/prompts.js";
import { formatCharacterCount } from "../core/format.js";

/**
 * Structured-output contract enforced by the Gemini API.
 * Keeping it as a constant makes the extraction schema reviewable at a glance.
 */
export const MATRIX_RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
        headline: { type: "STRING" },
        threatLevel: { type: "STRING", description: "One of: Low, Moderate, Elevated, Critical" },
        sentiment: { type: "STRING", description: "One of: Positive, Neutral, Negative, Mixed" },
        confidenceScore: { type: "NUMBER", description: "Confidence score from 0 to 100" },
        entities: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    name: { type: "STRING" },
                    category: {
                        type: "STRING",
                        description: "Organization, Person, Location, Technology, or Regulation"
                    },
                    relevance: { type: "STRING" }
                },
                propertyOrdering: ["name", "category", "relevance"]
            }
        },
        strengthsOrOpportunities: {
            type: "ARRAY",
            items: { type: "STRING" }
        },
        risksOrThreats: {
            type: "ARRAY",
            items: { type: "STRING" }
        },
        actionItems: {
            type: "ARRAY",
            items: { type: "STRING" }
        }
    },
    propertyOrdering: [
        "headline",
        "threatLevel",
        "sentiment",
        "confidenceScore",
        "entities",
        "strengthsOrOpportunities",
        "risksOrThreats",
        "actionItems"
    ]
};
export function renderMatrixResult(data) {
    els.matrixOutput.classList.remove("hidden");

    // Threat Level Badge Styling
    const threat = (data.threatLevel || "Moderate").toUpperCase();
    const threatStyles = {
        LOW: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
        MODERATE: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30",
        ELEVATED: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30",
        CRITICAL: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
    };
    els.matrixThreatBadge.className = `mt-2 inline-flex items-center px-3 py-1 rounded-lg text-xs font-mono font-bold tracking-wider ${threatStyles[threat] || threatStyles.MODERATE}`;
    els.matrixThreatBadge.textContent = threat;

    // Sentiment & Confidence
    els.matrixSentiment.textContent = data.sentiment || "Neutral";
    const confidence = Math.max(0, Math.min(100, Math.round(Number(data.confidenceScore) || 75)));
    els.matrixConfidenceVal.textContent = `${confidence}%`;
    els.matrixConfidenceBar.style.width = `${confidence}%`;

    // Headline
    els.matrixHeadline.textContent = data.headline || "Structured Signal Analysis";

    // Entities
    const entities = Array.isArray(data.entities) ? data.entities : [];
    els.matrixEntitiesGrid.innerHTML = entities.length
        ? entities
              .map(
                  (ent) => `
            <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-obsidian-700">
                <div class="flex items-center justify-between gap-2 mb-1">
                    <span class="font-semibold text-sm text-slate-900 dark:text-white truncate">${escapeHtml(ent.name)}</span>
                    <span class="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 text-[10px] font-mono uppercase shrink-0">${escapeHtml(ent.category)}</span>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">${escapeHtml(ent.relevance)}</p>
            </div>
        `
              )
              .join("")
        : `<p class="text-xs text-slate-400 col-span-full">No distinct entities detected.</p>`;

    // Opportunities
    const opps = Array.isArray(data.strengthsOrOpportunities) ? data.strengthsOrOpportunities : [];
    els.matrixOpportunitiesList.innerHTML = opps
        .map(
            (item) =>
                `<li class="flex items-start gap-2"><span class="text-emerald-500 font-bold mt-0.5">+</span><span>${escapeHtml(item)}</span></li>`
        )
        .join("");

    // Risks
    const risks = Array.isArray(data.risksOrThreats) ? data.risksOrThreats : [];
    els.matrixRisksList.innerHTML = risks
        .map(
            (item) =>
                `<li class="flex items-start gap-2"><span class="text-rose-500 font-bold mt-0.5">!</span><span>${escapeHtml(item)}</span></li>`
        )
        .join("");

    // Action Items
    const actions = Array.isArray(data.actionItems) ? data.actionItems : [];
    els.matrixActionsList.innerHTML = actions
        .map((item) => `<li class="leading-relaxed">${escapeHtml(item)}</li>`)
        .join("");
}

export async function handleMatrixSubmit(e) {
    e.preventDefault();
    hideError();

    const sourceText = els.matrixInput.value.trim();
    if (!sourceText) return;

    els.extractMatrixBtn.disabled = true;
    els.matrixOutput.classList.add("hidden");
    els.matrixLoader.classList.remove("hidden");

    const payload = {
        contents: [
            {
                parts: [
                    {
                        text: buildMatrixPrompt({ sourceText })
                    }
                ]
            }
        ],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: MATRIX_RESPONSE_SCHEMA
        }
    };

    try {
        const result = await api.generate(payload);
        const jsonText = firstText(result);
        if (!jsonText) {
            const blocked = blockReason(result);
            throw new Error(
                blocked
                    ? `The model blocked this extraction (finish reason: ${blocked}).`
                    : "Structured extraction returned empty data."
            );
        }

        let parsed;
        try {
            parsed = JSON.parse(jsonText);
        } catch {
            throw new Error("The model did not return valid JSON. Please retry the extraction.");
        }
        renderMatrixResult(parsed);
    } catch (err) {
        showError(`Signal extraction failed: ${err.message}`);
    } finally {
        els.matrixLoader.classList.add("hidden");
        els.extractMatrixBtn.disabled = false;
    }
}

/**
 * Wires Module 02 and publishes `matrix:runFromText` for the briefing module.
 */
export function initMatrix() {
    registerAction("matrix:runFromText", (briefing) => {
        els.matrixInput.value = `TOPIC: ${briefing.topic}\n\n${briefing.rawText}`;
        els.matrixCharCount.textContent = formatCharacterCount(els.matrixInput.value.length);
        switchTab("matrix");
        els.matrixForm.dispatchEvent(new Event("submit"));
    });

    els.matrixForm.addEventListener("submit", handleMatrixSubmit);
    els.matrixInput.addEventListener("input", () => {
        els.matrixCharCount.textContent = formatCharacterCount(els.matrixInput.value.length);
    });
    els.loadSampleTextBtn.addEventListener("click", () => {
        els.matrixInput.value = `FIELD REPORT // Q4 MARITIME & SEMICONDUCTOR LOGISTICS\nPort congestion across Southeast Asian transshipment hubs rose 14% month-over-month due to rerouted container traffic and seasonal weather delays. Major foundry suppliers in Taiwan and South Korea report steady wafer output, though advanced packaging lead times remain extended by 6-8 weeks. Meanwhile, European industrial automation firms are accelerating dual-sourcing agreements with North American and Japanese component manufacturers to mitigate single-corridor exposure. Regulatory audits on cross-border export controls are expected to tighten in Q1, creating compliance overhead for mid-tier logistics integrators while favoring vertically integrated Tier-1 operators.`;
        els.matrixCharCount.textContent = formatCharacterCount(els.matrixInput.value.length);
        showToast("Sample field report loaded.", "info");
    });
}
