import test from "node:test";
import assert from "node:assert/strict";
import { baseStatus, quoteItems, redFlags } from "../src/shared/checks";
import { questions } from "../src/shared/flow";
import { fieldToInput, optionsOf, removeField, updateField } from "../src/shared/ops";
import { briefFromTemplate } from "../src/shared/templates";
import type { Brief, Field } from "../src/shared/types";
import { freshTemplateSections } from "../src/server/account-resources";

const source = (): Brief => briefFromTemplate("www", { id: "source", title: "WWW", clientName: "Klient źródłowy" });
const key = (field: Field) => field.templateKey ?? field.id;
const field = (brief: Brief, templateKey: string) => brief.sections.flatMap((section) => section.fields).find((field) => key(field) === templateKey)!;
function answer(brief: Brief, fieldKey: string, ...optionKeys: string[]) {
  const question = field(brief, fieldKey);
  assert.ok(question, fieldKey);
  const value = optionKeys.map((optionKey) => optionsOf(question).find((option) => (option.templateKey ?? option.id) === optionKey)!.id);
  brief.answers[question.id] = { status: "answered", value: question.type === "multi_choice" ? value : value[0], by: "client", at: 1 };
}
function answerRisks(brief: Brief) {
  answer(brief, "f_decyzje", "kilka");
  answer(brief, "f_domena", "bez_dostepu");
  answer(brief, "f_budzet", "do5");
  answer(brief, "f_sklep", "yes");
  answer(brief, "f_wielkosc", "duza");
  answer(brief, "f_termin", "miesiac");
  answer(brief, "f_logo", "need_help");
  answer(brief, "f_zdjecia", "will_send");
  answer(brief, "f_prawa", "no");
  answer(brief, "f_funkcje", "rezerwacje", "jezyki");
}
function clone(brief: Brief): Brief {
  return { ...brief, id: crypto.randomUUID(), clientName: "", sections: freshTemplateSections(brief.sections), answers: {}, canUndo: false, completedAt: undefined };
}
const flagDetails = (brief: Brief) => redFlags(brief).map(({ title, advice }) => ({ title, advice }));

test("saved WWW template preserves all risk rules, quote items and visibility with fresh ids and no answers", () => {
  const original = source(); answerRisks(original);
  const copied = clone(original);
  assert.deepEqual(copied.answers, {});
  assert.deepEqual(redFlags(copied), []);
  const originalIds = new Set(original.sections.flatMap((section) => [section.id, ...section.fields.map((field) => field.id)]));
  for (const section of copied.sections) {
    assert.ok(!originalIds.has(section.id));
    for (const field of section.fields) assert.ok(!originalIds.has(field.id));
  }
  answerRisks(copied);
  assert.deepEqual(flagDetails(copied), flagDetails(original));
  const titles = redFlags(copied).map((flag) => flag.title);
  for (const expected of ["Projekt zatwierdza kilka osób", "Nikt nie wie, gdzie jest panel domeny", "Zakres może nie zmieścić się w budżecie", "Krótki termin, a materiałów jeszcze nie ma"]) assert.ok(titles.includes(expected), expected);
  for (const flag of redFlags(copied)) assert.ok(copied.sections.some((section) => section.fields.some((field) => field.id === flag.fieldId)), "flag points to the actual copied field");
  assert.deepEqual(quoteItems(copied).map((item) => item.text), quoteItems(original).map((item) => item.text));
  assert.deepEqual(questions(copied).map((item) => key(item.field)), questions(original).map((item) => key(item.field)));
  assert.equal(baseStatus(copied).done, baseStatus(original).done);
});

test("risk rules survive copying a saved template again and editing its question labels", () => {
  const original = source(); answerRisks(original);
  const copied = clone(clone(original));
  answerRisks(copied);
  for (const fieldKey of ["f_decyzje", "f_domena", "f_budzet"]) {
    const before = field(copied, fieldKey);
    updateField(copied, before.id, { ...fieldToInput(before), label: `${before.label} (doprecyzowane)` }, { origin: "agency" });
    assert.equal(field(copied, fieldKey).templateKey, fieldKey);
  }
  assert.deepEqual(flagDetails(copied), flagDetails(original));
  assert.equal(field(copied, "f_decyzje").options?.find((option) => option.templateKey === "kilka")?.id, copied.answers[field(copied, "f_decyzje").id].value);
});

test("deleting a WWW risk question disables only that rule in a saved template", () => {
  const original = source(); answerRisks(original);
  const copied = clone(original); answerRisks(copied);
  removeField(original, field(original, "f_decyzje").id);
  removeField(copied, field(copied, "f_decyzje").id);
  assert.deepEqual(flagDetails(copied), flagDetails(original));
  assert.ok(!redFlags(copied).some((flag) => flag.title === "Projekt zatwierdza kilka osób"));
});
