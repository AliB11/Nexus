import test from "node:test";
import assert from "node:assert/strict";

import { renderMarkdown } from "../src/js/core/markdown.js";

test("renders the three ATX heading levels the briefings use", () => {
    const html = renderMarkdown("# Title\n## Section\n### Subsection");
    assert.match(html, /<h2[^>]*>Title<\/h2>/);
    assert.match(html, /<h3[^>]*>Section<\/h3>/);
    assert.match(html, /<h4[^>]*>Subsection<\/h4>/);
});

test("groups consecutive bullets into a single list", () => {
    const html = renderMarkdown("- alpha\n- beta\n* gamma\n• delta");
    assert.equal(html.match(/<ul/g).length, 1);
    assert.equal(html.match(/<li>/g).length, 4);
    assert.match(html, /<li>alpha<\/li>/);
    assert.match(html, /<li>delta<\/li>/);
});

test("renders numbered items as a decimal list", () => {
    const html = renderMarkdown("1. first\n2. second");
    assert.match(html, /list-decimal/);
    assert.equal(html.match(/<li>/g).length, 2);
});

test("closes an open list when a paragraph follows", () => {
    const html = renderMarkdown("- item\n\nTrailing analysis.");
    assert.match(html, /<\/ul>/);
    assert.match(html, /<p[^>]*>Trailing analysis\.<\/p>/);
});

test("formats inline bold, italic and code", () => {
    const html = renderMarkdown("**strong** and *emphasis* and `mono`");
    assert.match(html, /<strong[^>]*>strong<\/strong>/);
    assert.match(html, /<em[^>]*>emphasis<\/em>/);
    assert.match(html, /<code[^>]*>mono<\/code>/);
});

test("escapes model output before formatting — no raw HTML can reach the DOM", () => {
    const html = renderMarkdown('## Report\n<img src=x onerror="steal()">\n<script>alert(1)</' + "script>");
    assert.ok(!html.includes("<img"));
    assert.ok(!html.includes("<script"));
    assert.match(html, /&lt;img src=x onerror=/);
    assert.match(html, /<h3[^>]*>Report<\/h3>/);
});

test("escapes markup hidden inside inline formatting", () => {
    const html = renderMarkdown("**<svg onload=alert(1)>**");
    assert.ok(!html.includes("<svg"));
    assert.match(html, /<strong[^>]*>&lt;svg onload=alert\(1\)&gt;<\/strong>/);
});

test("returns an empty string for empty input", () => {
    assert.equal(renderMarkdown(""), "");
    assert.equal(renderMarkdown(null), "");
    assert.equal(renderMarkdown(undefined), "");
});
