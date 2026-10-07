import {
  IconAlertCircle,
  IconArrowBackUp,
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconHistory,
  IconLink,
  IconPlus,
  IconTrash,
  IconUserShare,
  IconWand,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { openQuestions } from "../shared/flow";
import { isSectionVisible, progress } from "../shared/ops";
import {
  type AccessInfo,
  type AiResult,
  type Brief,
  CHOICE_TYPES,
  type FieldInput,
  FIELD_TYPES,
  type FieldType,
  type LogEntry,
  type Section,
} from "../shared/types";
import { briefUrl, checkAccess } from "./api";
import { ClientFlow } from "./ClientFlow";
import { type BriefStub, type Run, useBriefAgent } from "./connection";
import { conditionText, FieldCard } from "./FieldCard";
import { FIELD_TYPE_ICON, sectionIcon, toneOf } from "./icons";
import { percent, Progress, Shell } from "./Shell";

export function BriefPage({ id, token }: { id: string; token: string }) {
  const [access, setAccess] = useState<AccessInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    checkAccess(id, token).then(setAccess, (e: Error) => setError(e.message));
  }, [id, token]);

  if (error) {
    return (
      <Shell title="DH Briefing">
        <main className="page narrow">
          <span className="page-icon tone-4" aria-hidden>
            <IconAlertCircle size={26} stroke={1.75} />
          </span>
          <h1 className="page-title">Nie można otworzyć briefu</h1>
          <p className="lede">{error} Poproś osobę, która przysłała link, o nowy.</p>
        </main>
      </Shell>
    );
  }
  if (!access) return <Loading />;
  return <ConnectedBrief id={id} token={token} access={access} />;
}

function Loading() {
  return (
    <Shell title="DH Briefing">
      <main className="page narrow">
        <p className="muted">Wczytuję brief…</p>
      </main>
    </Shell>
  );
}

