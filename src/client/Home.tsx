import { IconArrowRight, IconArrowUp, IconCircleCheck, IconFileText, IconPencil, IconWand, IconWorld, IconX } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BriefSummary } from "../shared/account";
import { questions } from "../shared/flow";
import { briefFromTemplate, TEMPLATE_LIST } from "../shared/templates";
import { createBrief } from "./api";
import { briefName, firstName, MainHead, useApp } from "./AppShell";
import { ShaderOrb } from "./ShaderOrb";
import { navigate, onLinkClick } from "./router";
import { SmartBriefCreator } from "./SmartBrief";

const SECONDS_PER_QUESTION = 12;

/** Ile pytań klient zobaczy na starcie (bez warunkowych, które jeszcze się nie odsłoniły). */
function templateSize(id: string) {
  const count = questions(briefFromTemplate(id, { id: "x", title: "", clientName: "" })).length;
  return { count, minutes: Math.max(1, Math.round((count * SECONDS_PER_QUESTION) / 60)) };
}

function pct(b: BriefSummary) {
  return b.total ? Math.round((b.settled / b.total) * 100) : 0;
}

function when(at: number) {
  const date = new Date(at);
  const today = new Date().toDateString() === date.toDateString();
  return today
    ? `dziś, ${date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`
    : date.toLocaleDateString("pl-PL", { day: "numeric", month: "long" });
}

