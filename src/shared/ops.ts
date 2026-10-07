// Operacje na strukturze briefu. Te same funkcje wywołuje edycja ręczna i AI,
// więc walidacja jest w jednym miejscu. Błędy mają polskie komunikaty, bo trafiają do UI i do modelu.

import {
  AREA_OPTIONS,
  type Answer,
  type Brief,
  CHOICE_TYPES,
  CONFIRM_OPTIONS,
  CONSENT_OPTIONS,
  DEADLINE_OPTIONS,
  type Field,
  type FieldInput,
  type FieldType,
  FIELD_TYPES,
  MATERIAL_OPTIONS,
  NEEDS_TEXT,
  type Option,
  type Section,
  type ShowIf,
  YES_NO_OPTIONS,
} from "./types";

export class OpError extends Error {}

const MAX_LABEL = 200;
const MAX_HELP = 400;
const MAX_OPTIONS = 12;

export function newId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return prefix + Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

export function findSection(brief: Brief, sectionId: string): Section {
  const section = brief.sections.find((s) => s.id === sectionId);
  if (!section) throw new OpError(`Nie ma sekcji o id ${sectionId}.`);
  return section;
}

export function findField(brief: Brief, fieldId: string): { section: Section; field: Field; index: number } {
  for (const section of brief.sections) {
    const index = section.fields.findIndex((f) => f.id === fieldId);
    if (index !== -1) return { section, field: section.fields[index], index };
  }
  throw new OpError(`Nie ma pola o id ${fieldId}.`);
}

export function allFields(brief: Brief): Field[] {
  return brief.sections.flatMap((s) => s.fields);
}

const FIXED_OPTIONS: Partial<Record<FieldType, Option[]>> = {
  yes_no: YES_NO_OPTIONS,
  material: MATERIAL_OPTIONS,
  confirm: CONFIRM_OPTIONS,
  area: AREA_OPTIONS,
  deadline: DEADLINE_OPTIONS,
  consent: CONSENT_OPTIONS,
};

/** Opcje, które pole faktycznie pokazuje (typy ze stałymi odpowiedziami mają je wbudowane). */
export function optionsOf(field: Field): Option[] {
  return FIXED_OPTIONS[field.type] ?? field.options ?? [];
}

export const hasFixedOptions = (type: FieldType) => type in FIXED_OPTIONS;

/** Czy ta odpowiedź prosi o dopisek (miasto, data, link, poprawka). */
export const needsText = (type: FieldType, value: unknown) =>
  value === "__other" || (typeof value === "string" && Boolean(NEEDS_TEXT[type]?.includes(value)));

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const formatDate = (iso: string) =>
  DATE.test(iso) ? new Date(`${iso}T12:00:00`).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" }) : iso;

function cleanText(value: string | undefined, max: number, what: string): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (text.length > max) throw new OpError(`${what} jest za długi (max ${max} znaków).`);
  return text;
}

function slug(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ł/g, "l")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 24) || "opcja"
  );
}

/**
 * Zamienia etykiety na opcje, zachowując id istniejących opcji o tej samej etykiecie (żeby odpowiedzi przetrwały edycję).
 * Oznaczenie „wycena” też idzie po etykiecie, więc przetrwa ręczną edycję i pełną redefinicję pola przez AI.
 */
function buildOptions(labels: string[] | undefined, previous: Option[] | undefined, quoteLabels: string[] = []): Option[] {
  const quoted = new Set(quoteLabels.map((l) => l.trim().toLowerCase()));
  const cleaned = (labels ?? []).map((l) => l.trim()).filter(Boolean);
  if (cleaned.length < 2) throw new OpError("Pole z wyborem potrzebuje co najmniej 2 opcji.");
  if (cleaned.length > MAX_OPTIONS) throw new OpError(`Za dużo opcji (max ${MAX_OPTIONS}).`);
  const seen = new Set<string>();
  const usedIds = new Set<string>();
  return cleaned.map((label) => {
    const key = label.toLowerCase();
    if (seen.has(key)) throw new OpError(`Opcja „${label}” się powtarza.`);
    seen.add(key);
    if (label.length > 80) throw new OpError(`Opcja „${label.slice(0, 20)}…” jest za długa (max 80 znaków).`);
    const existing = previous?.find((o) => o.label.toLowerCase() === key);
    let id = existing?.id ?? slug(label);
    while (usedIds.has(id)) id = `${id}_${usedIds.size}`;
    usedIds.add(id);
    return quoted.has(key) ? { id, label, quote: true } : { id, label };
  });
}

