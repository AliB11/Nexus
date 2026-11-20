import test from "node:test";
import assert from "node:assert/strict";

import {
    CATEGORY_LABELS,
    FOCUS_LABELS,
    SENTIMENT_LABELS,
    THREAT_LABELS,
    categoryLabel,
    focusLabel,
    sentimentLabel,
    threatLabel
} from "../src/js/core/labels.js";

test("threatLabel maps every API casing and falls back safely", () => {
    assert.equal(threatLabel("LOW"), "پایین");
    assert.equal(threatLabel("moderate"), "متوسط");
    assert.equal(threatLabel("  Elevated  "), "هشدار");
    assert.equal(threatLabel("critical"), "بحرانی");
    assert.equal(threatLabel("apocalyptic"), "نامشخص");
    assert.equal(threatLabel(undefined), "نامشخص");
    assert.equal(threatLabel(null), "نامشخص");
});

test("sentimentLabel maps the four schema values", () => {
    assert.equal(sentimentLabel("Positive"), "مثبت");
    assert.equal(sentimentLabel("Neutral"), "خنثی");
    assert.equal(sentimentLabel("Negative"), "منفی");
    assert.equal(sentimentLabel("Mixed"), "ترکیبی");
    assert.equal(sentimentLabel("lowercase"), "خنثی", "unknown values must not render as blank");
    assert.equal(sentimentLabel(""), "خنثی");
});

test("focusLabel localises known presets but keeps archived free-text readable", () => {
    assert.equal(focusLabel("Market & Competitive"), "بازار و رقابت");
    assert.equal(focusLabel("Executive Strategic"), "راهبردی اجرایی");
    assert.equal(focusLabel("a legacy custom focus"), "a legacy custom focus");
    assert.equal(focusLabel(undefined), "");
});

test("categoryLabel localises schema categories and passes unknown ones through", () => {
    assert.equal(categoryLabel("Organization"), "سازمان");
    assert.equal(categoryLabel("Regulation"), "مقررات");
    assert.equal(categoryLabel("Something Else"), "Something Else");
});

test("every label table covers its keys and never maps to an empty string", () => {
    for (const table of [THREAT_LABELS, SENTIMENT_LABELS, FOCUS_LABELS, CATEGORY_LABELS]) {
        for (const [key, value] of Object.entries(table)) {
            assert.ok(key.length > 0, "keys must not be empty");
            assert.ok(typeof value === "string" && value.trim().length > 0, `${key} maps to an empty label`);
        }
    }
});