export function Home({ search }: { search: string }) {
  const { me, briefs, refresh, notify, templates, templatesLoaded, templatesError, refreshTemplates, usage, usageError, refreshUsage } = useApp();
  const preset = new URLSearchParams(search).get("szablon");
  const available = [...TEMPLATE_LIST, ...templates];
  const [templateId, setTemplateId] = useState(preset || "www");
  const [clientName, setClientName] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"template" | "smart">("template");

  // Zmiana adresu wybiera szablon przed kolejnym renderem. Odświeżenie listy nie nadpisuje
  // późniejszego wyboru użytkownika, a własny szablon nie zamienia się po drodze na WWW.
  const [lastPreset, setLastPreset] = useState(preset);
  if (preset !== lastPreset) {
    setLastPreset(preset);
    setTemplateId(preset || "www");
    setMode("template");
  }
  const selectedTemplate = available.find((template) => template.id === templateId);
  const customSelection = !TEMPLATE_LIST.some((template) => template.id === templateId);
  const templatePending = customSelection && !templatesLoaded;
  const templateError = customSelection && templatesLoaded
    ? templatesError || (!selectedTemplate ? "Ten szablon nie jest już dostępny. Wybierz inny szablon." : "")
    : "";
  const briefLimitReached = Boolean(usage && usage.briefs.used >= usage.briefs.limit);
  const creationBlocked = busy || templatePending || Boolean(templateError) || !usage || briefLimitReached;

  const www = useMemo(() => templateSize("www"), []);

  // Z myszką kursor od razu stoi w polu; na telefonie nie otwieramy klawiatury bez pytania.
  useEffect(() => {
    if (matchMedia("(pointer: fine)").matches) input.current?.focus({ preventScroll: true });
  }, []);
  const open = (briefs ?? []).filter((b) => !b.completedAt).slice(0, 3);
  const latest = briefs?.[0];

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (creationBlocked) return;
    setBusy(true);
    try {
      const brief = await createBrief({ templateId, clientName, title: "" });
      refresh();
      navigate(`/app/b/${brief.id}?new=1`);
    } catch (e) {
      notify((e as Error).message);
      void refreshUsage();
      setBusy(false);
    }
  }

  const pickTemplate = (id: string) => {
    setMode("template");
    setTemplateId(id);
    input.current?.focus();
  };

  return (
    <>
      <MainHead title="Nowy brief" />
      <div className="panel">
        <div className="panel-scroll">
          <div className="home">
            <div className="home-orb" aria-hidden>
              <ShaderOrb size={240} />
            </div>

            <h2 className="home-title">Cześć, {firstName(me.email)}</h2>
            <p className="home-lead">Dla kogo przygotujemy brief? Resztę ustawisz po drodze.</p>
            {usage && <p className="home-usage">Wersja darmowa: {usage.briefs.used}/{usage.briefs.limit} aktywne briefy · {usage.ai.limit} poleceń AI miesięcznie</p>}

            {mode === "smart" ? <SmartBriefCreator onBusy={setBusy} onClose={() => setMode("template")} /> : <>
            <button className="smartbrief-entry" disabled={busy} onClick={() => setMode("smart")}>
              <span className="smartbrief-mark tone-5" aria-hidden><IconWand size={18} stroke={1.9} /></span>
              <span className="smartbrief-entry-text">
                <strong>Masz już notatki lub transkrypcję?</strong>
                <span>SmartBrief zamieni je w brief dopasowany do branży.</span>
              </span>
              <span className="badge badge-soft">{usage?.smartBriefs ? `${Math.max(0, usage.smartBriefs.limit - usage.smartBriefs.used)} z ${usage.smartBriefs.limit} Free` : "3 Free"}</span>
              <IconArrowRight size={16} aria-hidden />
            </button>

            <div className="home-cards">
              <button className="card card-dark" onClick={() => pickTemplate("www")} aria-pressed={templateId === "www"}>
                <span className="card-top">
                  <span className="card-icon" aria-hidden>
                    <IconWorld size={18} stroke={1.9} />
                  </span>
                  <span className="badge badge-blue">{templateId === "www" ? "Wybrany" : "Szablon"}</span>
                </span>
                <strong className="card-title">Strona WWW</strong>
                <span className="card-body">
                  Firma, cel, zakres, sklep, wygląd, materiały, termin i budżet. {www.count} pytań, około {www.minutes} min
                  dla klienta.
                </span>
              </button>

              <div className="card">
                {open.length > 0 ? (
                  <>
                    <ul className="card-list">
                      {open.map((b) => (
                        <li key={b.id}>
                          <a href={`/app/b/${b.id}`} onClick={(e) => onLinkClick(e, `/app/b/${b.id}`)}>
                            <IconFileText size={17} stroke={1.8} aria-hidden />
                            <span>{briefName(b)}</span>
                            <span className="card-num">{pct(b)}%</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                    <span className="card-foot">
                      <span>Czekają na klienta</span>
                    </span>
                  </>
                ) : (
                  <>
                    <ol className="card-list card-steps">
                      <li>
                        <span className="card-step">1</span> Wpisz klienta i wybierz szablon
                      </li>
                      <li>
                        <span className="card-step">2</span> Wyślij klientowi link
                      </li>
                      <li>
                        <span className="card-step">3</span> Odpowiedzi zobaczysz na żywo
                      </li>
                    </ol>
                    <span className="card-foot">
                      <span>Jak to działa</span>
                    </span>
                  </>
                )}
              </div>

              {latest ? (
                <a className="card card-link" href={`/app/b/${latest.id}`} onClick={(e) => onLinkClick(e, `/app/b/${latest.id}`)}>
                  <strong className="card-title">{briefName(latest)}</strong>
                  <span className="card-body">
                    {latest.completedAt
                      ? "Brief zakończony."
                      : `${latest.settled} z ${latest.total} odpowiedzi.`}
                  </span>
                  <span className="meter meter-wide" aria-hidden>
                    <span style={{ width: `${pct(latest)}%` }} />
                  </span>
                  <span className="card-foot">
                    <span>Ostatnia zmiana: {when(latest.updatedAt)}</span>
                    {latest.completedAt && <IconCircleCheck size={17} aria-hidden />}
                  </span>
                </a>
              ) : (
                <div className="card">
                  <span className="card-body card-quote">„Dodaj pytania o sklep z wysyłką za granicę”</span>
                  <span className="card-foot">
                    <span>
                      <IconWand size={15} aria-hidden /> Przykładowe polecenie dla AI
                    </span>
                  </span>
                </div>
              )}
            </div>
            </>}
          </div>
        </div>

        {mode === "template" && <form className="dock" onSubmit={create}>
          <div className="bar">
            <span className="bar-lead tone-1" aria-hidden>
              <IconPencil size={19} stroke={1.9} />
            </span>
            <label className="bar-field">
              <span className="visually-hidden">Klient</span>
              <input
                ref={input}
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Dla kogo jest brief? Np. Piekarnia Kowalski"
                maxLength={120}
              />
            </label>
            {templateId !== "www" && (
              <button
                type="button"
                className="bar-chip"
                onClick={() => setTemplateId("www")}
                aria-label={`Szablon: ${selectedTemplate?.title || (templatePending ? "wczytywanie" : "niedostępny")}. Wróć do szablonu Strona WWW`}
              >
                {selectedTemplate?.title || (templatePending ? "Wczytuję szablon…" : "Niedostępny szablon")}
                <IconX size={14} stroke={2.4} aria-hidden />
              </button>
            )}
            <button className="btn-send" disabled={creationBlocked}>
              <span className="btn-send-label">{busy ? "Tworzę…" : templatePending || (!usage && !usageError) ? "Wczytuję…" : "Utwórz brief"}</span>
              <span className="btn-send-icon" aria-hidden>
                <IconArrowUp size={18} stroke={2.4} />
              </span>
            </button>
          </div>
          {briefLimitReached && usage ? <p className="dock-note usage-limit" role="status">
            Masz {usage.briefs.limit} aktywne briefy. Zakończ jeden w menu „Więcej akcji briefu” albo usuń niepotrzebny z listy. Zakończone briefy zostają dostępne.
          </p> : !usage ? <p className={`dock-note ${usageError ? "usage-error" : ""}`} role={usageError ? "alert" : "status"}>
            {usageError || "Sprawdzam limit aktywnych briefów…"} {usageError && <button type="button" className="btn btn-small btn-quiet" onClick={() => void refreshUsage()}>Spróbuj ponownie</button>}
          </p> : templatePending ? <p className="dock-note" role="status">Wczytuję wybrany szablon…</p> : templateError ? (
            <p className="dock-note form-error" role="alert">
              {templateError} {templatesError && <button type="button" className="btn btn-small btn-quiet" onClick={refreshTemplates}>Spróbuj ponownie</button>}
            </p>
          ) : <p className="dock-note">Klient dostanie swój link. Pytania zmienisz potem ręcznie albo poleceniem dla AI.</p>}
        </form>}
      </div>
    </>
  );
}
