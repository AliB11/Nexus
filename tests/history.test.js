import test from "node:test";
import assert from "node:assert/strict";

import { trimChatHistory } from "../src/js/core/history.js";

/** @returns {{ role: string, parts: Array<{ text: string }> }} */
const turn = (role, text) => ({ role, parts: [{ text }] });

test("trimChatHistory drops the oldest turns above the limit", () => {
    const history = [turn("user", "1"), turn("model", "2"), turn("user", "3"), turn("model", "4")];
    trimChatHistory(history, 2);
    assert.deepEqual(history, [turn("user", "3"), turn("model", "4")]);
});

test("trimChatHistory mutates in place so the payload keeps its reference", () => {
    const history = [turn("user", "1"), turn("model", "2"), turn("user", "3")];
    const same = trimChatHistory(history, 2);
    assert.equal(same, history, "must return the same array instance");
    assert.equal(history.length, 2);
});

test("trimChatHistory leaves short conversations untouched", () => {
    const history = [turn("user", "only")];
    trimChatHistory(history, 30);
    assert.equal(history.length, 1);
});

test("trimChatHistory ignores non-positive or invalid limits", () => {
    const history = [turn("user", "1"), turn("model", "2")];
    trimChatHistory(history, 0);
    assert.equal(history.length, 2);
    trimChatHistory(history, -5);
    assert.equal(history.length, 2);
    trimChatHistory(history, Number.NaN);
    assert.equal(history.length, 2);
});

test("trimChatHistory survives non-array input", () => {
    assert.equal(trimChatHistory(undefined, 10), undefined);
    assert.equal(trimChatHistory(null, 10), null);
});
