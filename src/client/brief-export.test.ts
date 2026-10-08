import assert from "node:assert/strict";
import { test } from "node:test";
import type { Answer, Brief, Field } from "../shared/types";
import { buildBriefPrintHtml, buildBriefSummary, escapePrintHtml, exportAnswer } from "./brief-export";

const at = Date.UTC(2026, 9, 8, 10, 0);
const field = (id: string, type: Field["type"] = "short_text", extra: Partial<Field> = {}): Field => ({
  id, type, label: `Pytanie ${id}`, required: false, origin: "agency", ...extra,
});
const answer = (value: Answer["value"], other?: string): Answer => ({ status: "answered", value, other, by: "client", at });
const brief = (): Brief => ({
  id: "b-test", title: "Strona żółtej łodzi", clientName: "Łucja i Michał", templateId: "www", createdAt: at, updatedAt: at,
  canUndo: false, sections: [{ id: "s-main", title: "Założenia", fields: [field("name")] }], answers: {},
});

test("HTML escapes editable titles, descriptions, answers and logo attributes", () => {
  const b = brief();
  b.title = '</title><script>alert("title")</script>';
  b.clientName = 'A & B <img src=x onerror="bad()">';
  b.sections[0].description = "</style><script>bad()</script>";
  b.sections[0].fields[0].label = "<svg onload='bad()'>";
  b.answers.name = answer('<script>bad()</script> https://example.com/a?b=1&c=2');
  const html = buildBriefPrintHtml(b, 'javascript:alert("logo")', at);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes('src="javascript:'));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes('href="https://example.com/a?b=1&amp;c=2"'));
  assert.equal(escapePrintHtml('"&\'<a>'), "&quot;&amp;&#39;&lt;a&gt;");
});

test("exports only visible client sections and fields, including multi-choice conditions", () => {
  const b = brief();
  b.sections[0].fields.push(
    field("toggle", "multi_choice", { options: [{ id: "yes", label: "Tak" }, { id: "no", label: "Nie" }] }),
    field("shown", "short_text", { label: "Widoczne pytanie", showIf: { fieldId: "toggle", equals: "yes" } }),
    field("hidden", "short_text", { label: "Ukryte pytanie", showIf: { fieldId: "toggle", equals: "no" } }),
  );
  b.sections.push(
    { id: "s-hidden", title: "Ukryta sekcja", showIf: { fieldId: "toggle", equals: "no" }, fields: [field("secret")] },
    { id: "s-empty", title: "Pusta sekcja", fields: [] },
  );
  b.answers.toggle = answer(["yes"]);
  b.answers.hidden = answer("Ukryta odpowiedź");
  for (const output of [buildBriefPrintHtml(b, undefined, at), buildBriefSummary(b)]) {
    assert.ok(output.includes("Widoczne pytanie"));
    assert.ok(!output.includes("Ukryte pytanie"));
    assert.ok(!output.includes("Ukryta odpowiedź"));
    assert.ok(!output.includes("Ukryta sekcja"));
    assert.ok(!output.includes("Pusta sekcja"));
    assert.ok(output.includes("Odpowiedzi: 1/3"));
  }
});

test("unknown, skipped and untouched questions are distinct in text and print counts", () => {
  const b = brief();
  b.sections[0].fields.push(field("skipped"), field("unknown"), field("done"));
  b.answers.skipped = { status: "skipped", by: "client", at };
  b.answers.unknown = { status: "unknown", by: "client", at };
  b.answers.done = answer("Gotowe");
  for (const output of [buildBriefPrintHtml(b, undefined, at), buildBriefSummary(b)]) {
    assert.ok(output.includes("Brak odpowiedzi"));
    assert.ok(output.includes("Pominięte — do uzupełnienia"));
    assert.ok(output.includes("Nie wiem — do ustalenia"));
    assert.ok(output.includes("Odpowiedzi: 1/4 · Pominięte: 1 · Nie wiem: 1 · Bez odpowiedzi: 1"));
  }
});

test("choices use labels with multiline custom choices; scales include their endpoints", () => {
  const f = field("choice", "multi_choice", { options: [{ id: "a", label: "Żółty" }, { id: "b", label: "Biały" }], allowOther: true });
  assert.equal(exportAnswer(f, answer(["a", "b", "__other"], "Łososiowy")), "Żółty\nBiały\nInne: Łososiowy");
  assert.equal(exportAnswer(field("scale", "scale", { scaleMin: "Spokojny", scaleMax: "Odważny" }), answer(4)), "4/5 (Spokojny → Odważny)");
  assert.equal(exportAnswer(field("scale", "scale"), answer(1)), "1/5 (Mało → Dużo)");
});

