import {
  IconAlertTriangle,
  IconCheck,
  IconClockPause,
  IconHelpCircle,
  IconListCheck,
  IconPencil,
  IconTrash,
  IconWand,
} from "@tabler/icons-react";
import type { Flag } from "../shared/checks";
import { useEffect, useRef, useState } from "react";
import { findField, isFieldVisible, needsText, optionsOf } from "../shared/ops";
import type { Answer, AnswerInput, Brief, Field, Option, Role, ShowIf } from "../shared/types";
import type { BriefStub, Run } from "./connection";
import { FieldEditor } from "./FieldEditor";
import { optionIcon, toneOf } from "./icons";

const OTHER = "__other";

export function conditionText(brief: Brief, showIf: ShowIf): string {
  try {
    const { field } = findField(brief, showIf.fieldId);
    const option = optionsOf(field).find((o) => o.id === showIf.equals);
    return `Klient zobaczy to, gdy w „${field.label}” wybierze „${option?.label ?? showIf.equals}”.`;
  } catch {
    return "";
  }
}

interface Props {
  brief: Brief;
  field: Field;
  role: Role;
  stub: BriefStub;
  run: Run;
  editing: boolean;
  setEditing: (fieldId: string | null) => void;
  flags?: Flag[];
}

export function FieldCard({ brief, field, role, stub, run, editing, setEditing, flags = [] }: Props) {
  const answer = brief.answers[field.id];
  const save = (input: AnswerInput) => run(() => stub.setAnswer(field.id, input));
  const clear = () => run(() => stub.clearAnswer(field.id));
  const hidden = !isFieldVisible(brief, field);
  const status = answer?.status;

  if (editing) {
    return (
      <div className="field is-editing" id={field.id}>
        <FieldEditor field={field} stub={stub} onClose={() => setEditing(null)} />
      </div>
    );
  }

  return (
    <div className={`field ${hidden ? "is-conditional" : ""}`} id={field.id}>
      <div className="field-head">
        <div className="field-title">
          <h3 className="field-q">{field.label}</h3>
          {field.required && (
            <span className="tag" title="Bez tej odpowiedzi nie startujemy">
              <IconListCheck size={14} aria-hidden /> Baza
            </span>
          )}
          {role === "agency" && field.origin === "ai" && (
            <span className="tag tag-ai" title={field.reason ?? "Dodane przez AI"}>
              <IconWand size={14} aria-hidden /> AI
            </span>
          )}
        </div>
        {role === "agency" && (
          <div className="field-tools">
            <button className="link-btn" onClick={() => setEditing(field.id)}>
              <IconPencil size={15} aria-hidden /> Edytuj
            </button>
            <button
              className="link-btn danger"
              onClick={() => confirm(`Usunąć pytanie „${field.label}”?`) && run(() => stub.removeField(field.id))}
            >
              <IconTrash size={15} aria-hidden /> Usuń
            </button>
          </div>
        )}
      </div>
      {field.help && <p className="help">{field.help}</p>}
      {role === "agency" && field.showIf && <p className="condition">{conditionText(brief, field.showIf)}</p>}
      {flags.map((flag) => (
        <p className="flag" key={flag.title}>
          <IconAlertTriangle size={17} aria-hidden />
          <span>
            <strong>{flag.title}.</strong> {flag.advice}
          </span>
        </p>
      ))}

      <AnswerControls field={field} answer={answer} save={save} clear={clear} />

      <div className="field-foot">
        <button
          className={`quick ${status === "unknown" ? "is-on" : ""}`}
          aria-pressed={status === "unknown"}
          onClick={() => (status === "unknown" ? clear() : save({ status: "unknown" }))}
        >
          <IconHelpCircle size={15} aria-hidden /> Nie wiem
        </button>
        <button
          className={`quick ${status === "skipped" ? "is-on" : ""}`}
          aria-pressed={status === "skipped"}
          onClick={() => (status === "skipped" ? clear() : save({ status: "skipped" }))}
        >
          <IconClockPause size={15} aria-hidden /> {status === "skipped" ? "Pominięte" : "Pomiń na razie"}
        </button>
        {role === "agency" && answer && (
          <span className="who">odp. {answer.by === "client" ? "klient" : "agencja"}</span>
        )}
      </div>
    </div>
  );
}

