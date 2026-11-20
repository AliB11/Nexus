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
import { CATEGORY_LABELS, FOCUS_LABELS, SENTIMENT_LABELS, THREAT_LABELS } from "../src/js/core/labels.js";
import { MATRIX_RESPONSE_SCHEMA } from "../src/js/core/schema.js";

/**
 * The whole UI is Persian, so the prompts are too. These tests guard the two
 * things that must not drift: the Markdown contract the renderer styles, and the
 * English enum values that `core/labels.js` translates at render time.
 */

test("the briefing system prompt keeps the report structure the UI renders", () => {
    for (const section of [
        "## خلاصهٔ اجرایی",
        "## وضعیت کنونی و سیگنال‌های کلیدی",
        "## ارزیابی ریسک و فرصت",
        "## پیامدهای راهبردی",
        "## اقدامات پیشنهادی"
    ]) {
        assert.ok(BRIEFING_SYSTEM_PROMPT.includes(section), `missing section: ${section}`);
    }
    assert.match(BRIEFING_SYSTEM_PROMPT, /به فارسی/, "the briefing must be requested in Persian");
});

test("buildBriefingQuery embeds the topic and localises the selected focus", () => {
    const query = buildBriefingQuery({ topic: "Nordic grid interconnectors", focus: "Geopolitical & Regulatory" });
    assert.match(query, /«ژئوپلیتیک و مقررات»/, "the stored enum value must be shown to the model in Persian");
    assert.match(query, /«Nordic grid interconnectors»/, "the analyst's topic must survive verbatim");
    assert.ok(!query.includes("Geopolitical & Regulatory"), "the raw enum must not leak into the prompt");
});

test("buildMatrixPrompt carries the source material verbatim and pins the JSON contract", () => {
    const sourceText = "تراکم بنادر ۱۴ درصد افزایش یافت.";
    const prompt = buildMatrixPrompt({ sourceText });
    assert.ok(prompt.endsWith(sourceText), "the pasted material must be the last thing the model reads");
    assert.match(prompt, /threatLevel و sentiment/, "the enum fields must stay English");
    assert.match(prompt, /فارسی/, "free-text output must be requested in Persian");
});

test("buildVisualPrompt selects the directive for the mode", () => {
    assert.match(buildVisualPrompt({ mode: "chart", customQuery: "" }), /برچسب محورها/);
    assert.match(buildVisualPrompt({ mode: "document", customQuery: "" }), /OCR/);
    assert.match(buildVisualPrompt({ mode: "anomaly", customQuery: "" }), /ناهنجاری/);
    assert.match(buildVisualPrompt({ mode: "comprehensive", customQuery: "" }), /گزارش اطلاعاتی بصری/);
});

test("buildVisualPrompt always asks for a Persian answer", () => {
    for (const mode of [...Object.keys(VISUAL_MODE_DIRECTIVES), "does-not-exist"]) {
        assert.match(buildVisualPrompt({ mode, customQuery: "" }), /پاسخ را به زبان فارسی بنویس/);
    }
});

test("buildVisualPrompt falls back to the comprehensive directive for unknown modes", () => {
    const prompt = buildVisualPrompt({ mode: "does-not-exist", customQuery: "" });
    assert.ok(prompt.startsWith(VISUAL_MODE_DIRECTIVES.comprehensive));
});

test("buildVisualPrompt appends a custom analyst question when present", () => {
    const prompt = buildVisualPrompt({ mode: "chart", customQuery: "کدام سه‌ماهه بیشترین افت را دارد؟" });
    assert.match(prompt, /پرسش مشخص تحلیل‌گر: کدام سه‌ماهه بیشترین افت را دارد؟/);
    assert.ok(prompt.indexOf("پرسش مشخص تحلیل‌گر") > prompt.indexOf(VISUAL_MODE_DIRECTIVES.chart));
});

test("the analyst persona is defined and speaks Persian", () => {
    assert.match(ANALYST_SYSTEM_PROMPT, /NEXUS/, "the persona keeps its Latin brand name");
    assert.match(ANALYST_SYSTEM_PROMPT, /تحلیل‌گر ارشد اطلاعاتی/);
    assert.match(ANALYST_SYSTEM_PROMPT, /همیشه به زبان فارسی پاسخ بده/);
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

test("every briefing focus in the markup has a Persian label", async () => {
    const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
    const panel = html.slice(
        html.indexOf('id="briefingFocus"'),
        html.indexOf("</select>", html.indexOf('id="briefingFocus"'))
    );
    const options = [...panel.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);

    assert.equal(options.length, 4, "Module 01 ships four focus presets");
    for (const option of options) {
        assert.ok(Object.hasOwn(FOCUS_LABELS, option), `<option value="${option}"> has no Persian label`);
    }
});

test("the JSON schema enums and their Persian labels stay in sync", () => {
    const threatEnum = MATRIX_RESPONSE_SCHEMA.properties.threatLevel.description.match(/One of: (.+)$/)[1];
    for (const value of threatEnum.split(",").map((v) => v.trim().toUpperCase())) {
        assert.ok(Object.hasOwn(THREAT_LABELS, value), `threatLevel "${value}" has no Persian label`);
    }

    const sentimentEnum = MATRIX_RESPONSE_SCHEMA.properties.sentiment.description.match(/One of: (.+)$/)[1];
    for (const value of sentimentEnum.split(",").map((v) => v.trim())) {
        assert.ok(Object.hasOwn(SENTIMENT_LABELS, value), `sentiment "${value}" has no Persian label`);
    }

    const categoryEnum =
        MATRIX_RESPONSE_SCHEMA.properties.entities.items.properties.category.description.match(/One of: (.+)$/)[1];
    for (const value of categoryEnum.split(",").map((v) => v.trim())) {
        assert.ok(Object.hasOwn(CATEGORY_LABELS, value), `category "${value}" has no Persian label`);
    }
});