function ConnectedBrief({ id, token, access }: { id: string; token: string; access: AccessInfo }) {
  const agent = useBriefAgent(id, token);
  const brief = agent.state;
  const [toast, setToast] = useState("");

  const run: Run = useCallback(async (action) => {
    try {
      return await action();
    } catch (e) {
      setToast((e as Error).message);
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!brief) return <Loading />;
  const isClient = access.role === "client";
  const p = progress(brief);

  return (
    <Shell
      title={brief.title}
      subtitle={brief.clientName || undefined}
      right={<Progress value={percent(p.answered + p.unknown, p.total)} label={isClient ? undefined : "Widok agencji"} />}
      home={!isClient}
      fill={isClient}
    >
      {isClient ? (
        <ClientFlow brief={brief} stub={agent.stub} notify={setToast} />
      ) : (
        <AgencyView id={id} token={token} brief={brief} stub={agent.stub} run={run} aiEnabled={access.aiEnabled} />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </Shell>
  );
}

// --- Widok agencji: pełna lista do edycji ---

function AgencyView({
  id,
  token,
  brief,
  stub,
  run,
  aiEnabled,
}: {
  id: string;
  token: string;
  brief: Brief;
  stub: BriefStub;
  run: Run;
  aiEnabled: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const p = progress(brief);
  const open = openQuestions(brief).length;

  return (
    <div className="agency">
      <main className="page">
        <div className="agency-head">
          <h1 className="page-title">{brief.title}</h1>
          <p className="agency-status">
            {p.answered + p.unknown} z {p.total} odpowiedzi
            {p.skipped > 0 && `, ${p.skipped} pominięte`}
            {brief.completedAt
              ? `. Klient wysłał brief ${new Date(brief.completedAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}${open ? `, ${open} do uzupełnienia` : ""}.`
              : "."}
          </p>
        </div>

        <SharePanel id={id} agencyToken={token} stub={stub} />

        {brief.sections.map((section, index) => (
          <SectionBlock
            key={section.id}
            index={index}
            brief={brief}
            section={section}
            stub={stub}
            run={run}
            editing={editing}
            setEditing={setEditing}
          />
        ))}

        <AddSection stub={stub} run={run} />
        <History stub={stub} updatedAt={brief.updatedAt} />
      </main>
      <AiBar brief={brief} stub={stub} run={run} aiEnabled={aiEnabled} />
    </div>
  );
}

function SharePanel({ id, agencyToken, stub }: { id: string; agencyToken: string; stub: BriefStub }) {
  const [clientToken, setClientToken] = useState("");
  const [isNew] = useState(() => new URLSearchParams(location.search).has("new"));

  useEffect(() => {
    // Pasek adresu ma pokazywać czysty link, bo to on zwykle trafia do zakładek.
    if (isNew) history.replaceState(null, "", `${location.pathname}?k=${agencyToken}`);
  }, [isNew, agencyToken]);

  useEffect(() => {
    stub.getClientToken().then(setClientToken, () => {});
  }, [stub]);

  const clientUrl = clientToken ? briefUrl(id, clientToken) : "";

  return (
    <section className={`share ${isNew ? "is-new" : ""}`} aria-label="Linki">
      {isNew && (
        <p className="share-note">
          <IconCheck size={18} stroke={2.5} aria-hidden /> Brief gotowy. Zapisz swój link: to jedyny dostęp do edycji tego
          briefu.
        </p>
      )}
      <CopyRow icon={<IconUserShare size={18} />} label="Link dla klienta" value={clientUrl}>
        {clientUrl && (
          <a className="btn btn-quiet" href={clientUrl} target="_blank" rel="noreferrer">
            <IconExternalLink size={16} aria-hidden /> Zobacz jak klient
          </a>
        )}
      </CopyRow>
      <CopyRow icon={<IconLink size={18} />} label="Twój link (edycja)" value={briefUrl(id, agencyToken)} />
    </section>
  );
}

function CopyRow({
  icon,
  label,
  value,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* schowek niedostępny: link da się zaznaczyć ręcznie */
    }
  }
  return (
    <div className="copy-row">
      <span className="copy-label">
        <span className="copy-icon" aria-hidden>
          {icon}
        </span>
        {label}
      </span>
      <input className="input copy-input" readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label={label} />
      <div className="copy-actions">
        <button className="btn" onClick={copy} disabled={!value}>
          {copied ? <IconCheck size={16} aria-hidden /> : <IconCopy size={16} aria-hidden />}
          {copied ? "Skopiowano" : "Kopiuj"}
        </button>
        {children}
      </div>
    </div>
  );
}

function SectionBlock({
  index,
  brief,
  section,
  stub,
  run,
  editing,
  setEditing,
}: {
  index: number;
  brief: Brief;
  section: Section;
  stub: BriefStub;
  run: Run;
  editing: string | null;
  setEditing: (id: string | null) => void;
}) {
  const hidden = !isSectionVisible(brief, section);
  const Icon = sectionIcon(section);
  return (
    <section className={`section ${hidden ? "is-conditional" : ""}`}>
      <div className="section-head">
        <span className={`section-num ${toneOf(index)}`} aria-hidden>
          <Icon size={18} stroke={1.9} />
        </span>
        <h2 className="section-title">{section.title}</h2>
        <button
          className="link-btn danger"
          onClick={() => confirm(`Usunąć sekcję „${section.title}” razem z pytaniami?`) && run(() => stub.removeSection(section.id))}
        >
          <IconTrash size={15} aria-hidden /> Usuń sekcję
        </button>
      </div>
      {section.description && <p className="section-desc">{section.description}</p>}
      {section.showIf && <p className="condition">{conditionText(brief, section.showIf)}</p>}

      {section.fields.map((field) => (
        <FieldCard
          key={field.id}
          brief={brief}
          field={field}
          role="agency"
          stub={stub}
          run={run}
          editing={editing === field.id}
          setEditing={setEditing}
        />
      ))}
      {section.fields.length === 0 && <p className="muted small">Sekcja jest pusta.</p>}
      <AddField section={section} stub={stub} run={run} onCreated={setEditing} />
    </section>
  );
}

function defaultInput(type: FieldType): FieldInput {
  return {
    type,
    label: "Nowe pytanie",
    options: CHOICE_TYPES.includes(type) ? ["Opcja 1", "Opcja 2"] : undefined,
    scaleMin: type === "scale" ? "Mało" : undefined,
    scaleMax: type === "scale" ? "Dużo" : undefined,
    required: false,
  };
}

function AddField({
  section,
  stub,
  run,
  onCreated,
}: {
  section: Section;
  stub: BriefStub;
  run: Run;
  onCreated: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="add-btn" onClick={() => setOpen(true)}>
        <IconPlus size={16} aria-hidden /> Dodaj pytanie
      </button>
    );
  }
  return (
    <div className="palette">
      <p className="label">Jaki typ pytania?</p>
      <div className="palette-grid">
        {FIELD_TYPES.map((t, i) => {
          const Icon = FIELD_TYPE_ICON[t.type];
          return (
            <button
              key={t.type}
              className={`palette-item ${toneOf(i)}`}
              onClick={async () => {
                const id = await run(() => stub.addField(section.id, null, defaultInput(t.type)));
                setOpen(false);
                if (id) onCreated(id);
              }}
            >
              <span className="palette-icon" aria-hidden>
                <Icon size={18} stroke={1.9} />
              </span>
              <strong>{t.label}</strong>
              <span>{t.hint}</span>
            </button>
          );
        })}
      </div>
      <button className="link-btn" onClick={() => setOpen(false)}>
        <IconX size={15} aria-hidden /> Anuluj
      </button>
    </div>
  );
}

function AddSection({ stub, run }: { stub: BriefStub; run: Run }) {
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="add-btn add-section" onClick={() => setOpen(true)}>
        <IconPlus size={16} aria-hidden /> Dodaj sekcję
      </button>
    );
  }
  return (
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        await run(() => stub.addSection(title, null));
        setTitle("");
        setOpen(false);
      }}
    >
      <input
        className="input"
        placeholder="Tytuł sekcji, np. SEO i analityka"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Tytuł sekcji"
        autoFocus
      />
      <button className="btn btn-primary">Dodaj</button>
      <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>
        Anuluj
      </button>
    </form>
  );
}

