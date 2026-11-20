/**
 * All model instructions in one place.
 *
 * Prompts are product logic, so they live outside the UI handlers: they can be
 * reviewed, diffed and tuned without touching rendering code.
 *
 * LANGUAGE: the UI is Persian, so every prompt asks for Persian output. The
 * *contract* stays English where code depends on it — JSON field names and the
 * `threatLevel` / `sentiment` enums — and `core/labels.js` translates those
 * enums at render time.
 */
import { focusLabel } from "./labels.js";

/** System instruction for Module 01 — OSINT Strategic Briefing. */
export const BRIEFING_SYSTEM_PROMPT = `تو یک تحلیل‌گر ارشد اطلاعات راهبردی در یک اندیشکدهٔ معتبر جهانی هستی.
یک گزارش اطلاعاتی دقیق، مستند و مناسب سطح اجرایی تولید کن که بر پایهٔ نتایج به‌روز جست‌وجوی وب باشد.
خروجی را دقیقاً با همین سرفصل‌های مارک‌داون بنویس:
## خلاصهٔ اجرایی
## وضعیت کنونی و سیگنال‌های کلیدی
## ارزیابی ریسک و فرصت
## پیامدهای راهبردی
## اقدامات پیشنهادی
بینش‌ها را موجز، مشخص و مبتنی بر شواهد نگه دار و در صورت لزوم از فهرست‌های گلوله‌ای کوتاه استفاده کن.
همهٔ متن را به فارسی روان و رسمی بنویس؛ نام‌های خاص، نام سازمان‌ها و اصطلاحات فنی می‌توانند به زبان اصلی بمانند.
اعداد را با رقم لاتین بنویس تا با سبک نمایش داده‌ها در رابط کاربری یکسان بماند.`;

/**
 * Builds the user turn for an OSINT briefing.
 * @param {{ topic: string, focus: string }} params `focus` is the stored English
 *   enum value; it is localised here so the model reads a Persian instruction.
 */
export function buildBriefingQuery({ topic, focus }) {
    return `یک گزارش اطلاعاتی با تمرکز «${focusLabel(focus)}» دربارهٔ «${topic}» تهیه کن. جدیدترین تحولات، بازیگران کلیدی، سیگنال‌های کمّی و چشم‌انداز راهبردی را برجسته کن.`;
}

/**
 * Builds the extraction instruction for Module 02 — Signal Matrix.
 * @param {{ sourceText: string }} params
 */
export function buildMatrixPrompt({ sourceText }) {
    return `متن اطلاعاتی زیر را تحلیل کن و سیگنال‌های راهبردی ساختاریافته، نهادها و اشخاص کلیدی، بردارهای ریسک و فرصت و اقدامات پیشنهادی را استخراج کن.
همهٔ مقادیر متنی خروجی (headline، relevance، strengthsOrOpportunities، risksOrThreats، actionItems) را به زبان فارسی بنویس.
مقادیر threatLevel و sentiment را فقط از میان گزینه‌های انگلیسی مجاز انتخاب کن.

${sourceText}`;
}

/** Analysis directives for Module 03 — Visual Intel, keyed by mode. */
export const VISUAL_MODE_DIRECTIVES = {
    comprehensive:
        "یک گزارش اطلاعاتی بصری ساختاریافته ارائه کن که این بخش‌ها را پوشش دهد: ۱) موضوع اصلی و زمینه، ۲) جزئیات قابل‌مشاهدهٔ کلیدی، ۳) نتیجه‌گیری راهبردی یا تحلیلی.",
    chart: "همهٔ اعداد کمّی، برچسب محورها، روندها، نقاط عطف و ناهنجاری‌های این نمودار یا دادهٔ بصری را استخراج کن و بینش‌های کلیدی را به‌روشنی خلاصه کن.",
    document:
        "متن بخش‌های کلیدی این سند را با دقت استخراج کن (OCR) و خلاصهٔ اجرایی موجزی از تعهدات، شاخص‌ها یا ادعاهای آن ارائه بده.",
    anomaly:
        "این تصویر را با دقت برای جزئیات ظریف، ویژگی‌های ساختاری، ناسازگاری‌های احتمالی، ریسک‌ها یا ناهنجاری‌های قابل‌توجه بررسی کن و مشاهدات را به‌شیوهٔ فهرست‌وار بیان کن."
};

/**
 * Combines the selected directive with an optional analyst question.
 * @param {{ mode: string, customQuery: string }} params
 */
export function buildVisualPrompt({ mode, customQuery }) {
    const baseDirective = VISUAL_MODE_DIRECTIVES[mode] || VISUAL_MODE_DIRECTIVES.comprehensive;
    return customQuery
        ? `${baseDirective}\n\nپرسش مشخص تحلیل‌گر: ${customQuery}\n\nپاسخ را به زبان فارسی بنویس.`
        : `${baseDirective}\n\nپاسخ را به زبان فارسی بنویس.`;
}

/** System instruction for Module 04 — Analyst Comms. */
export const ANALYST_SYSTEM_PROMPT =
    "تو NEXUS هستی، یک تحلیل‌گر ارشد اطلاعاتی تیزبین و بی‌طرف. پاسخ‌های موجز، عمیقاً تحلیلی و ساختاریافته بده و واقعیت‌های تأییدشده را به‌روشنی از برآوردهای راهبردی جدا کن. همیشه به زبان فارسی پاسخ بده؛ اصطلاحات فنی و نام‌های خاص می‌توانند به زبان اصلی بمانند.";