function AnswerControls({
  field,
  answer,
  save,
  clear,
}: {
  field: Field;
  answer: Answer | undefined;
  save: (input: AnswerInput) => void;
  clear: () => void;
}) {
  const answered = answer?.status === "answered";
  const value = answered ? answer.value : undefined;

  switch (field.type) {
    case "single_choice":
    case "yes_no":
    case "material":
    case "confirm":
    case "area":
    case "deadline":
    case "consent": {
      const options = optionsOf(field);
      const showOther = field.type === "single_choice" && field.allowOther;
      const pick = (id: string) => (value === id ? clear() : save({ status: "answered", value: id, other: answer?.other }));
      const pair = field.type === "yes_no" || field.type === "confirm" || field.type === "consent";
      const placeholder: Record<string, string> = {
        link: "Wklej link (Dysk Google, WeTransfer…)",
        fix: "Poprawione dane",
        miasto: "Jakie miasto?",
        okolica: "Miasto i zasięg, np. Kraków i 30 km",
        region: "Np. województwo małopolskie",
      };
      return (
        <>
          {field.type === "confirm" && <blockquote className="prefill">{field.prefill}</blockquote>}
          <div className={`pills ${pair ? "pills-pair" : ""}`}>
            {[...options, ...(showOther ? [{ id: OTHER, label: "Inne…" }] : [])].map((o, i) => (
              <Tile key={o.id} field={field} option={o} index={i} on={value === o.id} onClick={() => pick(o.id)} />
            ))}
          </div>
          {typeof value === "string" && needsText(field.type, value) && (
            <div className="text-answer">
              {field.type === "deadline" ? (
                <input
                  className="input"
                  type="date"
                  aria-label="Data"
                  value={answer?.other ?? ""}
                  onChange={(e) => e.target.value && save({ status: "answered", value, other: e.target.value })}
                />
              ) : (
                <TextAnswer
                  key={value}
                  saved={answer?.other ?? (value === "fix" ? (field.prefill ?? "") : "")}
                  placeholder={placeholder[value] ?? "Napisz, co dokładnie"}
                  onSave={(text) => save({ status: "answered", value, other: text })}
                />
              )}
            </div>
          )}
        </>
      );
    }
    case "multi_choice": {
      const selected = Array.isArray(value) ? value : [];
      const toggle = (id: string) => {
        const next = selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id];
        if (next.length === 0) clear();
        else save({ status: "answered", value: next, other: answer?.other });
      };
      return (
        <>
          <div className="pills">
            {[...optionsOf(field), ...(field.allowOther ? [{ id: OTHER, label: "Inne…" }] : [])].map((o, i) => (
              <Tile
                key={o.id}
                field={field}
                option={o}
                index={i}
                on={selected.includes(o.id)}
                onClick={() => toggle(o.id)}
                multi
              />
            ))}
          </div>
          {selected.includes(OTHER) && (
            <TextAnswer
              saved={answer?.other ?? ""}
              placeholder="Napisz, co jeszcze"
              onSave={(text) => save({ status: "answered", value: selected, other: text })}
            />
          )}
        </>
      );
    }
    case "scale": {
      return (
        <div className="scale">
          <div className="scale-steps" role="radiogroup" aria-label={field.label}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={value === n}
                aria-label={`${n} z 5`}
                className={`scale-step ${value === n ? "is-on" : ""}`}
                onClick={() => (value === n ? clear() : save({ status: "answered", value: n }))}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="scale-ends" aria-hidden>
            <span>{field.scaleMin}</span>
            <span>{field.scaleMax}</span>
          </div>
        </div>
      );
    }
    case "short_text":
    case "long_text":
      return (
        <TextAnswer
          multiline={field.type === "long_text"}
          saved={typeof value === "string" ? value : ""}
          placeholder={field.type === "long_text" ? "Napisz kilka słów…" : "Wpisz odpowiedź"}
          onSave={(text) => (text ? save({ status: "answered", value: text }) : answered && clear())}
        />
      );
  }
}

function Tile({
  field,
  option,
  index,
  on,
  onClick,
  multi,
}: {
  field: Field;
  option: Option;
  index: number;
  on: boolean;
  onClick: () => void;
  multi?: boolean;
}) {
  const Icon = optionIcon(field, option);
  return (
    <button className={`pill ${toneOf(index)} ${on ? "is-on" : ""}`} aria-pressed={on} onClick={onClick}>
      <span className="pill-icon" aria-hidden>
        {on && multi ? <IconCheck size={15} stroke={2.5} /> : <Icon size={16} stroke={1.9} />}
      </span>
      {option.label}
      {option.quote && <span className="pill-quote">wycena</span>}
    </button>
  );
}

/** Pole tekstowe zapisywane przy wyjściu z pola (lub Enter). Odpowiedź z serwera nadpisuje szkic, gdy pole nie ma fokusu. */
function TextAnswer({
  saved,
  onSave,
  placeholder,
  multiline,
}: {
  saved: string;
  onSave: (text: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(saved);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(saved);
  }, [saved]);

  const commit = () => {
    const text = draft.trim();
    if (text !== saved.trim()) onSave(text);
  };

  const props = {
    ref,
    className: "input",
    value: draft,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
  };
  return (
    <div className="text-answer">
      {multiline ? (
        <textarea {...props} rows={3} />
      ) : (
        <input {...props} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      )}
      {draft.trim() !== saved.trim() && <span className="saving-hint">Zapisze się po wyjściu z pola</span>}
    </div>
  );
}
