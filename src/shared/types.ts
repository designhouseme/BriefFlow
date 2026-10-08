// Brief to dane: sekcje → pola. Wszystkie zmiany struktury (ręczne i AI) przechodzą przez ops.ts.

export type Role = "agency" | "client";
export type Actor = Role | "ai";

export type FieldType =
  | "single_choice"
  | "multi_choice"
  | "yes_no"
  | "scale"
  | "material"
  | "short_text"
  | "long_text"
  | "confirm"
  | "area"
  | "deadline"
  | "consent";

export const FIELD_TYPES: { type: FieldType; label: string; hint: string }[] = [
  { type: "single_choice", label: "Jeden wybór", hint: "Kafelki, jedna odpowiedź" },
  { type: "multi_choice", label: "Wiele wyborów", hint: "Kafelki, kilka odpowiedzi" },
  { type: "yes_no", label: "Tak / nie", hint: "Dwa przyciski" },
  { type: "scale", label: "Skala", hint: "Suwak między dwiema skrajnościami" },
  { type: "material", label: "Materiał", hint: "Logo, zdjęcia, teksty do dostarczenia" },
  { type: "short_text", label: "Krótki tekst", hint: "Nazwa, adres, link" },
  { type: "long_text", label: "Dłuższy tekst", hint: "Opis, tylko gdy nie da się klikać" },
  { type: "confirm", label: "Potwierdzenie", hint: "Wpisujesz, co wiesz, klient klika „Zgadza się”" },
  { type: "area", label: "Obszar działania", hint: "Miasto, region, cała Polska" },
  { type: "deadline", label: "Termin", hint: "Gotowe terminy albo konkretna data" },
  { type: "consent", label: "Oświadczenie", hint: "Klient potwierdza zdanie, z datą" },
];

export const TEXT_TYPES: FieldType[] = ["short_text", "long_text"];
export const CHOICE_TYPES: FieldType[] = ["single_choice", "multi_choice"];

export interface Option {
  id: string;
  label: string;
  /** Stały klucz opcji źródłowego szablonu, zachowany po nadaniu świeżego id w kopii. */
  templateKey?: string;
  /** Wybór tej opcji zmienia wycenę (np. wersja językowa, integracja). Widzi to tylko agencja. */
  quote?: boolean;
}

// Odpowiedzi na pole „materiał” są stałe: klient tylko klika status.
export const MATERIAL_OPTIONS: Option[] = [
  { id: "will_send", label: "Mam, wyślę mailem" },
  { id: "link", label: "Mam, podam link" },
  { id: "need_help", label: "Nie mam, potrzebuję pomocy" },
];

// Typy ze stałymi odpowiedziami: klient tylko klika, czasem z dopiskiem (miasto, data, poprawka).
export const CONFIRM_OPTIONS: Option[] = [
  { id: "ok", label: "Zgadza się" },
  { id: "fix", label: "Trzeba poprawić" },
];

export const AREA_OPTIONS: Option[] = [
  { id: "miasto", label: "Jedno miasto" },
  { id: "okolica", label: "Miasto i okolice" },
  { id: "region", label: "Województwo lub region" },
  { id: "polska", label: "Cała Polska" },
  { id: "zagranica", label: "Także za granicą" },
];

export const DEADLINE_OPTIONS: Option[] = [
  { id: "asap", label: "Jak najszybciej" },
  { id: "miesiac", label: "Do miesiąca" },
  { id: "kwartal", label: "W ciągu 1–3 miesięcy" },
  { id: "data", label: "Na konkretną datę" },
  { id: "luz", label: "Nie ma pośpiechu" },
];

export const CONSENT_OPTIONS: Option[] = [
  { id: "yes", label: "Potwierdzam" },
  { id: "no", label: "Trzeba to wyjaśnić" },
];

/** Która stała odpowiedź prosi o dopisek. */
export const NEEDS_TEXT: Partial<Record<FieldType, string[]>> = {
  material: ["link"],
  confirm: ["fix"],
  area: ["miasto", "okolica", "region"],
  deadline: ["data"],
};

export const YES_NO_OPTIONS: Option[] = [
  { id: "yes", label: "Tak" },
  { id: "no", label: "Nie" },
];

export const SCALE_STEPS = 5;

/** Pole lub sekcja widoczne tylko wtedy, gdy inne pole ma daną odpowiedź (id opcji, "yes" / "no"). */
export interface ShowIf {
  fieldId: string;
  equals: string;
}

export interface Field {
  id: string;
  /** Klucz reguł źródłowego szablonu; id nadal identyfikuje wyłącznie pytanie tego briefu. */
  templateKey?: string;
  type: FieldType;
  label: string;
  help?: string;
  options?: Option[];
  allowOther?: boolean;
  scaleMin?: string;
  scaleMax?: string;
  required: boolean;
  showIf?: ShowIf;
  origin: Actor | "template";
  /** Dlaczego AI dodało lub zmieniło pole. Widoczne dla agencji. */
  reason?: string;
  /** Dla potwierdzenia: to, co agencja już wie (np. z wizytówki Google). Klient tylko to sprawdza. */
  prefill?: string;
}

export interface Section {
  id: string;
  title: string;
  description?: string;
  showIf?: ShowIf;
  fields: Field[];
}

export type AnswerStatus = "answered" | "skipped" | "unknown";

export interface Answer {
  status: AnswerStatus;
  /** Id opcji, lista id opcji, liczba 1–5 (skala) albo tekst. */
  value?: string | string[] | number;
  /** Tekst do „Inne…” albo link przy materiale. */
  other?: string;
  by: Role;
  at: number;
}

export type AnswerInput = Pick<Answer, "status" | "value" | "other">;

export interface Brief {
  id: string;
  title: string;
  clientName: string;
  templateId: string;
  createdAt: number;
  updatedAt: number;
  sections: Section[];
  answers: Record<string, Answer>;
  canUndo: boolean;
  /** Kiedy klient kliknął „Gotowe” na podsumowaniu (może potem wrócić i uzupełnić). */
  completedAt?: number;
}

/** Dane pola podawane przy dodawaniu/edycji (bez id i pochodzenia). Opcje jako etykiety. */
export interface FieldInput {
  type: FieldType;
  label: string;
  help?: string;
  options?: string[];
  allowOther?: boolean;
  scaleMin?: string;
  scaleMax?: string;
  required: boolean;
  showIf?: ShowIf | null;
  /** Etykiety opcji oznaczonych „wycena”. */
  quoteOptions?: string[];
  prefill?: string;
}

export interface LogEntry {
  at: number;
  actor: Actor;
  text: string;
}

export interface AiResult {
  ok: boolean;
  summary: string;
  changes: string[];
}

export interface AccessInfo {
  role: Role;
  aiEnabled: boolean;
  /** Prywatny obraz nadawcy, dostępny tylko w ramach uprawnionego konta lub linku klienta. */
  logoUrl?: string;
}
