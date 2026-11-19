import test from "node:test";
import assert from "node:assert/strict";

import { escapeHtml, safeUrl } from "../src/js/core/sanitize.js";

test("escapeHtml encodes every character that can break out of an attribute or text node", () => {
    assert.equal(
        escapeHtml(`<img src=x onerror="alert('&')">`),
        "&lt;img src=x onerror=&quot;alert(&#039;&amp;&#039;)&quot;&gt;"
    );
});

test("escapeHtml coerces non-strings", () => {
    assert.equal(escapeHtml(42), "42");
    assert.equal(escapeHtml(null), "null");
    assert.equal(escapeHtml(undefined), "undefined");
});

test("safeUrl allows http, https and mailto", () => {
    assert.equal(safeUrl("https://example.com/report"), "https://example.com/report");
    assert.equal(safeUrl("http://example.com"), "http://example.com/");
    assert.equal(safeUrl("mailto:desk@example.com"), "mailto:desk@example.com");
});

test("safeUrl blocks script-executing and embedded-content schemes", () => {
    assert.equal(safeUrl("javascript:alert(1)"), "#");
    assert.equal(safeUrl("JaVaScRiPt:alert(1)"), "#");
    assert.equal(safeUrl("data:text/html;base64,PHNjcmlwdD4="), "#");
    assert.equal(safeUrl("vbscript:msgbox(1)"), "#");
});

test("safeUrl keeps relative and fragment targets", () => {
    assert.equal(safeUrl("/dossier/12"), "/dossier/12");
    assert.equal(safeUrl("#sources"), "#sources");
    assert.equal(safeUrl("./assets/report.pdf"), "./assets/report.pdf");
});

test("safeUrl normalises and then escapes markup inside an otherwise valid URL", () => {
    // `new URL()` percent-encodes the quotes, escapeHtml() then encodes the ampersand,
    // so the value is safe to drop straight into an href attribute.
    assert.equal(safeUrl('https://example.com/?q="x"&y=1'), "https://example.com/?q=%22x%22&amp;y=1");
});

test("safeUrl degrades to a dead link on empty or unparsable input", () => {
    assert.equal(safeUrl(""), "#");
    assert.equal(safeUrl(null), "#");
    assert.equal(safeUrl(undefined), "#");
});