const ACTOR: Record<LogEntry["actor"], string> = { agency: "Agencja", client: "Klient", ai: "AI" };

function History({ stub, updatedAt }: { stub: BriefStub; updatedAt: number }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    if (open) stub.getLog().then(setEntries, () => {});
  }, [open, updatedAt, stub]);

  return (
    <details className="history" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <IconHistory size={18} aria-hidden /> Historia zmian
      </summary>
      <ol>
        {entries.map((entry, i) => (
          <li key={i}>
            <time>{new Date(entry.at).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}</time>
            <span className="who">{ACTOR[entry.actor]}</span>
            <span>{entry.text}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function AiBar({ brief, stub, run, aiEnabled }: { brief: Brief; stub: BriefStub; run: Run; aiEnabled: boolean }) {
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiResult | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!command.trim() || busy) return;
    setBusy(true);
    setResult(null);
    const outcome = await run(() => stub.runAiCommand(command));
    setBusy(false);
    if (outcome) {
      setResult(outcome);
      if (outcome.ok) setCommand("");
    }
  }

  return (
    <div className="ai-bar">
      <div className="ai-inner">
        {result && (
          <div className={`ai-result ${result.ok ? "" : "is-error"}`} role="status">
            <p>{result.summary}</p>
            {result.changes.length > 0 && (
              <ul>
                {result.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
            <button className="link-btn" onClick={() => setResult(null)}>
              Zamknij
            </button>
          </div>
        )}
        <form className="ai-form" onSubmit={submit}>
          <span className="ai-icon" aria-hidden>
            <IconWand size={19} stroke={1.9} />
          </span>
          <input
            className="input ai-input"
            aria-label="Polecenie dla AI"
            placeholder={
              aiEnabled
                ? "Napisz, co dodać lub zmienić, np. „dodaj pytania o wysyłkę za granicę”"
                : "AI wyłączone: dodaj GEMINI_API_KEY do .dev.vars"
            }
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            disabled={!aiEnabled || busy}
            maxLength={1000}
          />
          <button className="btn btn-primary" disabled={!aiEnabled || busy || !command.trim()}>
            {busy ? "AI pracuje…" : "Wykonaj"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!brief.canUndo || busy}
            onClick={() => run(() => stub.undo())}
            title="Cofa ostatnią zmianę pytań (ręczną albo AI)"
          >
            <IconArrowBackUp size={16} aria-hidden /> Cofnij
          </button>
        </form>
      </div>
    </div>
  );
}
