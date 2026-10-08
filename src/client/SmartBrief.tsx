import { IconAlertTriangle, IconArrowRight, IconCheck, IconListCheck, IconWand, IconX } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { SMARTBRIEF_MAX_CHARACTERS, SMARTBRIEF_MIN_CHARACTERS, smartBriefGaps } from "../shared/smartbrief";
import { questions } from "../shared/flow";
import type { Brief } from "../shared/types";
import { createSmartBrief } from "./api";
import { useApp } from "./AppShell";
import { navigate } from "./router";
import { scrollToElement } from "./ui";
import "./smartbrief.css";

/** Tworzenie briefu z materiału: karta w tym samym języku co qcard, akcja na dole karty. */
export function SmartBriefCreator({ onBusy, onClose }: { onBusy: (busy: boolean) => void; onClose?: () => void }) {
  const { me, usage, usageError, refreshUsage, refresh } = useApp();
  const [source, setSource] = useState("");
  const [clientName, setClientName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const quota = usage?.smartBriefs;
  const remaining = quota ? Math.max(0, quota.limit - quota.used) : 0;
  const full = Boolean(usage && usage.briefs.used >= usage.briefs.limit);
  const valid = source.trim().length >= SMARTBRIEF_MIN_CHARACTERS && source.length <= SMARTBRIEF_MAX_CHARACTERS;
  const blocked = busy || !me.aiEnabled || !quota || remaining === 0 || full || !valid;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (blocked || submitting.current) return;
    submitting.current = true;
    setBusy(true); onBusy(true); setError("");
    try {
      const result = await createSmartBrief({ source, clientName });
      refresh();
      navigate(`/app/b/${result.id}`);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false); onBusy(false);
      void refreshUsage();
    }
  }

  return <form className="smartbrief-create" onSubmit={submit} aria-busy={busy}>
    <header className="smartbrief-head">
      <span className="smartbrief-mark tone-5" aria-hidden><IconWand size={18} stroke={1.9} /></span>
      <div className="smartbrief-head-text">
        <h3>SmartBrief</h3>
        <p>Wklej notatki, mail albo transkrypcję. AI rozpozna branżę, dobierze pytania i odczyta, co już wiadomo.</p>
      </div>
      <span className="badge badge-soft">{quota ? `${remaining} z ${quota.limit}` : "Sprawdzam limit…"}</span>
      <button type="button" className="icon-btn" disabled={busy} onClick={() => onClose?.()} aria-label="Zamknij SmartBrief i wróć do szablonów">
        <IconX size={18} />
      </button>
    </header>

    <label className="label">
      Materiał do briefu
      <textarea
        className="input"
        id="smartbrief-source"
        value={source}
        onChange={(event) => { setSource(event.target.value); setError(""); }}
        disabled={busy}
        maxLength={SMARTBRIEF_MAX_CHARACTERS}
        aria-describedby="smartbrief-source-hint"
        placeholder={'Np. Rozmawiałem z właścicielką studia jogi. Potrzebuje strony z grafikiem zajęć i zapisami online. Ma logo i zdjęcia, chce wystartować w listopadzie. Klientami są osoby początkujące z Gdańska. Budżetu jeszcze nie ustaliliśmy…'}
      />
      <span id="smartbrief-source-hint" className="smartbrief-count">
        Minimum {SMARTBRIEF_MIN_CHARACTERS} znaków
        <span>{source.length.toLocaleString("pl-PL")} / {SMARTBRIEF_MAX_CHARACTERS.toLocaleString("pl-PL")}</span>
      </span>
    </label>

    <label className="label">
      Nazwa klienta <span className="muted">(opcjonalnie)</span>
      <input
        className="input"
        id="smartbrief-client"
        value={clientName}
        onChange={(event) => setClientName(event.target.value)}
        maxLength={120}
        disabled={busy}
        placeholder="AI może odczytać ją z materiału"
      />
    </label>

    {error && <p className="form-error" role="alert">{error}</p>}
    {!me.aiEnabled ? <p className="flag" role="status">
        <IconAlertTriangle size={17} aria-hidden />
        <span>SmartBrief będzie dostępny po włączeniu AI.</span>
      </p>
      : !quota ? <p className={`smartbrief-status ${usageError ? "form-error" : ""}`} role={usageError ? "alert" : "status"}>
        {usageError || "Sprawdzam limit SmartBriefów…"} {usageError && <button type="button" className="btn btn-small btn-quiet" onClick={() => void refreshUsage()}>Spróbuj ponownie</button>}
      </p>
      : remaining === 0 ? <p className="flag" role="status">
        <IconAlertTriangle size={17} aria-hidden />
        <span>Wykorzystano wszystkie {quota.limit} SmartBriefy Free. Briefy z szablonu tworzysz dalej.</span>
      </p>
      : full ? <p className="flag" role="status">
        <IconAlertTriangle size={17} aria-hidden />
        <span>Masz {usage!.briefs.limit} aktywne briefy. Zakończ lub usuń jeden, aby utworzyć SmartBrief.</span>
      </p> : null}

    <footer className="smartbrief-foot">
      <p className="smartbrief-note">
        Free: 3 SmartBriefy łącznie, błąd analizy nie zużywa limitu. Materiał trafia do AI; w briefie zostają odpowiedzi i krótkie cytaty źródłowe, nie cała transkrypcja.
      </p>
      <button className="btn btn-primary" disabled={blocked}>
        <IconWand size={17} className={busy ? "pulse-soft" : ""} aria-hidden />
        {busy ? "Tworzę SmartBrief…" : "Utwórz SmartBrief"}
      </button>
    </footer>
    {busy && <p className="smartbrief-working" role="status">Analizuję materiał, dobieram pytania i sprawdzam braki. To może potrwać do minuty.</p>}
  </form>;
}

