import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowUp,
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconHistory,
  IconListCheck,
  IconPencil,
  IconPlus,
  IconReceipt,
  IconShare2,
  IconTrash,
  IconWand,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { baseStatus, type Flag, quoteItems, redFlags } from "../shared/checks";
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
import { checkAccess, clientUrl } from "./api";
import { briefName, MainHead, useApp } from "./AppShell";
import { ClientFlow } from "./ClientFlow";
import { type BriefStub, type Run, useBriefAgent } from "./connection";
import { conditionText, FieldCard } from "./FieldCard";
import { FIELD_TYPE_ICON, sectionIcon, toneOf } from "./icons";
import { Orb } from "./Orb";
import { ClientShell, percent } from "./Shell";
import { Popover, useCopy } from "./ui";

// --- Agencja: brief w aplikacji (wejście z sesji, bez tokenu w adresie) ---

export function AgencyBrief({ id, search }: { id: string; search: string }) {
  const [access, setAccess] = useState<AccessInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setAccess(null);
    setError("");
    checkAccess(id).then(setAccess, (e: Error) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <>
        <MainHead title="Brief" />
        <div className="panel">
          <div className="empty">
            <span className="empty-icon tone-4" aria-hidden>
              <IconAlertCircle size={26} stroke={1.75} />
            </span>
            <h2>Nie można otworzyć briefu</h2>
            <p>{error}</p>
          </div>
        </div>
      </>
    );
  }
  if (!access) return <PanelLoading />;
  return <ConnectedAgency id={id} aiEnabled={access.aiEnabled} isNew={new URLSearchParams(search).has("new")} />;
}

function PanelLoading() {
  return (
    <>
      <MainHead title="Wczytuję…" />
      <div className="panel">
        <div className="empty">
          <Orb size={44} className="pulse-soft" />
          <p>Wczytuję brief…</p>
        </div>
      </div>
    </>
  );
}

function briefStatus(brief: Brief): { label: string; tone: string } {
  if (brief.completedAt) return { label: "Wysłany", tone: "badge-green" };
  if (Object.values(brief.answers).some((a) => a.by === "client")) return { label: "Klient odpowiada", tone: "badge-blue" };
  return { label: "Szkic", tone: "" };
}

function ConnectedAgency({ id, aiEnabled, isNew }: { id: string; aiEnabled: boolean; isNew: boolean }) {
  const { notify, patchBrief } = useApp();
  const agent = useBriefAgent(id);
  const brief = agent.state;
  const [editing, setEditing] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const run: Run = useCallback(
    async (action) => {
      try {
        return await action();
      } catch (e) {
        notify((e as Error).message);
        return undefined;
      }
    },
    [notify],
  );

  // Zmiany na żywo (odpowiedzi klienta, nazwa) od razu w liście po lewej.
  useEffect(() => {
    if (!brief) return;
    const p = progress(brief);
    patchBrief(id, {
      title: brief.title,
      clientName: brief.clientName,
      settled: p.answered + p.unknown,
      total: p.total,
      completedAt: brief.completedAt,
      updatedAt: brief.updatedAt,
    });
  }, [brief, id, patchBrief]);

  // Pasek adresu bez ?new=1: to on trafia do zakładek.
  useEffect(() => {
    if (isNew) history.replaceState(null, "", `/app/b/${id}`);
  }, [isNew, id]);

  if (!brief) return <PanelLoading />;
  const status = briefStatus(brief);
  const flags = redFlags(brief);

  return (
    <>
      <MainHead
        title={briefName(brief)}
        titleAction={<MetaEditor brief={brief} stub={agent.stub} run={run} />}
        badge={<span className={`badge ${status.tone}`}>{status.label}</span>}
        actions={
          <>
            <button className="btn" onClick={() => setHistoryOpen(true)}>
              <IconHistory size={17} aria-hidden /> <span className="hide-sm">Historia</span>
            </button>
            <SharePopover id={id} stub={agent.stub} />
          </>
        }
      />
      <div className="panel">
        <div className="panel-scroll">
          <div className="editor-page">
            {isNew && <NewBriefNote id={id} stub={agent.stub} />}
            <Overview brief={brief} />
            <Checks brief={brief} flags={flags} />
            {brief.sections.map((section, index) => (
              <SectionBlock
                key={section.id}
                index={index}
                flags={flags}
                brief={brief}
                section={section}
                stub={agent.stub}
                run={run}
                editing={editing}
                setEditing={setEditing}
              />
            ))}
            <AddSection stub={agent.stub} run={run} />
          </div>
        </div>
        <AiDock brief={brief} stub={agent.stub} run={run} aiEnabled={aiEnabled} />
        {historyOpen && <HistorySheet stub={agent.stub} updatedAt={brief.updatedAt} onClose={() => setHistoryOpen(false)} />}
      </div>
    </>
  );
}

