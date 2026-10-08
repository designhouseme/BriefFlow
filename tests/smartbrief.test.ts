import assert from "node:assert/strict";
import { test } from "node:test";
import { briefFromSmartBrief, smartBriefGaps, validateSmartBriefSource } from "../src/shared/smartbrief";

const source = "Studio jogi Jutrzenka chce stronę z grafikiem zajęć i zapisami online. Ma gotowe logo i zdjęcia. Budżet jest nieustalony. Termin do uzgodnienia.";
const purposes: Record<string, string> = { "Zakres": "scope", "Cel": "goal", "Decydent": "decision_maker", "Budżet": "budget", "Termin": "deadline", "Odbiorcy": "audience", "Zdjęcia": "materials" };
const field = (label: string, required = true) => ({ type: "short_text", purpose: purposes[label], label, help: null, required, options: [], answer: null, evidence: null, reason: "Potrzebne do określenia zakresu projektu." });
function fixture() {
  return { title: "Strona studia jogi", clientName: "Jutrzenka", industry: "Joga i rekreacja", projectType: "Strona z zapisami", summary: "Studio potrzebuje grafiku i zapisów.", warnings: ["Termin i budżet wymagają ustalenia."], sections: [
    { title: "Projekt", description: null, fields: [
      { ...field("Zakres"), type: "long_text", answer: "Grafik zajęć i zapisy online", evidence: "stronę z grafikiem zajęć i zapisami online" },
      { ...field("Cel"), type: "single_choice", options: ["Więcej zapisów", "Prezentacja studia"] },
      field("Decydent"),
      field("Odbiorcy"),
    ] },
    { title: "Przygotowanie", description: null, fields: [field("Budżet"), { ...field("Termin"), type: "deadline" }, { ...field("Zdjęcia", false), type: "material" }] },
  ] };
}
const create = (value = fixture()) => briefFromSmartBrief(value, source, { id: "TestSmart123", clientName: "" }, 12345);

test("ingest builds industry fields and source-backed answers without persisting the transcript", () => {
  const brief = create();
  assert.equal(brief.templateId, "smartbrief");
  assert.equal(brief.clientName, "Jutrzenka");
  assert.equal(brief.smartBrief?.industry, "Joga i rekreacja");
  assert.equal(brief.smartBrief?.sourceCharacters, source.length);
  const fields = brief.sections.flatMap((s) => s.fields);
  assert.ok(fields.every((f) => f.origin === "ai"));
  assert.equal(new Set(fields.map((f) => f.id)).size, 7);
  assert.deepEqual(brief.answers[fields[0].id], { status: "answered", value: "Grafik zajęć i zapisy online", by: "agency", at: 12345 });
  assert.match(fields[0].reason!, /Z materiału:/);
  assert.ok(!JSON.stringify(brief).includes(source));
  assert.equal(smartBriefGaps(brief).length, 6);
  assert.equal(briefFromSmartBrief(fixture(), source, { id: "x", clientName: "Nazwa podana przez użytkownika" }).clientName, "Nazwa podana przez użytkownika");
});

test("unsupported or absent evidence leaves questions empty and marks the need for manual review", () => {
  for (const evidence of [null, "Wymyślony budżet 5000 zł"]) {
    const data = fixture(); data.sections[0].fields[0].evidence = evidence;
    const brief = create(data);
    assert.equal(Object.keys(brief.answers).length, 0);
    assert.equal(smartBriefGaps(brief).length, 7);
    assert.match(brief.smartBrief!.warnings.join(" "), /nie udało się potwierdzić/);
    assert.ok(!brief.sections[0].fields[0].reason!.includes("Z materiału:"));
  }
});

test("source-backed facts normalize a model-proposed choice or material control into a text answer", () => {
  for (const type of ["single_choice", "material", "yes_no"]) {
    const data = fixture(); data.sections[0].fields[0].type = type;
    const brief = create(data);
    assert.equal(brief.sections[0].fields[0].type, "short_text");
    assert.equal(Object.keys(brief.answers).length, 1);
    assert.equal(brief.answers[brief.sections[0].fields[0].id].value, "Grafik zajęć i zapisy online");
  }
});

test("malformed field structures cannot create a brief", () => {
  for (const mutate of [
    (data: ReturnType<typeof fixture>) => { data.sections[0].fields[1].options = ["Jedna"]; },
    (data: ReturnType<typeof fixture>) => { data.sections[0].fields[1].label = "Zakres"; },
    (data: ReturnType<typeof fixture>) => { data.sections[0].fields[1].type = "javascript"; },
    (data: ReturnType<typeof fixture>) => { data.sections[0].fields = []; },
    (data: ReturnType<typeof fixture>) => { data.sections[0].fields[3].purpose = "other"; },
  ]) {
    const data = fixture(); mutate(data);
    assert.throws(() => create(data));
  }
  assert.throws(() => briefFromSmartBrief({ ...fixture(), sections: "invalid" }, source, { id: "x", clientName: "" }));
});

test("source input rejects empty/short and oversized material including surrounding whitespace", () => {
  for (const input of [undefined, {}, " ", "x".repeat(79), ` ${"x".repeat(50_000)} `]) assert.throws(() => validateSmartBriefSource(input));
  assert.equal(validateSmartBriefSource(` ${source} `), source);
  assert.equal(validateSmartBriefSource("x".repeat(50_000)).length, 50_000);
});

test("gap analysis updates with answers and still treats unknown/skipped as missing information", () => {
  const brief = create();
  const [budget, deadline, material] = brief.sections[1].fields;
  brief.answers[budget.id] = { status: "answered", value: "6000 zł", by: "agency", at: 23456 };
  brief.answers[deadline.id] = { status: "unknown", by: "client", at: 23456 };
  brief.answers[material.id] = { status: "skipped", by: "client", at: 23456 };
  const gaps = smartBriefGaps(brief);
  assert.equal(gaps.length, 5);
  assert.ok(!gaps.some(({ field }) => field.id === budget.id));
  assert.ok(gaps.some(({ field }) => field.id === deadline.id));
  assert.ok(gaps.some(({ field }) => field.id === material.id));
});

test("core project fields remain required even when the provider marks them optional", () => {
  const data = fixture(); data.sections.forEach((s) => s.fields.forEach((f) => { f.required = false; }));
  const brief = create(data);
  assert.equal(brief.sections.flatMap((s) => s.fields).filter((f) => f.required).length, 6);
});
