// Sprawdzenia dla agencji: Baza (bez niej nie startujemy),
// czerwone flagi (reagujemy od razu, nie przy poprawkach) i pozycje do osobnej wyceny.
// Proste reguły na odpowiedziach, bez AI. Liczą się tylko pytania, które klient widzi.

import { questions } from "./flow";
import { optionsOf } from "./ops";
import type { Answer, Brief, Field } from "./types";

export interface BaseStatus {
  total: number;
  done: number;
  /** Ważne pytania bez konkretnej odpowiedzi („Nie wiem” i „Pomiń” też są brakiem). */
  missing: Field[];
}

export function baseStatus(brief: Brief): BaseStatus {
  const required = questions(brief).filter((q) => q.field.required);
  const missing = required.filter((q) => brief.answers[q.field.id]?.status !== "answered").map((q) => q.field);
  return { total: required.length, done: required.length - missing.length, missing };
}

export interface Flag {
  fieldId: string;
  title: string;
  advice: string;
}

const picked = (answer: Answer | undefined, ...ids: string[]) =>
  answer?.status === "answered" &&
  (Array.isArray(answer.value) ? answer.value.some((v) => ids.includes(v)) : ids.includes(String(answer.value)));

export function redFlags(brief: Brief): Flag[] {
  const visible = questions(brief).map((q) => q.field);
  const byId = new Map(visible.map((f) => [f.id, f]));
  const answer = (id: string) => (byId.has(id) ? brief.answers[id] : undefined);
  const flags: Flag[] = [];

  for (const field of visible) {
    const a = brief.answers[field.id];
    if (field.required && a?.status === "unknown") {
      flags.push({
        fieldId: field.id,
        title: `Klient nie wie: ${field.label}`,
        advice: "To punkt z Bazy. Dopytaj na rozmowie, bez tego nie startujemy.",
      });
    }
    if (field.type === "consent" && picked(a, "no")) {
      flags.push({
        fieldId: field.id,
        title: `Klient nie potwierdził: ${field.label}`,
        advice: "Wyjaśnij to przed startem i zapisz ustalenie w podsumowaniu.",
      });
    }
    if (field.type === "confirm" && picked(a, "fix")) {
      flags.push({
        fieldId: field.id,
        title: `Klient poprawił: ${field.label}`,
        advice: a?.other ? `Nowa wersja: ${a.other}` : "Klient zaznaczył błąd, ale nie wpisał poprawki. Dopytaj.",
      });
    }
    if (field.type === "material" && picked(a, "will_send")) {
      flags.push({
        fieldId: field.id,
        title: `${field.label}: „wyślę później”`,
        advice: "Ustal datę i wpisz ją do podsumowania. Termin strony liczymy od kompletu materiałów.",
      });
    }
  }

  // Reguły pod pytania z szablonu „Strona WWW”. Gdy agencja pytanie usunie, reguła po prostu milknie.
  if (picked(answer("f_decyzje"), "kilka")) {
    flags.push({
      fieldId: "f_decyzje",
      title: "Projekt zatwierdza kilka osób",
      advice: "Jedna osoba zbiera wszystkie uwagi, albo wspólnik dołącza do następnej rozmowy.",
    });
  }
  if (picked(answer("f_domena"), "bez_dostepu")) {
    flags.push({
      fieldId: "f_domena",
      title: "Nikt nie wie, gdzie jest panel domeny",
      advice: "Najpierw odzyskanie dostępu, dopiero potem data startu.",
    });
  }
  if (picked(answer("f_budzet"), "do5") && (picked(answer("f_sklep"), "yes") || picked(answer("f_wielkosc"), "srednia", "duza"))) {
    flags.push({
      fieldId: "f_budzet",
      title: "Zakres może nie zmieścić się w budżecie",
      advice: "Pokaż, co da się zrobić w tym budżecie, i zapisz to w podsumowaniu.",
    });
  }
  const materialsMissing = visible.some(
    (f) => f.type === "material" && !(picked(brief.answers[f.id], "link") || picked(brief.answers[f.id], "will_send")),
  );
  if (picked(answer("f_termin"), "asap", "miesiac") && materialsMissing) {
    flags.push({
      fieldId: "f_termin",
      title: "Krótki termin, a materiałów jeszcze nie ma",
      advice: "Termin strony liczymy od dnia, w którym materiały będą w komplecie.",
    });
  }
  return flags;
}

export interface QuoteItem {
  fieldId: string;
  text: string;
}

/** Wybrane opcje oznaczone „wycena” i materiały, które musimy przygotować sami. */
export function quoteItems(brief: Brief): QuoteItem[] {
  const items: QuoteItem[] = [];
  for (const { field } of questions(brief)) {
    const a = brief.answers[field.id];
    if (a?.status !== "answered") continue;
    if (field.type === "material") {
      if (picked(a, "need_help")) items.push({ fieldId: field.id, text: `${field.label}: przygotowanie po naszej stronie` });
      continue;
    }
    const values = Array.isArray(a.value) ? a.value : [String(a.value)];
    for (const option of optionsOf(field)) {
      if (option.quote && values.includes(option.id)) items.push({ fieldId: field.id, text: option.label });
    }
  }
  return items;
}