test("fixed options, corrections, exact deadline and consent date stay understandable", () => {
  assert.equal(exportAnswer(field("material", "material"), answer("link", "https://example.com/logo\nhttps://example.com/photo")), "Mam, podam link\nhttps://example.com/logo\nhttps://example.com/photo");
  assert.equal(exportAnswer(field("confirm", "confirm"), answer("fix", "Nowy adres")), "Trzeba poprawić:\nNowy adres");
  assert.equal(exportAnswer(field("confirm", "confirm"), answer("ok")), "Zgadza się");
  assert.equal(exportAnswer(field("area", "area"), answer("miasto", "Łódź")), "Jedno miasto\nŁódź");
  assert.match(exportAnswer(field("deadline", "deadline"), answer("data", "2026-10-20")), /Na konkretną datę: 20 października 2026/);
  assert.match(exportAnswer(field("consent", "consent"), answer("yes")), /^Potwierdzam\nData odpowiedzi: .*2026/);
});

test("multiline URLs become safe links without attaching sentence punctuation or unsafe schemes", () => {
  const b = brief();
  b.answers.name = answer("https://example.com/first.\nhttps://example.com/a_(b)\njavascript:alert(1)\nhttps://example.com/last)");
  const html = buildBriefPrintHtml(b, undefined, at);
  assert.ok(html.includes('href="https://example.com/first"'));
  assert.ok(html.includes('href="https://example.com/a_(b)"'));
  assert.ok(html.includes('href="https://example.com/last"'));
  assert.ok(!html.includes('href="javascript:'));
  assert.equal((html.match(/<a href=/g) || []).length, 3);
});

test("exports Polish text, confirmation context and metadata without brief ids or client access URLs", () => {
  const b = brief();
  b.id = "secret-brief-id";
  b.completedAt = at;
  b.sections[0].fields[0] = field("name", "confirm", { prefill: "Łódź, ul. Żółta 3" });
  b.answers.name = answer("ok");
  const html = buildBriefPrintHtml(b, "/api/account/logo?v=1", at);
  const text = buildBriefSummary(b);
  assert.ok(html.includes('lang="pl"'));
  assert.ok(html.includes('charset="utf-8"'));
  assert.ok(html.includes('src="/api/account/logo?v=1"'));
  assert.ok(html.includes("@page { size: A4;"));
  assert.ok(html.includes("break-inside: avoid"));
  for (const output of [html, text]) {
    assert.ok(output.includes("Strona żółtej łodzi"));
    assert.ok(output.includes("Łucja i Michał"));
    assert.ok(output.includes("Do potwierdzenia: Łódź, ul. Żółta 3"));
    assert.ok(output.includes("Zakończono"));
    assert.ok(!output.includes("Wysłano przez klienta"));
    assert.ok(!output.includes("secret-brief-id"));
    assert.ok(!output.includes("/c/"));
    assert.ok(!output.includes("token="));
  }
});

test("print document reuses the bundled Polish font faces with absolute asset URLs", () => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      baseURI: "https://brief.example/app/b/secret",
      styleSheets: [{
        href: "https://brief.example/assets/app.css",
        cssRules: [
          { type: 5, cssText: '@font-face { font-family: "Atkinson Hyperlegible Next Variable"; src: url(./atkinson-latin.woff2); }' },
          { type: 5, cssText: '@font-face { font-family: "Atkinson Hyperlegible Next Variable"; src: url("./atkinson-latin-ext.woff2"); unicode-range: U+0100-02BA; }' },
          { type: 1, cssText: ".app { color: red; }" },
        ],
      }],
    },
  });
  try {
    const html = buildBriefPrintHtml(brief(), undefined, at);
    assert.ok(html.includes('url("https://brief.example/assets/atkinson-latin.woff2")'));
    assert.ok(html.includes('url("https://brief.example/assets/atkinson-latin-ext.woff2")'));
    assert.ok(html.includes("unicode-range: U+0100-02BA"));
    assert.ok(!html.includes(".app { color: red; }"));
  } finally {
    Reflect.deleteProperty(globalThis, "document");
  }
});

test("styled print preserves status labels and colour fidelity with or without sender logo", () => {
  const b = brief();
  b.completedAt = at;
  b.sections[0].fields.push(field("done"), field("skipped"), field("unknown"));
  b.answers.done = answer("Żółte światło");
  b.answers.skipped = { status: "skipped", by: "client", at };
  b.answers.unknown = { status: "unknown", by: "client", at };
  const html = buildBriefPrintHtml(b, "/api/account/logo", at);
  assert.ok(html.includes('<svg class="brand-dh" viewBox="0 0 151 106"'));
  assert.ok(html.includes('class="brand-name">BriefFlow</span>'));
  assert.ok(html.includes('class="sender"'));
  assert.ok(html.includes('class="brief-status is-completed">Brief zakończony'));
  assert.ok(html.includes('class="question is-answered"'));
  assert.ok(html.includes('class="question is-skipped"'));
  assert.ok(html.includes('class="question is-unknown"'));
  assert.ok(html.includes('class="question is-missing"'));
  assert.ok(html.includes('class="answer-tag">Do uzupełnienia'));
  assert.ok(html.includes('class="answer-tag">Do ustalenia'));
  assert.ok(html.includes('aria-label="25% konkretnych odpowiedzi"'));
  assert.ok(html.includes("print-color-adjust: exact"));
  assert.ok(!buildBriefPrintHtml(b, undefined, at).includes('class="sender"'));
});
