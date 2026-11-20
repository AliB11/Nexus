/**
 * Persian display labels.
 *
 * Values that travel over the wire stay English on purpose: the Gemini
 * `responseSchema` enums (`Low`/`Moderate`/…, `Positive`/`Neutral`/…) and the
 * `focus` values stored in archived dossiers are part of the data contract.
 * Translating them would break older localStorage records and make the schema
 * harder to validate. Only this rendering layer localises them.
 */

/** Module 02 threat levels, keyed by the upper-cased API value. */
export const THREAT_LABELS = {
    LOW: "پایین",
    MODERATE: "متوسط",
    ELEVATED: "هشدار",
    CRITICAL: "بحرانی"
};

/** Module 02 sentiment values, keyed by the API value. */
export const SENTIMENT_LABELS = {
    Positive: "مثبت",
    Neutral: "خنثی",
    Negative: "منفی",
    Mixed: "ترکیبی"
};

/** Module 01 briefing focus values (the `<option value="…">` set). */
export const FOCUS_LABELS = {
    "Executive Strategic": "راهبردی اجرایی",
    "Market & Competitive": "بازار و رقابت",
    "Cyber & Technical": "سایبری و فنی",
    "Geopolitical & Regulatory": "ژئوپلیتیک و مقررات"
};

/** Module 03 analysis directives. */
export const VISUAL_MODE_LABELS = {
    comprehensive: "گزارش جامع اطلاعات بصری",
    chart: "استخراج کمّی داده و نمودار",
    document: "استخراج متن سند (OCR)",
    anomaly: "وارسی جزئیات و ناهنجاری‌ها"
};

/** Module 02 entity categories, keyed by the schema value. */
export const CATEGORY_LABELS = {
    Organization: "سازمان",
    Person: "شخص",
    Location: "مکان",
    Technology: "فناوری",
    Regulation: "مقررات"
};

/**
 * @param {string} value API entity category.
 * @returns {string} Persian label, or the original value when it is not one of
 *   the five schema categories (the model occasionally invents a close variant).
 */
export function categoryLabel(value) {
    const key = String(value ?? "").trim();
    return CATEGORY_LABELS[key] || key;
}

/**
 * @param {string} value API threat level (any casing).
 * @returns {string} Persian label; unknown values fall back to «نامشخص».
 */
export function threatLabel(value) {
    const key = String(value ?? "")
        .trim()
        .toUpperCase();
    return THREAT_LABELS[key] || "نامشخص";
}

/**
 * @param {string} value API sentiment value.
 * @returns {string} Persian label; unknown values fall back to «خنثی».
 */
export function sentimentLabel(value) {
    const key = String(value ?? "").trim();
    return SENTIMENT_LABELS[key] || SENTIMENT_LABELS[key.toLowerCase()] || "خنثی";
}

/**
 * @param {string} value stored focus value.
 * @returns {string} Persian label, or the original value when it is not a known
 *   preset (older archives may hold free-text values).
 */
export function focusLabel(value) {
    const key = String(value ?? "").trim();
    return FOCUS_LABELS[key] || key;
}