/** Nazwa briefu i klienta: zmiana w małym panelu przy tytule. */
function MetaEditor({ brief, stub, run }: { brief: Brief; stub: BriefStub; run: Run }) {
  return (
    <Popover trigger={<IconPencil size={16} />} triggerClass="icon-btn" label="Zmień nazwę briefu" align="start">
      {(close) => <MetaForm brief={brief} stub={stub} run={run} onDone={close} />}
    </Popover>
  );
}

function MetaForm({ brief, stub, run, onDone }: { brief: Brief; stub: BriefStub; run: Run; onDone: () => void }) {
  const [title, setTitle] = useState(brief.title);
  const [clientName, setClientName] = useState(brief.clientName);
  return (
    <form
      className="pop-form"
      onSubmit={async (e) => {
        e.preventDefault();
        await run(() => stub.updateMeta({ title, clientName }));
        onDone();
      }}
    >
      <label className="label">
        Klient
        <input className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} maxLength={120} autoFocus />
      </label>
      <label className="label">
        Nazwa briefu
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </label>
      <div className="row">
        <button className="btn btn-primary">
          <IconCheck size={16} aria-hidden /> Zapisz
        </button>
        <button type="button" className="btn btn-quiet" onClick={onDone}>
          Anuluj
        </button>
      </div>
    </form>
  );
}

function useClientLink(id: string, stub: BriefStub) {
  const [token, setToken] = useState("");
  useEffect(() => {
    stub.getClientToken().then(setToken, () => {});
  }, [stub]);
  return token ? clientUrl(id, token) : "";
}

function SharePopover({ id, stub }: { id: string; stub: BriefStub }) {
  return (
    <Popover
      trigger={
        <>
          <IconShare2 size={17} aria-hidden /> <span className="hide-sm">Udostępnij</span>
        </>
      }
      label="Udostępnij klientowi"
    >
      {() => <ShareBody id={id} stub={stub} />}
    </Popover>
  );
}

function ShareBody({ id, stub }: { id: string; stub: BriefStub }) {
  const url = useClientLink(id, stub);
  const { copied, copy } = useCopy();
  return (
    <div className="share">
      <p className="share-title">Link dla klienta</p>
      <p className="share-text">Klient otwiera go bez logowania i może wracać tym samym linkiem.</p>
      <input className="input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Link dla klienta" />
      <div className="row">
        <button className="btn btn-primary" onClick={() => copy(url)} disabled={!url}>
          {copied ? <IconCheck size={16} aria-hidden /> : <IconCopy size={16} aria-hidden />}
          {copied ? "Skopiowano" : "Kopiuj link"}
        </button>
        {url && (
          <a className="btn" href={url} target="_blank" rel="noreferrer">
            <IconExternalLink size={16} aria-hidden /> Otwórz jako klient
          </a>
        )}
      </div>
    </div>
  );
}

function NewBriefNote({ id, stub }: { id: string; stub: BriefStub }) {
  const url = useClientLink(id, stub);
  const { copied, copy } = useCopy();
  return (
    <section className="note-card" aria-label="Brief gotowy">
      <span className="note-icon" aria-hidden>
        <IconCheck size={18} stroke={2.5} />
      </span>
      <div className="note-text">
        <strong>Brief gotowy.</strong> Sprawdź pytania i wyślij klientowi link.
      </div>
      <button className="btn btn-primary" onClick={() => copy(url)} disabled={!url}>
        {copied ? <IconCheck size={16} aria-hidden /> : <IconCopy size={16} aria-hidden />}
        {copied ? "Skopiowano" : "Kopiuj link dla klienta"}
      </button>
    </section>
  );
}

