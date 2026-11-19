import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
    ANALYST_SYSTEM_PROMPT,
    BRIEFING_SYSTEM_PROMPT,
    VISUAL_MODE_DIRECTIVES,
    buildBriefingQuery,
    buildMatrixPrompt,
    buildVisualPrompt
} from "../src/js/core/prompts.js";

test("the briefing system prompt keeps the report structure the UI renders", () => {
    for (const section of [
        "## Executive Summary",
        "## Current Situation & Key Signals",
        "## Risk & Opportunity Assessment",
        "## Strategic Implications",
        "## Recommended Next Actions"
    ]) {
        assert.ok(BRIEFING_SYSTEM_PROMPT.includes(section), `missing section: ${section}`);
    }
});

test("buildBriefingQuery embeds the topic and the selected focus", () => {
    const query = buildBriefingQuery({ topic: "Nordic grid interconnectors", focus: "Geopolitical & Regulatory" });
    assert.match(query, /Geopolitical & Regulatory intelligence briefing/);
    assert.match(query, /"Nordic grid interconnectors"/);
});

test("buildMatrixPrompt carries the source material verbatim", () => {
    const sourceText = "Port congestion rose 14% month-over-month.";
    const prompt = buildMatrixPrompt({ sourceText });
    assert.ok(prompt.endsWith(sourceText));
    assert.match(prompt, /extract structured strategic signals/);
});

test("buildVisualPrompt selects the directive for the mode", () => {
    assert.match(buildVisualPrompt({ mode: "chart", customQuery: "" }), /axis labels/);
    assert.match(buildVisualPrompt({ mode: "document", customQuery: "" }), /OCR/);
    assert.match(buildVisualPrompt({ mode: "anomaly", customQuery: "" }), /anomalies/);
    assert.match(buildVisualPrompt({ mode: "comprehensive", customQuery: "" }), /Visual Intelligence Briefing/);
});

test("buildVisualPrompt falls back to the comprehensive directive for unknown modes", () => {
    assert.equal(buildVisualPrompt({ mode: "does-not-exist", customQuery: "" }), VISUAL_MODE_DIRECTIVES.comprehensive);
});

test("buildVisualPrompt appends a custom analyst question when present", () => {
    const prompt = buildVisualPrompt({ mode: "chart", customQuery: "Which quarter drops hardest?" });
    assert.match(prompt, /Specific Analyst Question: Which quarter drops hardest\?$/);
});

test("the analyst persona is defined", () => {
    assert.match(ANALYST_SYSTEM_PROMPT, /NEXUS/);
    assert.match(ANALYST_SYSTEM_PROMPT, /intelligence analyst/);
});

test("every visual mode in the markup has a matching directive", async () => {
    const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
    const panel = html.slice(
        html.indexOf('id="visualMode"'),
        html.indexOf("</select>", html.indexOf('id="visualMode"'))
    );
    const options = [...panel.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);

    assert.ok(options.length >= 4, "expected the four analysis directives in the select");
    for (const option of options) {
        assert.ok(
            Object.hasOwn(VISUAL_MODE_DIRECTIVES, option),
            `<option value="${option}"> has no entry in VISUAL_MODE_DIRECTIVES`
        );
    }
});
