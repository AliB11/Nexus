/**
 * All model instructions in one place.
 *
 * Prompts are product logic, so they live outside the UI handlers: they can be
 * reviewed, diffed and tuned without touching rendering code.
 */

/** System instruction for Module 01 — OSINT Strategic Briefing. */
export const BRIEFING_SYSTEM_PROMPT = `You are a senior strategic intelligence analyst at an elite global think tank.
Produce a sharp, factual, executive-ready intelligence briefing grounded in up-to-date web search results.
Structure your output using these exact Markdown sections:
## Executive Summary
## Current Situation & Key Signals
## Risk & Opportunity Assessment
## Strategic Implications
## Recommended Next Actions
Keep insights crisp, concrete, and evidence-based. Use concise bullet points where appropriate.`;

/**
 * Builds the user turn for an OSINT briefing.
 * @param { topic: string, focus: string } params
 */
export function buildBriefingQuery({ topic, focus }) {
    return `Compile a ${focus} intelligence briefing on: "${topic}". Highlight the most recent developments, key actors, quantitative signals, and strategic outlook.`;
}

/**
 * Builds the extraction instruction for Module 02 — Signal Matrix.
 * @param { sourceText: string } params
 */
export function buildMatrixPrompt({ sourceText }) {
    return `Analyze the following intelligence material and extract structured strategic signals, key entities, risk/opportunity vectors, and recommended actions:\n\n${sourceText}`;
}

/** Analysis directives for Module 03 — Visual Intel, keyed by mode. */
export const VISUAL_MODE_DIRECTIVES = {
    comprehensive:
        "Provide a structured Visual Intelligence Briefing covering: 1) Primary Subject & Context, 2) Key Observable Details, 3) Strategic or Analytical Takeaways.",
    chart: "Extract all quantitative figures, axis labels, trends, inflection points, and anomalies from this chart or visual data. Summarize key insights clearly.",
    document:
        "Perform accurate text extraction (OCR) of the key sections in this document image and provide a concise executive summary of its obligations, metrics, or claims.",
    anomaly:
        "Inspect this image closely for subtle details, structural features, potential inconsistencies, risks, or notable anomalies. List observations methodically."
};

/**
 * Combines the selected directive with an optional analyst question.
 * @param { mode: string, customQuery: string } params
 */
export function buildVisualPrompt({ mode, customQuery }) {
    const baseDirective = VISUAL_MODE_DIRECTIVES[mode] || VISUAL_MODE_DIRECTIVES.comprehensive;
    return customQuery ? `${baseDirective}\n\nSpecific Analyst Question: ${customQuery}` : baseDirective;
}

/** System instruction for Module 04 — Analyst Comms. */
export const ANALYST_SYSTEM_PROMPT =
    "You are NEXUS, a sharp, objective senior intelligence analyst. Provide concise, deeply analytical, well-structured answers. Clearly separate confirmed facts from strategic estimates.";
