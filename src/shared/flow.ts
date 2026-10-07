// Przejście klienta przez brief: jedno pytanie naraz, kroki = widoczne sekcje.
// Liczy się z aktualnego stanu, więc pojawiające się sekcje (np. „Sklep”) wpinają się w kolejkę na bieżąco.

import { isFieldVisible, isSectionVisible } from "./ops";
import type { AnswerStatus, Brief, Field, Section } from "./types";

export interface Step {
  section: Section;
  fields: Field[];
}

export interface Question {
  field: Field;
  section: Section;
  stepIndex: number;
}

/** Odpowiedź, którą uznajemy za zamkniętą. „Pomiń na razie” zostaje otwarte do uzupełnienia. */
export const isSettled = (status: AnswerStatus | undefined) => status === "answered" || status === "unknown";

export function visibleSteps(brief: Brief): Step[] {
  return brief.sections
    .filter((s) => isSectionVisible(brief, s))
    .map((section) => ({ section, fields: section.fields.filter((f) => isFieldVisible(brief, f)) }))
    .filter((step) => step.fields.length > 0);
}

export function questions(brief: Brief): Question[] {
  return visibleSteps(brief).flatMap((step, stepIndex) =>
    step.fields.map((field) => ({ field, section: step.section, stepIndex })),
  );
}

/** Gdzie wrócić po ponownym otwarciu linku: pierwsze pytanie bez żadnej odpowiedzi, potem pierwsze pominięte. */
export function resumeTarget(brief: Brief): string | null {
  const list = questions(brief);
  const untouched = list.find((q) => !brief.answers[q.field.id]);
  if (untouched) return untouched.field.id;
  return null;
}

/** Pytania wciąż otwarte (pominięte albo bez odpowiedzi), w kolejności briefu. */
export function openQuestions(brief: Brief): Question[] {
  return questions(brief).filter((q) => !isSettled(brief.answers[q.field.id]?.status));
}

/** Czy krok jest zamknięty: każde jego pytanie ma odpowiedź albo „nie wiem”. */
export function isStepSettled(brief: Brief, step: Step): boolean {
  return step.fields.every((f) => isSettled(brief.answers[f.id]?.status));
}

export function isStepStarted(brief: Brief, step: Step): boolean {
  return step.fields.some((f) => brief.answers[f.id]);
}

/** Następne pytanie po danym (w aktualnej, przeliczonej kolejce). null = koniec. */
export function nextAfter(brief: Brief, fieldId: string): string | null {
  const list = questions(brief);
  const index = list.findIndex((q) => q.field.id === fieldId);
  if (index === -1) return resumeTarget(brief);
  return list[index + 1]?.field.id ?? null;
}

/**
 * Dokąd po odpowiedzi: pierwsze nieruszone pytanie za bieżącym, a gdy takiego nie ma, pierwsze nieruszone
 * w ogóle. Poprawka starej odpowiedzi wraca więc tam, gdzie klient skończył, zamiast przechodzić po kolei.
 */
export function nextOpen(brief: Brief, fieldId: string): string | null {
  const list = questions(brief);
  const index = list.findIndex((q) => q.field.id === fieldId);
  const untouched = (q: Question) => q.field.id !== fieldId && !brief.answers[q.field.id];
  return (list.slice(index + 1).find(untouched) ?? list.find(untouched))?.field.id ?? null;
}

/** Następne otwarte pytanie (pominięte albo bez odpowiedzi) za danym, bez zawracania. Do uzupełniania braków po kolei. */
export function nextUnsettledAfter(brief: Brief, fieldId: string): string | null {
  const list = questions(brief);
  const index = list.findIndex((q) => q.field.id === fieldId);
  return list.slice(index + 1).find((q) => !isSettled(brief.answers[q.field.id]?.status))?.field.id ?? null;
}

export function previousBefore(brief: Brief, fieldId: string): string | null {
  const list = questions(brief);
  const index = list.findIndex((q) => q.field.id === fieldId);
  if (index <= 0) return null;
  return list[index - 1].field.id;
}