function validateShowIf(brief: Brief, showIf: ShowIf | null | undefined, selfId?: string): ShowIf | undefined {
  if (!showIf) return undefined;
  if (showIf.fieldId === selfId) throw new OpError("Pole nie może zależeć od samego siebie.");
  const { field } = findField(brief, showIf.fieldId);
  if (field.type !== "yes_no" && field.type !== "single_choice" && field.type !== "multi_choice") {
    throw new OpError("Warunek widoczności może zależeć tylko od pola tak/nie albo pola z wyborem.");
  }
  if (!optionsOf(field).some((o) => o.id === showIf.equals)) {
    throw new OpError(`Pole „${field.label}” nie ma opcji o id ${showIf.equals}.`);
  }
  return { fieldId: showIf.fieldId, equals: showIf.equals };
}

/** Buduje kompletne pole z danych wejściowych. `previous` podajemy przy edycji. */
export function buildField(
  brief: Brief,
  input: FieldInput,
  meta: { id: string; origin: Field["origin"]; reason?: string; previous?: Field },
): Field {
  if (!FIELD_TYPES.some((t) => t.type === input.type)) throw new OpError(`Nieznany typ pola: ${input.type}.`);
  const label = cleanText(input.label, MAX_LABEL, "Tytuł pola");
  if (!label) throw new OpError("Pole musi mieć tytuł.");
  const field: Field = {
    id: meta.id,
    type: input.type,
    label,
    help: cleanText(input.help, MAX_HELP, "Podpowiedź"),
    required: Boolean(input.required),
    origin: meta.origin,
    reason: cleanText(meta.reason, MAX_HELP, "Powód"),
  };
  if (CHOICE_TYPES.includes(input.type)) {
    field.options = buildOptions(input.options, meta.previous?.options, input.quoteOptions);
    field.allowOther = Boolean(input.allowOther);
  }
  if (input.type === "scale") {
    field.scaleMin = cleanText(input.scaleMin, 40, "Opis skali") ?? "Mało";
    field.scaleMax = cleanText(input.scaleMax, 40, "Opis skali") ?? "Dużo";
  }
  if (input.type === "confirm") {
    field.prefill = cleanText(input.prefill, 600, "Treść do potwierdzenia");
    if (!field.prefill) throw new OpError("Potwierdzenie potrzebuje treści, którą klient ma sprawdzić.");
  }
  const showIf = validateShowIf(brief, input.showIf, meta.id);
  if (showIf) field.showIf = showIf;
  return field;
}

export function fieldToInput(field: Field): FieldInput {
  return {
    type: field.type,
    label: field.label,
    help: field.help,
    options: field.options?.map((o) => o.label),
    allowOther: field.allowOther,
    scaleMin: field.scaleMin,
    scaleMax: field.scaleMax,
    required: field.required,
    showIf: field.showIf ?? null,
    quoteOptions: field.options?.filter((o) => o.quote).map((o) => o.label),
    prefill: field.prefill,
  };
}

// --- Sekcje ---

export function addSection(
  brief: Brief,
  input: { title: string; description?: string; afterSectionId?: string | null },
): Section {
  const title = cleanText(input.title, 120, "Tytuł sekcji");
  if (!title) throw new OpError("Sekcja musi mieć tytuł.");
  const section: Section = {
    id: newId("s_"),
    title,
    description: cleanText(input.description, MAX_HELP, "Opis sekcji"),
    fields: [],
  };
  if (input.afterSectionId) {
    const index = brief.sections.findIndex((s) => s.id === input.afterSectionId);
    if (index === -1) throw new OpError(`Nie ma sekcji o id ${input.afterSectionId}.`);
    brief.sections.splice(index + 1, 0, section);
  } else {
    brief.sections.push(section);
  }
  return section;
}

export function updateSection(brief: Brief, sectionId: string, input: { title: string; description?: string }): Section {
  const section = findSection(brief, sectionId);
  const title = cleanText(input.title, 120, "Tytuł sekcji");
  if (!title) throw new OpError("Sekcja musi mieć tytuł.");
  section.title = title;
  section.description = cleanText(input.description, MAX_HELP, "Opis sekcji");
  return section;
}

