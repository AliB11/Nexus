/**
 * Module 02 — Signal Matrix.
 *
 * Converts unstructured text into a strict JSON object using Gemini structured
 * output (`responseMimeType` + `responseSchema`), then renders threat level,
 * sentiment, confidence, entities, opportunities, risks and action items.
 *
 * LANGUAGE: the schema keeps English field names and English enum values for
 * `threatLevel`, `sentiment` and `category` — those are part of the API
 * contract and of any archived data. `core/labels.js` translates them at render
 * time, while every free-text field is requested in Persian by
 * `buildMatrixPrompt()`.
 */
import { els } from "../core/dom.js";
import { escapeHtml } from "../core/sanitize.js";
import { hideError, showError, showToast } from "../core/toast.js";
import { runRequest } from "../services/provider.js";
import { registerAction } from "../core/bus.js";
import { switchTab } from "../core/navigation.js";
import { buildMatrixPrompt } from "../core/prompts.js";
import { formatCharacterCount } from "../core/format.js";
import { categoryLabel, sentimentLabel, threatLabel } from "../core/labels.js";
import { MATRIX_RESPONSE_SCHEMA } from "../core/schema.js";

// Re-exported so `modules/matrix.js` remains the module's public surface.
export { MATRIX_RESPONSE_SCHEMA };

/** A representative Persian intelligence note for the «load sample» button. */
export const SAMPLE_FIELD_NOTE = `گزارش میدانی // سه‌ماههٔ چهارم — لجستیک دریایی و نیمه‌رسانا
تراکم بنادر در hubهای ترانشیپ جنوب‌شرقی آسیا به‌دلیل تغییر مسیر ترافیک کانتینری و تأخیرهای فصلی آب‌وهوا، ۱۴ درصد نسبت به ماه قبل افزایش یافت. تأمین‌کنندگان اصلی ریخته‌گری در تایوان و کرهٔ جنوبی از خروجی پایدار ویفر گزارش می‌دهند، اما زمان تحویل بسته‌بندی پیشرفته همچنان ۶ تا ۸ هفته تمدید شده است. هم‌زمان، شرکت‌های اتوماسیون صنعتی اروپا در حال تسریع توافق‌های تأمین دوگانه با تولیدکنندگان قطعه در آمریکای شمالی و ژاپن هستند تا وابستگی به یک دالان واحد را کاهش دهند. انتظار می‌رود ممیزی‌های مقرراتی کنترل صادرات فرامرزی در سه‌ماههٔ اول سخت‌گیرانه‌تر شود و بار انطباق را برای یکپارچه‌سازان لجستیک میان‌رده افزایش دهد، در حالی که به نفع بازیگران یکپارچهٔ سطح یک تمام می‌شود.`;

export function renderMatrixResult(data) {
    els.matrixOutput.classList.remove("hidden");

    // Threat Level Badge Styling
    const threat = String(data.threatLevel || "Moderate").toUpperCase();
    const threatStyles = {
        LOW: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
        MODERATE: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30",
        ELEVATED: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30",
        CRITICAL: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
    };
    els.matrixThreatBadge.className = `mt-2 inline-flex items-center px-3 py-1 rounded-lg text-sm font-bold ${threatStyles[threat] || threatStyles.MODERATE}`;
    els.matrixThreatBadge.textContent = threatLabel(threat);

    // Sentiment & Confidence
    els.matrixSentiment.textContent = sentimentLabel(data.sentiment);
    const confidence = Math.max(0, Math.min(100, Math.round(Number(data.confidenceScore) || 75)));
    els.matrixConfidenceVal.textContent = `${confidence}%`;
    els.matrixConfidenceBar.style.width = `${confidence}%`;

    // Headline
    els.matrixHeadline.textContent = data.headline || "تحلیل ساختاریافتهٔ سیگنال";

    // Entities
    const entities = Array.isArray(data.entities) ? data.entities : [];
    els.matrixEntitiesGrid.innerHTML = entities.length
        ? entities
              .map(
                  (ent) => `
            <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-obsidian-700">
                <div class="flex items-center justify-between gap-2 mb-1">
                    <span class="font-semibold text-sm text-slate-900 dark:text-white truncate">${escapeHtml(ent.name)}</span>
                    <span class="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 text-[10px] shrink-0">${escapeHtml(categoryLabel(ent.category))}</span>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">${escapeHtml(ent.relevance)}</p>
            </div>
        `
              )
              .join("")
        : `<p class="text-xs text-slate-400 col-span-full">نهاد متمایزی شناسایی نشد.</p>`;

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

    try {
        // The gateway enforces the schema (Coarena reports `json_schema_enforced`),
        // so the model cannot drift into prose here.
        const result = await runRequest({
            messages: [{ role: "user", text: buildMatrixPrompt({ sourceText }) }],
            jsonSchema: MATRIX_RESPONSE_SCHEMA
        });
        const jsonText = result.text;
        if (!jsonText) {
            throw new Error(
                result.finishReason
                    ? `مدل این استخراج را مسدود کرد (دلیل پایان: ${result.finishReason}).`
                    : "استخراج ساختاریافته دادهٔ خالی برگرداند."
            );
        }

        let parsed;
        try {
            parsed = JSON.parse(jsonText);
        } catch {
            throw new Error("مدل JSON معتبر برنگرداند. استخراج را دوباره تلاش کنید.");
        }
        renderMatrixResult(parsed);
    } catch (err) {
        showError(`استخراج سیگنال ناموفق بود: ${err.message}`);
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
        els.matrixInput.value = `موضوع: ${briefing.topic}\n\n${briefing.rawText}`;
        els.matrixCharCount.textContent = formatCharacterCount(els.matrixInput.value.length);
        switchTab("matrix");
        els.matrixForm.dispatchEvent(new Event("submit"));
    });

    els.matrixForm.addEventListener("submit", handleMatrixSubmit);
    els.matrixInput.addEventListener("input", () => {
        els.matrixCharCount.textContent = formatCharacterCount(els.matrixInput.value.length);
    });
    els.loadSampleTextBtn.addEventListener("click", () => {
        els.matrixInput.value = SAMPLE_FIELD_NOTE;
        els.matrixCharCount.textContent = formatCharacterCount(els.matrixInput.value.length);
        showToast("گزارش میدانی نمونه بارگذاری شد.", "info");
    });
}