/** Raport nad sekcjami briefu: co AI odczytało i czego jeszcze brakuje. Braki prowadzą do pytania. */
export function SmartBriefReview({ brief }: { brief: Brief }) {
  const report = brief.smartBrief;
  if (!report) return null;
  const gaps = smartBriefGaps(brief);
  const critical = gaps.filter(({ field }) => field.required);
  const rest = gaps.filter(({ field }) => !field.required);
  const total = questions(brief).length;
  const filled = total - gaps.length;

  const gapRow = (label: string, id: string, required: boolean) => (
    <li key={id}>
      <button className="smartbrief-gap" onClick={() => scrollToElement(id)}>
        <span className="smartbrief-gap-text">{label}</span>
        {required && <span className="badge badge-soft"><IconListCheck size={14} aria-hidden /> Baza</span>}
        <IconArrowRight size={15} aria-hidden />
      </button>
    </li>
  );

  return <section className="smartbrief-review" aria-labelledby="smartbrief-review-title">
    <header className="smartbrief-head">
      <span className="smartbrief-mark tone-5" aria-hidden><IconWand size={18} stroke={1.9} /></span>
      <div className="smartbrief-head-text">
        <h2 id="smartbrief-review-title">{report.projectType}</h2>
        <p>{report.industry} · {filled} z {total} pytań ma odpowiedź</p>
      </div>
      <span className="badge badge-ai" title="Pytania i odczytane odpowiedzi przygotowało AI z Twojego materiału">SmartBrief</span>
    </header>
    <p className="smartbrief-summary">{report.summary}</p>

    {report.warnings.length > 0 && <div className="flag smartbrief-warnings">
      <IconAlertTriangle size={17} aria-hidden />
      <div>
        <strong>Do wyjaśnienia</strong>
        <ul>{report.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
      </div>
    </div>}

    <p className="smartbrief-hint">Sprawdź odczytane informacje: przy pytaniach z odpowiedzią znajdziesz cytat z materiału. Lista braków aktualizuje się po każdej odpowiedzi.</p>

    {critical.length > 0 && <div className="smartbrief-group">
      <h3 className="aside-title">Ustal przed startem</h3>
      <ul className="smartbrief-gaps">{critical.map(({ field }) => gapRow(field.label, field.id, true))}</ul>
    </div>}
    {rest.length > 0 && <details className="smartbrief-group smartbrief-more" open={critical.length === 0}>
      <summary>Pozostałe do uzupełnienia ({rest.length})</summary>
      <ul className="smartbrief-gaps">{rest.map(({ field }) => gapRow(field.label, field.id, false))}</ul>
    </details>}
    {gaps.length === 0 && <p className="smartbrief-done">
      <IconCheck size={17} stroke={2.4} aria-hidden />
      <span>Wszystkie pytania mają odpowiedzi. Sprawdź jeszcze poprawność ustaleń.</span>
    </p>}
  </section>;
}
