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
    // Limit 2 lands on the model turn first; the user-first guarantee then
    // drops it, leaving only the freshest question.
    assert.deepEqual(history, [turn("user", "3")]);
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

test("trimChatHistory never leaves the history opening with a model turn", () => {
    // 5 turns trimmed to 4 leaves the assistant reply first — `generateContent`
    // answers that with a 400, so the leading non-user turn must go too.
    const history = [turn("user", "1"), turn("model", "2"), turn("user", "3"), turn("model", "4"), turn("user", "5")];
    trimChatHistory(history, 4);
    assert.equal(history[0].role, "user", "the payload must open with a user turn");
    assert.deepEqual(history, [turn("user", "3"), turn("model", "4"), turn("user", "5")]);
});

test("trimChatHistory drops an orphan assistant head entirely", () => {
    const history = [turn("model", "reply with no question")];
    trimChatHistory(history, 10);
    assert.deepEqual(history, []);
});
