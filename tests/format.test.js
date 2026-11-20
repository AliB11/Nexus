import test from "node:test";
import assert from "node:assert/strict";

import {
    formatCharacterCount,
    formatFileSize,
    formatMaxImageSize,
    formatModelLabel,
    formatNumber,
    formatUtcClock,
    formatUtcTimestamp
} from "../src/js/core/format.js";

test("formatModelLabel produces a compact uppercase display name", () => {
    assert.equal(formatModelLabel("gemini-3-flash-preview"), "GEMINI 3 FLASH");
    assert.equal(formatModelLabel("gemini-2.5-flash"), "GEMINI 2.5 FLASH");
    assert.equal(formatModelLabel("gemini-2.5-pro-latest"), "GEMINI 2.5 PRO");
    assert.equal(formatModelLabel("models/gemini_exp".split("/").pop()), "GEMINI");
});

test("formatModelLabel tolerates empty input", () => {
    assert.equal(formatModelLabel(""), "");
    assert.equal(formatModelLabel(undefined), "");
});

test("formatUtcTimestamp matches the dossier timestamp format", () => {
    const date = new Date("2026-11-19T23:15:04.500Z");
    assert.equal(formatUtcTimestamp(date), "2026-11-19 23:15 UTC");
});

test("formatUtcClock renders HH:MM:SS UTC", () => {
    assert.equal(formatUtcClock(new Date("2026-11-19T07:08:09.000Z")), "07:08:09 UTC");
});

test("formatFileSize scales units and clamps bad input", () => {
    assert.equal(formatFileSize(512), "512 B");
    assert.equal(formatFileSize(1536), "1.5 KB");
    assert.equal(formatFileSize(5 * 1024 * 1024), "5.0 MB");
    assert.equal(formatFileSize(-1), "0 KB");
    assert.equal(formatFileSize(Number.NaN), "0 KB");
});

test("formatCharacterCount labels the matrix textarea in Persian digits", () => {
    assert.equal(formatCharacterCount(0), "۰ نویسه");
    assert.equal(formatCharacterCount(1234), "۱٬۲۳۴ نویسه");
});

test("formatNumber renders Persian digits and degrades without fa-IR locale data", () => {
    assert.equal(formatNumber(0), "۰");
    assert.equal(formatNumber(10), "۱۰");
    assert.equal(formatNumber(Number.NaN), "۰", "non-finite input must not print NaN");
    assert.equal(formatNumber(Number.POSITIVE_INFINITY), "۰");
});

test("formatMaxImageSize states the upload ceiling in megabytes", () => {
    assert.equal(formatMaxImageSize(10 * 1024 * 1024), "حجم تصویر باید کمتر از ۱۰ مگابایت باشد.");
});