function Overview({ brief }: { brief: Brief }) {
  const p = progress(brief);
  const open = openQuestions(brief).length;
  const settled = p.answered + p.unknown;
  const sent = brief.completedAt
    ? `Klient wysłał brief ${new Date(brief.completedAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}${open ? `, ${open} do uzupełnienia.` : "."}`
    : open
      ? `${open} pytań jeszcze otwartych.`
      : "Wszystko uzupełnione.";
  return (
    <section className="overview" aria-label="Postęp">
      <div className="overview-num">
        <strong>{percent(settled, p.total)}%</strong>
        <span>
          {settled} z {p.total} odpowiedzi
          {p.skipped > 0 && `, ${p.skipped} pominięte`}
        </span>
      </div>
      <span className="meter meter-wide" aria-hidden>
        <span style={{ width: `${percent(settled, p.total)}%` }} />
      </span>
      <p className="overview-note">{sent}</p>
    </section>
  );
}

/** Przed startem: czego brakuje w Bazie, na co reagować od razu i co idzie do wyceny. */
function Checks({ brief, flags }: { brief: Brief; flags: Flag[] }) {
  const base = baseStatus(brief);
  const quotes = quoteItems(brief);
  const jump = (fieldId: string) => document.getElementById(fieldId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  const SHOWN = 6;

  return (
    <section className="checks" aria-label="Przed startem">
      <div className="check-card">
        <div className="check-head">
          <span className={`check-icon ${base.missing.length ? "tone-1" : "tone-3"}`} aria-hidden>
            {base.missing.length ? <IconListCheck size={19} stroke={1.9} /> : <IconCheck size={19} stroke={2.4} />}
          </span>
          <h2>Baza</h2>
          <span className="check-count">
            {base.done}/{base.total}
          </span>
        </div>
        <p className="check-lede">{base.missing.length ? "Bez tego nie startujemy:" : "Komplet, można startować."}</p>
        {base.missing.length > 0 && (
          <ul className="check-list">
            {base.missing.slice(0, SHOWN).map((f) => (
              <li key={f.id}>
                <button className="check-item" onClick={() => jump(f.id)}>
                  {f.label}
                </button>
              </li>
            ))}
            {base.missing.length > SHOWN && <li className="check-more">i {base.missing.length - SHOWN} więcej</li>}
          </ul>
        )}
      </div>

      <div className="check-card">
        <div className="check-head">
          <span className={`check-icon ${flags.length ? "tone-4" : "tone-3"}`} aria-hidden>
            <IconAlertTriangle size={19} stroke={1.9} />
          </span>
          <h2>Do uwagi</h2>
          <span className="check-count">{flags.length}</span>
        </div>
        {flags.length ? (
          <ul className="check-list">
            {flags.map((flag) => (
              <li key={flag.title}>
                <button className="check-item" onClick={() => jump(flag.fieldId)}>
                  <strong>{flag.title}</strong>
                  <span>{flag.advice}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="check-lede">Nic niepokojącego w odpowiedziach.</p>
        )}
      </div>

      <div className="check-card">
        <div className="check-head">
          <span className="check-icon tone-2" aria-hidden>
            <IconReceipt size={19} stroke={1.9} />
          </span>
          <h2>Do wyceny</h2>
          <span className="check-count">{quotes.length}</span>
        </div>
        {quotes.length ? (
          <>
            <ul className="check-list">
              {quotes.map((item) => (
                <li key={item.fieldId + item.text}>
                  <button className="check-item" onClick={() => jump(item.fieldId)}>
                    {item.text}
                  </button>
                </li>
              ))}
            </ul>
            <p className="check-note">Do podsumowania: w zakresie albo poza nim, z osobną wyceną.</p>
          </>
        ) : (
          <p className="check-lede">Nic poza podstawowym zakresem.</p>
        )}
      </div>
    </section>
  );
}

function SectionBlock({
  index,
  flags,
  brief,
  section,
  stub,
  run,
  editing,
  setEditing,
}: {
  index: number;
  flags: Flag[];
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
          <IconTrash size={15} aria-hidden /> <span className="hide-sm">Usuń sekcję</span>
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
          flags={flags.filter((f) => f.fieldId === field.id)}
        />
      ))}
      {section.fields.length === 0 && <p className="section-empty">Sekcja jest pusta.</p>}
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

function HistorySheet({ stub, updatedAt, onClose }: { stub: BriefStub; updatedAt: number; onClose: () => void }) {
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    stub.getLog().then(setEntries, () => setEntries([]));
  }, [updatedAt, stub]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside className="sheet" aria-label="Historia zmian">
      <div className="sheet-head">
        <h2>Historia zmian</h2>
        <button className="icon-btn" ref={closeRef} onClick={onClose} aria-label="Zamknij historię">
          <IconX size={18} />
        </button>
      </div>
      {entries === null ? (
        <p className="sheet-empty">Wczytuję…</p>
      ) : entries.length === 0 ? (
        <p className="sheet-empty">Jeszcze nic się nie wydarzyło.</p>
      ) : (
        <ol className="log">
          {entries.map((entry, i) => (
            <li key={i}>
              <span className={`log-who is-${entry.actor}`}>{ACTOR[entry.actor]}</span>
              <span className="log-text">{entry.text}</span>
              <time>{new Date(entry.at).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}</time>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

/** Polecenie dla AI jak pole czatu na dole panelu. Cofnij działa także dla zmian ręcznych. */
function AiDock({ brief, stub, run, aiEnabled }: { brief: Brief; stub: BriefStub; run: Run; aiEnabled: boolean }) {
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
    <form className="dock" onSubmit={submit}>
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
          <button type="button" className="icon-btn ai-result-close" onClick={() => setResult(null)} aria-label="Zamknij">
            <IconX size={16} />
          </button>
        </div>
      )}
      <div className={`composer-box ${busy ? "is-busy" : ""}`}>
        <label className="composer-line">
          <IconWand size={18} className="composer-lead" aria-hidden />
          <span className="visually-hidden">Polecenie dla AI</span>
          <input
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
        </label>
        <div className="composer-bar">
          <button
            type="button"
            className="btn"
            disabled={!brief.canUndo || busy}
            onClick={() => run(() => stub.undo())}
            title="Cofa ostatnią zmianę pytań (ręczną albo AI)"
          >
            <IconArrowBackUp size={17} aria-hidden /> Cofnij
          </button>
          <button className="btn btn-primary" disabled={!aiEnabled || busy || !command.trim()}>
            <IconArrowUp size={17} stroke={2.2} aria-hidden /> {busy ? "AI pracuje…" : "Wykonaj"}
          </button>
        </div>
      </div>
      <p className="dock-note">AI zmienia tylko pytania, nie odpowiedzi. Każde polecenie możesz cofnąć.</p>
    </form>
  );
}

// --- Klient: publiczny link z tokenem ---

export function ClientBriefPage({ id, token }: { id: string; token: string }) {
  const [access, setAccess] = useState<AccessInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("W linku brakuje klucza.");
      return;
    }
    checkAccess(id, token).then(setAccess, (e: Error) => setError(e.message));
  }, [id, token]);

  if (error) {
    return (
      <ClientShell>
        <div className="empty">
          <span className="empty-icon tone-4" aria-hidden>
            <IconAlertCircle size={26} stroke={1.75} />
          </span>
          <h2>Nie można otworzyć briefu</h2>
          <p>{error} Poproś osobę, która przysłała link, o nowy.</p>
        </div>
      </ClientShell>
    );
  }
  if (!access) return <ClientLoading />;
  if (access.role === "agency") {
    return (
      <ClientShell>
        <div className="empty">
          <Orb size={56} />
          <h2>To link do edycji briefu</h2>
          <p>Briefy edytujesz teraz w aplikacji DH Briefing, po zalogowaniu adresem firmowym.</p>
          <a className="btn btn-primary" href="/app">
            Otwórz aplikację
          </a>
        </div>
      </ClientShell>
    );
  }
  return <ConnectedClient id={id} token={token} />;
}

function ClientLoading() {
  return (
    <ClientShell>
      <div className="empty">
        <Orb size={44} className="pulse-soft" />
        <p>Wczytuję brief…</p>
      </div>
    </ClientShell>
  );
}

function ConnectedClient({ id, token }: { id: string; token: string }) {
  const agent = useBriefAgent(id, token);
  const brief = agent.state;
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!brief) return <ClientLoading />;
  const p = progress(brief);
  return (
    <ClientShell title={brief.title} subtitle={brief.clientName || undefined} value={percent(p.answered + p.unknown, p.total)}>
      <ClientFlow brief={brief} stub={agent.stub} notify={setToast} />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </ClientShell>
  );
}
