import { IconCheck, IconReceipt, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { FIELD_TYPE_ICON } from "./icons";
import { fieldToInput } from "../shared/ops";
import { CHOICE_TYPES, type Field, type FieldInput, FIELD_TYPES } from "../shared/types";
import type { BriefStub } from "./connection";

export function FieldEditor({ field, stub, onClose }: { field: Field; stub: BriefStub; onClose: () => void }) {
  const [draft, setDraft] = useState<FieldInput>(() => fieldToInput(field));
  const [optionsText, setOptionsText] = useState(() => (field.options ?? []).map((o) => o.label).join("\n"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<FieldInput>) => setDraft((d) => ({ ...d, ...patch }));
  const isChoice = CHOICE_TYPES.includes(draft.type);
  const labels = optionsText.split("\n").map((l) => l.trim()).filter(Boolean);
  const quoted = (label: string) => (draft.quoteOptions ?? []).some((q) => q.toLowerCase() === label.toLowerCase());
  const toggleQuote = (label: string) =>
    set({
      quoteOptions: quoted(label)
        ? (draft.quoteOptions ?? []).filter((q) => q.toLowerCase() !== label.toLowerCase())
        : [...(draft.quoteOptions ?? []), label],
    });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const options = optionsText.split("\n").map((l) => l.trim()).filter(Boolean);
      await stub.updateField(field.id, { ...draft, options: isChoice ? options : undefined });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="editor" onSubmit={save}>
      <div className="type-picker" role="radiogroup" aria-label="Typ pola">
        {FIELD_TYPES.map((t) => {
          const Icon = FIELD_TYPE_ICON[t.type];
          return (
            <button
              type="button"
              key={t.type}
              role="radio"
              aria-checked={draft.type === t.type}
              className={`type-option ${draft.type === t.type ? "is-on" : ""}`}
              onClick={() => {
                set({ type: t.type });
                if (CHOICE_TYPES.includes(t.type) && !optionsText.trim()) setOptionsText("Opcja 1\nOpcja 2");
              }}
              title={t.hint}
            >
              <Icon size={16} aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      <label className="label">
        Pytanie
        <input className="input" value={draft.label} onChange={(e) => set({ label: e.target.value })} autoFocus />
      </label>
      <label className="label">
        <span>
          Podpowiedź <span className="muted">(opcjonalnie)</span>
        </span>
        <input className="input" value={draft.help ?? ""} onChange={(e) => set({ help: e.target.value })} />
      </label>

      {isChoice && (
        <>
          <label className="label">
            Opcje, każda w osobnej linii
            <textarea
              className="input"
              rows={Math.max(3, optionsText.split("\n").length)}
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
            />
          </label>
          {labels.length > 0 && (
            <div className="label" role="group" aria-label="Opcje, które zmieniają wycenę">
              <span>
                Zmieniają wycenę <span className="muted">(widzi tylko agencja)</span>
              </span>
              <div className="type-picker">
                {labels.map((label) => (
                  <button
                    type="button"
                    key={label}
                    aria-pressed={quoted(label)}
                    className={`type-option ${quoted(label) ? "is-on" : ""}`}
                    onClick={() => toggleQuote(label)}
                  >
                    <IconReceipt size={15} aria-hidden /> {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="check-row">
            <input type="checkbox" checked={Boolean(draft.allowOther)} onChange={(e) => set({ allowOther: e.target.checked })} />
            Dodaj opcję „Inne…” z polem tekstowym
          </label>
        </>
      )}

      {draft.type === "confirm" && (
        <label className="label">
          <span>
            Co już wiemy <span className="muted">(klient tylko sprawdza i klika „Zgadza się”)</span>
          </span>
          <textarea
            className="input"
            rows={3}
            placeholder="Np. Piekarnia Kowalski, NIP 123-456-78-90, ul. Długa 5, Kraków"
            value={draft.prefill ?? ""}
            onChange={(e) => set({ prefill: e.target.value })}
          />
        </label>
      )}

      {draft.type === "scale" && (
        <div className="row">
          <label className="label">
            Lewa skrajność
            <input className="input" value={draft.scaleMin ?? ""} onChange={(e) => set({ scaleMin: e.target.value })} />
          </label>
          <label className="label">
            Prawa skrajność
            <input className="input" value={draft.scaleMax ?? ""} onChange={(e) => set({ scaleMax: e.target.value })} />
          </label>
        </div>
      )}

      <label className="check-row">
        <input type="checkbox" checked={draft.required} onChange={(e) => set({ required: e.target.checked })} />
        Baza: bez tej odpowiedzi nie startujemy
      </label>

      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="btn btn-primary" disabled={busy}>
          <IconCheck size={16} aria-hidden /> Zapisz
        </button>
        <button type="button" className="btn" onClick={onClose}>
          <IconX size={16} aria-hidden /> Anuluj
        </button>
      </div>
    </form>
  );
}