export function removeSection(brief: Brief, sectionId: string): Section {
  const section = findSection(brief, sectionId);
  if (brief.sections.length === 1) throw new OpError("Brief musi mieć co najmniej jedną sekcję.");
  brief.sections = brief.sections.filter((s) => s.id !== sectionId);
  dropDanglingConditions(brief);
  return section;
}

// --- Pola ---

/** Pozycja wstawienia: id pola, za którym wstawić; START = na początek; null = na koniec sekcji. */
export const START = "__start";

function insertField(section: Section, field: Field, afterFieldId: string | null) {
  if (afterFieldId === START) {
    section.fields.unshift(field);
  } else if (afterFieldId) {
    const index = section.fields.findIndex((f) => f.id === afterFieldId);
    if (index === -1) throw new OpError(`Pole ${afterFieldId} nie należy do sekcji „${section.title}”.`);
    section.fields.splice(index + 1, 0, field);
  } else {
    section.fields.push(field);
  }
}

export function addField(
  brief: Brief,
  sectionId: string,
  afterFieldId: string | null,
  input: FieldInput,
  meta: { origin: Field["origin"]; reason?: string },
): Field {
  const section = findSection(brief, sectionId);
  if (section.fields.length >= 40) throw new OpError("Sekcja ma już za dużo pól.");
  const field = buildField(brief, input, { id: newId("f_"), ...meta });
  insertField(section, field, afterFieldId);
  return field;
}

export function updateField(
  brief: Brief,
  fieldId: string,
  input: FieldInput,
  meta: { origin?: Field["origin"]; reason?: string },
): Field {
  const { section, field: previous, index } = findField(brief, fieldId);
  const field = buildField(brief, input, {
    id: fieldId,
    origin: meta.origin ?? previous.origin,
    reason: meta.reason ?? previous.reason,
    previous,
  });
  section.fields[index] = field;
  dropDanglingConditions(brief);
  return field;
}

export function removeField(brief: Brief, fieldId: string): Field {
  const { section, field } = findField(brief, fieldId);
  section.fields = section.fields.filter((f) => f.id !== fieldId);
  dropDanglingConditions(brief);
  return field;
}

/** Przenosi pole do sekcji (może być ta sama). Pozycja jak w insertField. */
export function moveField(brief: Brief, fieldId: string, targetSectionId: string, afterFieldId: string | null): Field {
  if (afterFieldId === fieldId) throw new OpError("Pole nie może być przeniesione za samo siebie.");
  const target = findSection(brief, targetSectionId);
  const { section, field } = findField(brief, fieldId);
  section.fields = section.fields.filter((f) => f.id !== fieldId);
  insertField(target, field, afterFieldId);
  return field;
}

/** Przesuwa pole o jedno miejsce w górę/dół w obrębie sekcji. */
export function nudgeField(brief: Brief, fieldId: string, direction: "up" | "down"): Field {
  const { section, field, index } = findField(brief, fieldId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= section.fields.length) return field;
  section.fields.splice(index, 1);
  section.fields.splice(target, 0, field);
  return field;
}

/** Usuwa warunki widoczności wskazujące na pola lub opcje, które już nie istnieją. */
function dropDanglingConditions(brief: Brief) {
  const fields = new Map(allFields(brief).map((f) => [f.id, f]));
  const valid = (showIf?: ShowIf) => {
    if (!showIf) return true;
    const source = fields.get(showIf.fieldId);
    return Boolean(source && optionsOf(source).some((o) => o.id === showIf.equals));
  };
  for (const section of brief.sections) {
    if (!valid(section.showIf)) delete section.showIf;
    for (const field of section.fields) if (!valid(field.showIf)) delete field.showIf;
  }
}

// --- Widoczność i postęp ---

function conditionMet(brief: Brief, showIf: ShowIf | undefined): boolean {
  if (!showIf) return true;
  const answer = brief.answers[showIf.fieldId];
  if (!answer || answer.status !== "answered") return false;
  return Array.isArray(answer.value) ? answer.value.includes(showIf.equals) : answer.value === showIf.equals;
}

