import { IconArrowUp, IconCircleCheck, IconFileText, IconPencil, IconWand, IconWorld, IconX } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BriefSummary } from "../shared/account";
import { questions } from "../shared/flow";
import { briefFromTemplate, TEMPLATE_LIST } from "../shared/templates";
import { createBrief } from "./api";
import { briefName, firstName, MainHead, useApp } from "./AppShell";
import { Orb } from "./Orb";
import { navigate, onLinkClick } from "./router";

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
  const { me, briefs, refresh, notify } = useApp();
  const preset = new URLSearchParams(search).get("szablon");
  const [templateId, setTemplateId] = useState(TEMPLATE_LIST.some((t) => t.id === preset) ? preset! : "www");
  const [clientName, setClientName] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Wybór szablonu z listy bocznej zmienia adres, a ten sam ekran zostaje: przestawiamy wybór.
  const [lastPreset, setLastPreset] = useState(preset);
  if (preset !== lastPreset) {
    setLastPreset(preset);
    if (preset && TEMPLATE_LIST.some((t) => t.id === preset)) setTemplateId(preset);
  }

  const www = useMemo(() => templateSize("www"), []);

  // Z myszką kursor od razu stoi w polu; na telefonie nie otwieramy klawiatury bez pytania.
  useEffect(() => {
    if (matchMedia("(pointer: fine)").matches) input.current?.focus({ preventScroll: true });
  }, []);
  const open = (briefs ?? []).filter((b) => !b.completedAt).slice(0, 3);
  const latest = briefs?.[0];

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const brief = await createBrief({ templateId, clientName, title: "" });
      refresh();
      navigate(`/app/b/${brief.id}?new=1`);
    } catch (e) {
      notify((e as Error).message);
      setBusy(false);
    }
  }

  const pickTemplate = (id: string) => {
    setTemplateId(id);
    input.current?.focus();
  };

  return (
    <>
      <MainHead title="Nowy brief" />
      <div className="panel">
        <div className="panel-scroll">
          <div className="home">
            <Orb size={72} className="home-orb" />
            <h2 className="home-title">Cześć, {firstName(me.email)}</h2>
            <p className="home-lead">Dla kogo przygotujemy brief? Resztę ustawisz po drodze.</p>

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
                      ? "Klient wysłał brief."
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
          </div>
        </div>

        <form className="dock" onSubmit={create}>
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
                aria-label={`Szablon: ${TEMPLATE_LIST.find((t) => t.id === templateId)?.title}. Wróć do szablonu Strona WWW`}
              >
                {TEMPLATE_LIST.find((t) => t.id === templateId)?.title}
                <IconX size={14} stroke={2.4} aria-hidden />
              </button>
            )}
            <button className="btn-send" disabled={busy}>
              <span className="btn-send-label">{busy ? "Tworzę…" : "Utwórz brief"}</span>
              <span className="btn-send-icon" aria-hidden>
                <IconArrowUp size={18} stroke={2.4} />
              </span>
            </button>
          </div>
          <p className="dock-note">Klient dostanie swój link. Pytania zmienisz potem ręcznie albo poleceniem dla AI.</p>
        </form>
      </div>
    </>
  );
}
