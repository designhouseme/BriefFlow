import { useEffect, useState } from "react";
import type { TemplateInfo } from "../shared/templates";
import { createBrief, getTemplates } from "./api";
import { IconArrowRight, IconCheck, IconFile, IconFilePlus, IconWorld } from "@tabler/icons-react";
import { toneOf } from "./icons";
import { Shell } from "./Shell";

const TEMPLATE_ICON: Record<string, typeof IconWorld> = { www: IconWorld, empty: IconFile };

export function Landing() {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [templateId, setTemplateId] = useState("www");
  const [clientName, setClientName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getTemplates().then(setTemplates, (e: Error) => setError(e.message));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const brief = await createBrief({ templateId, clientName, title: "" });
      location.assign(`/b/${brief.id}?k=${brief.agencyToken}&new=1`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Shell title="DH Briefing" subtitle="Design House">
      <main className="page narrow landing">
        <span className="page-icon tone-1" aria-hidden>
          <IconFilePlus size={26} stroke={1.75} />
        </span>
        <h1 className="page-title">Nowy brief</h1>
        <p className="lede">
          Dostaniesz dwa linki: swój do edycji i link dla klienta. Klient przechodzi brief jak krótką rozmowę: klika
          odpowiedzi, po jednym pytaniu, i może wrócić później.
        </p>
        <form onSubmit={submit} className="stack">
          <label className="label">
            Klient
            <input
              className="input"
              placeholder="np. Piekarnia Kowalski"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              maxLength={120}
              autoFocus
            />
          </label>
          <fieldset className="templates">
            <legend className="label">Szablon</legend>
            {templates.map((t, i) => {
              const Icon = TEMPLATE_ICON[t.id] ?? IconFile;
              return (
                <button
                  type="button"
                  key={t.id}
                  aria-pressed={templateId === t.id}
                  className={`template ${toneOf(i)}`}
                  onClick={() => setTemplateId(t.id)}
                >
                  <span className="template-head">
                    <span className="template-icon" aria-hidden>
                      <Icon size={22} stroke={1.75} />
                    </span>
                    <span className="template-mark" aria-hidden>
                      {templateId === t.id && <IconCheck size={14} stroke={3} />}
                    </span>
                  </span>
                  <strong>{t.title}</strong>
                  <span className="template-sub">{t.description}</span>
                </button>
              );
            })}
          </fieldset>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button className="btn btn-primary btn-big" disabled={busy || templates.length === 0}>
              {busy ? "Tworzę…" : "Utwórz brief"} <IconArrowRight size={18} aria-hidden />
            </button>
          </div>
        </form>
      </main>
    </Shell>
  );
}