export function isSectionVisible(brief: Brief, section: Section): boolean {
  return conditionMet(brief, section.showIf);
}

export function isFieldVisible(brief: Brief, field: Field): boolean {
  return conditionMet(brief, field.showIf);
}

export function progress(brief: Brief) {
  let total = 0;
  let answered = 0;
  let skipped = 0;
  let unknown = 0;
  for (const section of brief.sections) {
    if (!isSectionVisible(brief, section)) continue;
    for (const field of section.fields) {
      if (!isFieldVisible(brief, field)) continue;
      total++;
      const status = brief.answers[field.id]?.status;
      if (status === "answered") answered++;
      else if (status === "skipped") skipped++;
      else if (status === "unknown") unknown++;
    }
  }
  return { total, answered, skipped, unknown, missing: total - answered - unknown };
}

// --- Odpowiedzi ---

/** Sprawdza i normalizuje odpowiedź względem pola. */
export function normalizeAnswer(field: Field, input: Pick<Answer, "status" | "value" | "other">): Pick<Answer, "status" | "value" | "other"> {
  if (input.status === "skipped" || input.status === "unknown") return { status: input.status };
  if (input.status !== "answered") throw new OpError("Nieznany status odpowiedzi.");
  const other = typeof input.other === "string" ? input.other.trim().slice(0, 2000) || undefined : undefined;
  const ids = new Set(optionsOf(field).map((o) => o.id));
  switch (field.type) {
    case "single_choice":
    case "yes_no":
    case "material":
    case "confirm":
    case "area":
    case "deadline":
    case "consent": {
      const value = input.value;
      if (value === "__other" && field.allowOther) return { status: "answered", value, other };
      if (typeof value !== "string" || !ids.has(value)) throw new OpError("Nieprawidłowa opcja.");
      if (field.type === "deadline" && value === "data" && other && !DATE.test(other)) {
        throw new OpError("Nieprawidłowa data.");
      }
      return { status: "answered", value, other: needsText(field.type, value) ? other : undefined };
    }
    case "multi_choice": {
      if (!Array.isArray(input.value)) throw new OpError("Oczekiwano listy opcji.");
      const values = input.value.filter((v) => ids.has(v) || (v === "__other" && field.allowOther));
      if (values.length === 0) throw new OpError("Wybierz co najmniej jedną opcję.");
      return { status: "answered", value: values, other: values.includes("__other") ? other : undefined };
    }
    case "scale": {
      const value = Number(input.value);
      if (!Number.isInteger(value) || value < 1 || value > 5) throw new OpError("Wartość skali musi być od 1 do 5.");
      return { status: "answered", value };
    }
    case "short_text":
    case "long_text": {
      const text = typeof input.value === "string" ? input.value.trim() : "";
      const max = field.type === "short_text" ? 300 : 5000;
      if (!text) throw new OpError("Odpowiedź jest pusta.");
      return { status: "answered", value: text.slice(0, max) };
    }
  }
}

/** Czytelna odpowiedź do logu zmian i opisu briefu dla AI. */
export function describeAnswer(field: Field, answer: Answer | undefined): string {
  if (!answer) return "brak odpowiedzi";
  if (answer.status === "skipped") return "pominięte (uzupełni później)";
  if (answer.status === "unknown") return "nie wiem";
  const label = (id: string) =>
    id === "__other" ? `Inne: ${answer.other ?? ""}` : (optionsOf(field).find((o) => o.id === id)?.label ?? id);
  const v = answer.value;
  if (Array.isArray(v)) return v.map(label).join(", ");
  if (field.type === "scale") return `${v}/5 (${field.scaleMin} → ${field.scaleMax})`;
  if (field.type === "confirm") {
    return v === "fix" ? `Poprawka: ${answer.other ?? "do ustalenia"}` : `Zgadza się: ${field.prefill ?? ""}`;
  }
  if (field.type === "deadline" && v === "data") {
    return answer.other ? `Na konkretną datę: ${formatDate(answer.other)}` : label(v);
  }
  if (typeof v === "string" && (CHOICE_TYPES.includes(field.type) || hasFixedOptions(field.type))) {
    return label(v) + (v !== "__other" && answer.other ? ` (${answer.other})` : "");
  }
  return String(v ?? "");
}
