import { questions } from "./flow";
import { addField, addSection, normalizeAnswer } from "./ops";
import type { Brief, FieldType } from "./types";

export const SMARTBRIEF_MIN_CHARACTERS = 80;
export const SMARTBRIEF_MAX_CHARACTERS = 50_000;
export const SMARTBRIEF_FIELD_TYPES = ["short_text", "long_text", "single_choice", "multi_choice", "yes_no", "material", "deadline", "area"] as const;
export const SMARTBRIEF_CORE_PURPOSES = ["goal", "audience", "scope", "budget", "deadline", "decision_maker"] as const;
export const SMARTBRIEF_PURPOSES = [...SMARTBRIEF_CORE_PURPOSES, "materials", "industry_specific", "other"] as const;

export class SmartBriefError extends Error {
  diagnostic?: string;
}
const invalid = (diagnostic = "structure") => {
  const error = new SmartBriefError("AI zwróciło niepełny brief. Spróbuj ponownie, limit nie został zużyty.");
  error.diagnostic = diagnostic;
  return error;
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, optional = false): string {
  if (optional && (value === null || value === undefined || value === "")) return "";
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw invalid(`text:${max}:${typeof value}:${typeof value === "string" ? value.length : 0}`);
  return value.trim();
}

export function validateSmartBriefSource(source: unknown): string {
  if (typeof source !== "string" || source.trim().length < SMARTBRIEF_MIN_CHARACTERS) throw new SmartBriefError(`Wklej przynajmniej ${SMARTBRIEF_MIN_CHARACTERS} znaków: opis projektu, notatki lub transkrypcję.`);
  if (source.length > SMARTBRIEF_MAX_CHARACTERS) throw new SmartBriefError("Materiał może mieć maksymalnie 50 000 znaków. Podziel go na krótszy opis.");
  return source.trim();
}

/** Provider output is untrusted. Build every field through the existing operations. */
export function briefFromSmartBrief(output: unknown, source: string, input: { id: string; clientName: string }, now = Date.now()): Brief {
  const data = record(output);
  const brief: Brief = {
    id: input.id, title: text(data.title, 120), clientName: input.clientName || text(data.clientName, 120, true),
    templateId: "smartbrief", createdAt: now, updatedAt: now, sections: [], answers: {}, canUndo: false,
    smartBrief: {
      industry: text(data.industry, 120), projectType: text(data.projectType, 120), summary: text(data.summary, 1200),
      warnings: [], sourceCharacters: source.length, generatedAt: now,
    },
  };
  if (!Array.isArray(data.warnings) || data.warnings.length > 8) throw invalid();
  brief.smartBrief!.warnings = data.warnings.map((warning) => text(warning, 400));
  if (!Array.isArray(data.sections) || data.sections.length < 2 || data.sections.length > 10) throw invalid();
  let count = 0;
  const labels = new Set<string>();
  const covered = new Set<string>();
  for (const item of data.sections) {
    const sectionData = record(item);
    const section = addSection(brief, { title: text(sectionData.title, 120), description: text(sectionData.description, 400, true) || undefined });
    if (!Array.isArray(sectionData.fields) || !sectionData.fields.length) throw invalid();
    for (const entry of sectionData.fields) {
      if (++count > 40) throw invalid();
      const fieldData = record(entry);
      if (!SMARTBRIEF_FIELD_TYPES.includes(fieldData.type as typeof SMARTBRIEF_FIELD_TYPES[number]) || typeof fieldData.required !== "boolean") throw invalid();
      if (!SMARTBRIEF_PURPOSES.includes(fieldData.purpose as typeof SMARTBRIEF_PURPOSES[number])) throw invalid("field_purpose");
      const purpose = fieldData.purpose as string;
      covered.add(purpose);
      const core = SMARTBRIEF_CORE_PURPOSES.some((key) => key === purpose);
      const label = text(fieldData.label, 200);
      if (labels.has(label.toLocaleLowerCase("pl"))) throw invalid();
      labels.add(label.toLocaleLowerCase("pl"));
      if (!Array.isArray(fieldData.options) || fieldData.options.length > 8) throw invalid();
      const options = fieldData.options.map((option) => text(option, 80));
      const answer = text(fieldData.answer, fieldData.type === "short_text" ? 300 : 5000, true);
      const evidence = text(fieldData.evidence, 600, true);
      const explanation = text(fieldData.reason, 400);
      const answerType = fieldData.type === "short_text" || fieldData.type === "long_text";
      const backed = Boolean(answer && evidence && source.includes(evidence));
      const unverified = Boolean(answer && !backed);
      const help = text(fieldData.help, 400, true);
      const field = addField(brief, section.id, null, {
        // Extracted facts are text, even if the model proposed a choice/material control.
        type: answer && !answerType ? (answer.length <= 300 ? "short_text" : "long_text") : fieldData.type as FieldType, label, required: core || fieldData.required,
        help: unverified ? `${help ? `${help.slice(0, 280)} ` : ""}Uzupełnij tę informację: nie udało się potwierdzić odczytanej odpowiedzi w materiale.` : help || undefined,
        options, allowOther: !answer && (fieldData.type === "single_choice" || fieldData.type === "multi_choice"),
      }, { origin: "ai", reason: backed ? `${explanation}\nZ materiału: „${evidence}”` : explanation });
      if (backed) {
        // Only literal excerpts from this request can support prefilled answers.
        brief.answers[field.id] = { ...normalizeAnswer(field, { status: "answered", value: answer }), by: "agency", at: now };
      }
      if (unverified) {
        const warning = "Części odczytanych odpowiedzi nie udało się potwierdzić cytatem z materiału. Te pola pozostawiono do uzupełnienia.";
        if (!brief.smartBrief!.warnings.includes(warning)) brief.smartBrief!.warnings.push(warning);
      }
    }
  }
  if (count < 6 || SMARTBRIEF_CORE_PURPOSES.some((key) => !covered.has(key))) throw invalid("core_fields");
  return brief;
}

/** Unknown and skipped values still lack information, even if the client has finished. */
export function smartBriefGaps(brief: Brief) {
  return questions(brief).filter(({ field }) => brief.answers[field.id]?.status !== "answered");
}
