import {
  IconArrowRight,
  IconArrowUp,
  IconCalendarEvent,
  IconCheck,
  IconClick,
  IconClockPause,
  IconCloudCheck,
  IconFileText,
  IconHelpCircle,
  IconMessageCircle,
  IconPencil,
  IconSend,
} from "@tabler/icons-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  isSettled,
  isStepSettled,
  isStepStarted,
  nextOpen,
  nextUnsettledAfter,
  openQuestions,
  type Question,
  questions,
  resumeTarget,
  type Step,
  visibleSteps,
} from "../shared/flow";
import { baseStatus } from "../shared/checks";
import { describeAnswer, needsText, optionsOf, progress } from "../shared/ops";
import type { Answer, AnswerInput, Brief, Field, Option } from "../shared/types";
import type { BriefStub } from "./connection";
import { answerIcon, optionIcon, sectionIcon, toneOf } from "./icons";
import { percent } from "./Shell";

// Klient przechodzi brief jak rozmowę: pytanie w dymku, pod nim kafle z ikonami do kliknięcia
// w samej rozmowie, a obok rośnie „Twój brief”. Na telefonie oba widoki przełączają zakładki.

const OTHER = "__other";
/** Ile widać zaznaczenie, zanim pojawi się następne pytanie. */
const ADVANCE_DELAY = 320;
/** Szacowany czas na jedno pytanie (s), do „ok. N min” na powitaniu. */
const SECONDS_PER_QUESTION = 12;
const OTHER_OPTION: Option = { id: OTHER, label: "Inne…" };

type Screen = "intro" | "summary" | string;

function initialScreen(brief: Brief): Screen {
  if (Object.keys(brief.answers).length === 0) return "intro";
  return resumeTarget(brief) ?? "summary";
}

/** Odmiana liczebnika: 1 pytanie, 2–4 pytania, 5+ pytań (z wyjątkiem 12–14). */
function plural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one;
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}

export function ClientFlow({ brief, stub, notify }: { brief: Brief; stub: BriefStub; notify: (m: string) => void }) {
  const [screen, setScreen] = useState<Screen>(() => initialScreen(brief));
  const [tab, setTab] = useState<"chat" | "brief">("chat");
  // „Uzupełnij brakujące” prowadzi po kolei przez otwarte pytania, także pominięte, aż do wysyłki.
  const [filling, setFilling] = useState(false);
  // Następne pytanie liczymy ze świeżego stanu: odpowiedź mogła właśnie odsłonić pytanie warunkowe.
  const latest = useRef(brief);
  latest.current = brief;
  const steps = visibleSteps(brief);
  const list = questions(brief);
  const current = list.find((q) => q.field.id === screen);

  // Pytanie mogło zniknąć (zmiana odpowiedzi ukryła sekcję albo agencja je usunęła).
  useEffect(() => {
    if (screen !== "intro" && screen !== "summary" && !current) setScreen(resumeTarget(brief) ?? "summary");
  }, [screen, current, brief]);

  const go = useCallback((target: Screen) => {
    setScreen(target);
    setTab("chat");
    if (target === "summary") setFilling(false);
  }, []);

  const fill = useCallback(() => {
    const first = openQuestions(latest.current)[0];
    if (!first) return;
    setFilling(true);
    setScreen(first.field.id);
    setTab("chat");
  }, []);

  const save = useCallback(
    async (fieldId: string, input: AnswerInput) => {
      try {
        await stub.setAnswer(fieldId, input);
        return true;
      } catch (e) {
        notify((e as Error).message);
        return false;
      }
    },
    [stub, notify],
  );

  const clear = useCallback(
    async (fieldId: string) => {
      try {
        await stub.clearAnswer(fieldId);
        return true;
      } catch (e) {
        notify((e as Error).message);
        return false;
      }
    },
    [stub, notify],
  );

  if (screen === "intro") {
    return <Welcome count={list.length} onStart={() => go(resumeTarget(brief) ?? list[0]?.field.id ?? "summary")} />;
  }

  const p = progress(brief);
  const pct = percent(p.answered + p.unknown, p.total);

  return (
    <div className="room">
      <div className="room-tabs" aria-label="Widok">
        <button aria-pressed={tab === "chat"} onClick={() => setTab("chat")}>
          <IconMessageCircle size={18} aria-hidden /> Rozmowa
        </button>
        <button aria-pressed={tab === "brief"} onClick={() => setTab("brief")}>
          <IconFileText size={18} aria-hidden /> Twój brief <span className="tab-pct">{pct}%</span>
        </button>
      </div>
      <div className="room-grid">
        <section className={`chat ${tab === "chat" ? "is-shown" : ""}`} aria-label="Rozmowa">
          <Thread brief={brief} steps={steps} list={list} current={current} onEdit={go}>
            {current ? (
              <AnswerArea
                key={current.field.id}
                field={current.field}
                answer={brief.answers[current.field.id]}
                onSave={(input) => save(current.field.id, input)}
                onClear={() => clear(current.field.id)}
                onAdvance={() =>
                  go((filling ? nextUnsettledAfter : nextOpen)(latest.current, current.field.id) ?? "summary")
                }
              />
            ) : (
              <FinishActions brief={brief} stub={stub} notify={notify} onFill={fill} />
            )}
          </Thread>
        </section>
        <BriefPanel
          brief={brief}
          steps={steps}
          currentId={current?.field.id}
          shown={tab === "brief"}
          onEdit={go}
          onFinish={current ? () => go("summary") : undefined}
        />
      </div>
    </div>
  );
}

// --- Powitanie ---

function Welcome({ count, onStart }: { count: number; onStart: () => void }) {
  const minutes = Math.max(1, Math.round((count * SECONDS_PER_QUESTION) / 60));
  const how = [
    { Icon: IconClick, text: `Klikasz odpowiedzi, po jednym pytaniu. ${count} ${plural(count, "pytanie", "pytania", "pytań")}, ok. ${minutes} min.` },
    { Icon: IconHelpCircle, text: "Czegoś nie wiesz albo nie masz pod ręką? Wybierz „Nie wiem” albo „Pomiń na razie”." },
    { Icon: IconSend, text: "Na końcu sprawdzasz brief i wysyłasz go do nas." },
  ];
  return (
    <main className="welcome">
      <div className="welcome-inner">
        <span className="welcome-icon" aria-hidden>
          <IconMessageCircle size={30} stroke={1.75} />
        </span>
        <h1 className="welcome-title">Opowiedz nam o projekcie</h1>
        <p className="welcome-lead">Zamiast formularza krótka rozmowa, w której głównie klikasz.</p>
        <ol className="how">
          {how.map(({ Icon, text }, i) => (
            <li key={i} className={toneOf(i)}>
              <span className="how-icon" aria-hidden>
                <Icon size={20} stroke={1.75} />
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
        <button className="btn btn-primary btn-big welcome-start" onClick={onStart}>
          Zaczynamy <IconArrowRight size={18} aria-hidden />
        </button>
        <p className="welcome-note">
          <IconCloudCheck size={16} aria-hidden /> Wszystko zapisuje się samo. Możesz wrócić tym samym linkiem.
        </p>
      </div>
    </main>
  );
}

// --- Rozmowa ---

/** `children` to odpowiedzi do bieżącego pytania (kafle) albo przyciski wysyłki: stoją w rozmowie, pod ostatnim dymkiem. */
function Thread({
  brief,
  steps,
  list,
  current,
  onEdit,
  children,
}: {
  brief: Brief;
  steps: Step[];
  list: Question[];
  current: Question | undefined;
  onEdit: (fieldId: string) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  // Rozmowa pokazuje pytania, które już padły, do bieżącego włącznie; poprawka starszej odpowiedzi
  // cofa ją do tego miejsca. Pytania jeszcze nieruszone nie trafiają do rozmowy (to nie ma być lista).
  const upto = current ? list.indexOf(current) : list.length - 1;
  const shown = list.slice(0, upto + 1).filter((q) => q === current || brief.answers[q.field.id]);
  const open = openQuestions(brief).length;
  const untouched = list.filter((q) => !brief.answers[q.field.id]).length;
  const missingBase = baseStatus(brief).missing.length;

  // Ostatnie pytanie ma być widoczne. Przy pierwszym wejściu bez animacji, potem płynnie.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: first.current ? "auto" : "smooth" });
    first.current = false;
  }, [current?.field.id, shown.length, brief.completedAt]);

  return (
    <div className="thread" ref={ref} role="log" aria-live="polite" aria-relevant="additions">
      <Bot>Zaczynamy! Klikaj odpowiedzi, a jeśli czegoś nie wiesz, wybierz „Nie wiem”.</Bot>
      {shown.map((q, i) => {
        const StepIcon = sectionIcon(q.section);
        return (
          <div className="turn" key={q.field.id}>
            {(i === 0 || q.stepIndex !== shown[i - 1].stepIndex) && (
              <p className={`thread-step ${toneOf(q.stepIndex)}`}>
                <span className="thread-step-icon" aria-hidden>
                  <StepIcon size={15} stroke={2} />
                </span>
                Krok {q.stepIndex + 1} z {steps.length} · {q.section.title}
              </p>
            )}
            <Bot fresh={q === current} id={q === current ? "q-title" : undefined}>
              {q.field.label}
              {q.field.help && <span className="bubble-help">{q.field.help}</span>}
            </Bot>
            {q === current ? (
              <div className="turn-answer">{children}</div>
            ) : (
              <Reply field={q.field} answer={brief.answers[q.field.id]} onEdit={() => onEdit(q.field.id)} />
            )}
          </div>
        );
      })}
      {!current && (
        <>
          {brief.completedAt ? (
            <Bot fresh>
              Dziękujemy, brief jest już u nas.
              <span className="bubble-help">Możesz tu wrócić tym samym linkiem i coś zmienić albo uzupełnić.</span>
            </Bot>
          ) : (
            <Bot fresh>
              {untouched === 0 && "To już wszystkie pytania. "}
              {open
                ? `Do uzupełnienia ${open} ${plural(open, "pytanie", "pytania", "pytań")}: możesz to zrobić teraz albo później, tym samym linkiem. Możesz też wysłać to, co jest.`
                : "Dziękujemy! Sprawdź odpowiedzi i wyślij brief."}
              {missingBase > 0 &&
                ` Bez ${missingBase} ${plural(missingBase, "najważniejszej odpowiedzi", "najważniejszych odpowiedzi", "najważniejszych odpowiedzi")} nie ruszymy z projektem, ale o nie dopytamy.`}
              <span className="bubble-help">Każdą odpowiedź możesz jeszcze zmienić: kliknij ją w rozmowie.</span>
            </Bot>
          )}
          <div className="turn-answer">{children}</div>
        </>
      )}
    </div>
  );
}

/** Wiadomość od agencji: awatar DH i dymek. */
function Bot({ children, fresh, id }: { children: React.ReactNode; fresh?: boolean; id?: string }) {
  return (
    <div className={`bot ${fresh ? "is-fresh" : ""}`}>
      <span className="avatar" aria-hidden>
        DH
      </span>
      <div className="bubble bubble-bot" id={id}>
        {children}
      </div>
    </div>
  );
}

function answerText(field: Field, answer: Answer | undefined) {
  if (!answer) return "Bez odpowiedzi";
  if (answer.status === "skipped") return "Pominięte, uzupełnię później";
  if (answer.status === "unknown") return "Nie wiem";
  return describeAnswer(field, answer);
}

/** Odpowiedź klienta jako dymek z ikoną wybranej opcji. Kliknięcie wraca do pytania. */
function Reply({ field, answer, onEdit }: { field: Field; answer: Answer | undefined; onEdit: () => void }) {
  const text = answerText(field, answer);
  const Icon = answerIcon(field, answer, optionsOf(field));
  return (
    <button
      className={`bubble bubble-me ${answer?.status === "answered" ? "" : "is-tentative"}`}
      onClick={onEdit}
      aria-label={`${text}. Zmień odpowiedź na pytanie: ${field.label}`}
    >
      {Icon && <Icon className="bubble-icon" size={18} stroke={2} aria-hidden />}
      <span>{text}</span>
      <IconPencil className="bubble-edit" size={15} aria-hidden />
    </button>
  );
}

// --- Odpowiedzi w rozmowie: kafle pod pytaniem ---

interface AnswerProps {
  field: Field;
  answer: Answer | undefined;
  onSave: (input: AnswerInput) => Promise<boolean>;
  onClear: () => Promise<boolean>;
  onAdvance: () => void;
}

function AnswerArea({ field, answer, onSave, onClear, onAdvance }: AnswerProps) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Fokus na pierwszy kafel nowego pytania: z klawiatury da się iść dalej bez szukania. Tylko przy myszce
  // i klawiaturze; na telefonie obwódka fokusu wyglądałaby jak zaznaczona odpowiedź.
  useEffect(() => {
    if (!matchMedia("(pointer: fine)").matches) return;
    root.current?.querySelector<HTMLButtonElement>(".tile")?.focus({ preventScroll: true });
  }, []);

  // Klawiatura: 1–9 wybiera odpowiedź, Enter przechodzi dalej (poza polem tekstowym).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
      const choice = root.current?.querySelector<HTMLButtonElement>(`[data-key="${e.key}"]`);
      if (choice) {
        e.preventDefault();
        choice.click();
      } else if (e.key === "Enter" && target === document.body) {
        root.current?.querySelector<HTMLButtonElement>(".answer-next:not(:disabled)")?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const status = answer?.status;
  const value = status === "answered" ? answer?.value : undefined;

  /** Zapis i przejście dalej, gdy odpowiedź jest pełna. */
  const commit = async (input: AnswerInput) => {
    if (await onSave(input)) timer.current = setTimeout(onAdvance, ADVANCE_DELAY);
  };

  return (
    <div className="answer-area" ref={root}>
      <Controls field={field} answer={answer} value={value} onSave={onSave} onClear={onClear} commit={commit} />
      <div className="quick-row">
        <button
          className={`quick ${status === "unknown" ? "is-on" : ""}`}
          aria-pressed={status === "unknown"}
          onClick={() => (status === "unknown" ? onClear() : commit({ status: "unknown" }))}
        >
          <IconHelpCircle size={17} aria-hidden /> Nie wiem
        </button>
        <button
          className={`quick ${status === "skipped" ? "is-on" : ""}`}
          aria-pressed={status === "skipped"}
          onClick={() => (status === "skipped" ? onClear() : commit({ status: "skipped" }))}
        >
          <IconClockPause size={17} aria-hidden /> Pomiń na razie
        </button>
        {(answer || field.type === "multi_choice") && (
          <button
            className={`btn answer-next ${field.type === "multi_choice" ? "btn-primary" : ""}`}
            onClick={onAdvance}
            disabled={!answer}
          >
            Dalej <IconArrowRight size={17} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

function Controls({
  field,
  answer,
  value,
  onSave,
  onClear,
  commit,
}: {
  field: Field;
  answer: Answer | undefined;
  value: Answer["value"];
  onSave: (input: AnswerInput) => Promise<boolean>;
  onClear: () => Promise<boolean>;
  commit: (input: AnswerInput) => Promise<void>;
}) {
  switch (field.type) {
    case "single_choice":
    case "yes_no":
    case "material":
    case "confirm":
    case "area":
    case "deadline":
    case "consent": {
      const options = [...optionsOf(field), ...(field.type === "single_choice" && field.allowOther ? [OTHER_OPTION] : [])];
      // Wybór z dopiskiem (Inne…, link, miasto, data, poprawka) nie przechodzi dalej sam: czeka na tekst.
      const pick = (id: string) => {
        if (value === id) return onClear();
        const input: AnswerInput = { status: "answered", value: id, other: answer?.other };
        return needsText(field.type, id) ? onSave(input) : commit(input);
      };
      const pair = field.type === "yes_no" || field.type === "confirm" || field.type === "consent";
      return (
        <>
          {field.type === "confirm" && <blockquote className="prefill">{field.prefill}</blockquote>}
          <div className={`tiles ${pair ? "tiles-pair" : ""}`}>
            {options.map((o, i) => (
              <Tile key={o.id} field={field} option={o} index={i} on={value === o.id} onClick={() => pick(o.id)} />
            ))}
          </div>
          {typeof value === "string" && needsText(field.type, value) && (
            <ExtraInput
              key={value}
              field={field}
              value={value}
              saved={answer?.other ?? ""}
              onSend={(text) => commit({ status: "answered", value, other: text })}
            />
          )}
        </>
      );
    }
    case "multi_choice":
      return <MultiChoice field={field} answer={answer} value={value} onSave={onSave} onClear={onClear} commit={commit} />;
    case "scale":
      return (
        <div className="scale">
          <div className="scale-steps" role="radiogroup" aria-label={field.label}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={value === n}
                data-key={n}
                className={`tile scale-step ${value === n ? "is-on" : ""}`}
                onClick={() => (value === n ? onClear() : commit({ status: "answered", value: n }))}
              >
                {n}
                <span className="visually-hidden">
                  {" "}
                  z 5, od „{field.scaleMin}” do „{field.scaleMax}”
                </span>
              </button>
            ))}
          </div>
          <div className="scale-ends" aria-hidden>
            <span>
              <IconArrowRight className="flip" size={14} /> {field.scaleMin}
            </span>
            <span>
              {field.scaleMax} <IconArrowRight size={14} />
            </span>
          </div>
        </div>
      );
    case "short_text":
    case "long_text":
      return (
        <Composer
          saved={typeof value === "string" ? value : ""}
          label="Twoja odpowiedź"
          placeholder={field.type === "long_text" ? "Napisz kilka słów…" : "Wpisz odpowiedź"}
          autoFocus
          onSend={(text) => commit({ status: "answered", value: text })}
        />
      );
  }
}

/**
 * Wielokrotny wybór trzyma zaznaczenie lokalnie: szybkie kliknięcia jedno po drugim
 * nie mogą liczyć się ze stanu, który jeszcze nie wrócił z serwera.
 */
function MultiChoice({
  field,
  answer,
  value,
  onSave,
  onClear,
  commit,
}: {
  field: Field;
  answer: Answer | undefined;
  value: Answer["value"];
  onSave: (input: AnswerInput) => Promise<boolean>;
  onClear: () => Promise<boolean>;
  commit: (input: AnswerInput) => Promise<void>;
}) {
  const fromServer = Array.isArray(value) ? value : [];
  const [selected, setSelected] = useState<string[]>(fromServer);
  // Dopóki zapisy są w toku, stan z serwera bywa o kliknięcie w tyle: nie nadpisuje lokalnego.
  const pending = useRef(0);
  const server = useRef(fromServer);
  server.current = fromServer;
  const serverKey = fromServer.join("|");
  useEffect(() => {
    if (pending.current === 0) setSelected(server.current);
  }, [serverKey]);

  const toggle = async (id: string) => {
    const next = selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id];
    setSelected(next);
    pending.current++;
    const ok = await (next.length === 0 ? onClear() : onSave({ status: "answered", value: next, other: answer?.other }));
    pending.current--;
    if (!ok && pending.current === 0) setSelected(server.current);
  };
  const all = [...optionsOf(field), ...(field.allowOther ? [OTHER_OPTION] : [])];
  return (
    <>
      <p className="answer-hint">
        <IconCheck size={15} stroke={2.5} aria-hidden /> Możesz zaznaczyć kilka
      </p>
      <div className="tiles">
        {all.map((o, i) => (
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
        <Composer
          saved={answer?.other ?? ""}
          label="Co jeszcze?"
          placeholder="Napisz, co jeszcze"
          autoFocus
          onSend={(text) => commit({ status: "answered", value: selected, other: text })}
        />
      )}
    </>
  );
}

/** Kafel: ikona w pastelowym kółku nad podpisem, znacznik w rogu. */
function Tile({
  field,
  option,
  on,
  onClick,
  multi,
  index,
}: {
  field: Field;
  option: Option;
  on: boolean;
  onClick: () => void;
  multi?: boolean;
  index: number;
}) {
  const Icon = optionIcon(field, option);
  return (
    <button
      className={`tile ${toneOf(index)} ${on ? "is-on" : ""}`}
      aria-pressed={on}
      onClick={onClick}
      data-key={index < 9 ? index + 1 : undefined}
    >
      <span className="tile-icon" aria-hidden>
        <Icon size={22} stroke={1.75} />
      </span>
      <span className="tile-text">{option.label}</span>
      <span className={`tile-check ${multi ? "is-box" : ""}`} aria-hidden>
        {on && <IconCheck size={14} stroke={3} />}
      </span>
    </button>
  );
}

/** Dopisek do wybranej odpowiedzi: data, miasto, link, poprawka albo „Inne…”. */
function ExtraInput({
  field,
  value,
  saved,
  onSend,
}: {
  field: Field;
  value: string;
  saved: string;
  onSend: (text: string) => unknown;
}) {
  if (field.type === "deadline") return <DateInput saved={saved} onSend={onSend} />;
  const copy: Record<string, { label: string; placeholder: string }> = {
    link: { label: "Link do plików", placeholder: "Wklej link: Dysk Google, WeTransfer, Dropbox…" },
    fix: { label: "Poprawione dane", placeholder: "Popraw to, co się nie zgadza" },
    miasto: { label: "Miasto", placeholder: "Jakie miasto?" },
    okolica: { label: "Miasto i zasięg", placeholder: "Np. Kraków i 30 km wokół" },
    region: { label: "Region", placeholder: "Np. województwo małopolskie" },
  };
  const { label, placeholder } = copy[value] ?? { label: "Co dokładnie?", placeholder: "Napisz krótko, co dokładnie" };
  // Poprawkę zaczynamy od tego, co agencja wpisała: klient zmienia tylko to, co się nie zgadza.
  const start = value === "fix" ? saved || field.prefill || "" : saved;
  return <Composer saved={start} label={label} placeholder={placeholder} autoFocus onSend={onSend} />;
}

/** Wybór daty z kalendarza, zapis przyciskiem jak w polu tekstowym. */
function DateInput({ saved, onSend }: { saved: string; onSend: (iso: string) => unknown }) {
  const [date, setDate] = useState(saved);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form
      className="composer composer-date"
      onSubmit={(e) => {
        e.preventDefault();
        if (date) onSend(date);
      }}
    >
      <IconCalendarEvent className="composer-icon" size={18} aria-hidden />
      <input ref={ref} type="date" value={date} min={today} aria-label="Data" onChange={(e) => setDate(e.target.value)} />
      <button className="send" disabled={!date} aria-label="Zapisz datę">
        <IconArrowUp size={19} stroke={2.25} />
      </button>
    </form>
  );
}

/** Pole jak w czacie: rośnie z tekstem, Enter wysyła, Shift+Enter łamie wiersz. */
function Composer({
  saved,
  onSend,
  label,
  placeholder,
  autoFocus,
}: {
  saved: string;
  onSend: (text: string) => unknown;
  label: string;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState(saved);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(saved);
  }, [saved]);

  // Pole pojawia się w rozmowie (np. po „Inne…”), więc musi wjechać w widok. Na telefonie nie otwieramy
  // klawiatury bez pytania; z myszką kursor od razu stoi w polu.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (autoFocus && matchMedia("(pointer: fine)").matches) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    el.style.overflowY = el.scrollHeight > 200 ? "auto" : "hidden";
  }, [draft]);

  const send = () => {
    const text = draft.trim();
    if (text) onSend(text);
  };

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <IconPencil className="composer-icon" size={18} aria-hidden />
      <textarea
        ref={ref}
        rows={1}
        value={draft}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <button className="send" disabled={!draft.trim()} aria-label="Wyślij odpowiedź">
        <IconArrowUp size={19} stroke={2.25} />
      </button>
    </form>
  );
}

// --- Koniec rozmowy: wysyłka ---

function FinishActions({
  brief,
  stub,
  notify,
  onFill,
}: {
  brief: Brief;
  stub: BriefStub;
  notify: (m: string) => void;
  onFill: () => void;
}) {
  const open = openQuestions(brief);
  const [sending, setSending] = useState(false);

  async function finish() {
    setSending(true);
    try {
      await stub.complete();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (brief.completedAt && open.length === 0) return null;
  return (
    <div className="finish-actions">
      {!brief.completedAt && (
        <button className="btn btn-primary btn-big" onClick={finish} disabled={sending}>
          <IconSend size={18} aria-hidden /> {sending ? "Wysyłam…" : open.length ? "Wyślij to, co jest" : "Wyślij brief"}
        </button>
      )}
      {open.length > 0 && (
        <button className="btn btn-big" onClick={onFill}>
          <IconPencil size={18} aria-hidden /> Uzupełnij brakujące ({open.length})
        </button>
      )}
    </div>
  );
}

// --- Twój brief: rośnie razem z rozmową ---

function BriefPanel({
  brief,
  steps,
  currentId,
  shown,
  onEdit,
  onFinish,
}: {
  brief: Brief;
  steps: Step[];
  currentId: string | undefined;
  shown: boolean;
  onEdit: (fieldId: string) => void;
  onFinish?: () => void;
}) {
  const p = progress(brief);
  const settled = p.answered + p.unknown;

  return (
    <aside className={`brief ${shown ? "is-shown" : ""}`} aria-label="Twój brief">
      <header className="brief-head">
        <div className="brief-head-row">
          <span className="brief-head-icon" aria-hidden>
            <IconFileText size={20} stroke={1.75} />
          </span>
          <h2>Twój brief</h2>
          <span className="pct">{percent(settled, p.total)}%</span>
        </div>
        <p>
          {settled} z {p.total} odpowiedzi
          {p.skipped > 0 && `, ${p.skipped} na później`}
        </p>
        <span className="meter meter-wide" aria-hidden>
          <span style={{ width: `${percent(settled, p.total)}%` }} />
        </span>
      </header>

      <ol className="brief-body">
        {steps.map((step, i) => {
          const done = isStepSettled(brief, step);
          const now = step.fields.some((f) => f.id === currentId);
          const count = step.fields.filter((f) => isSettled(brief.answers[f.id]?.status)).length;
          const rows = step.fields.filter((f) => brief.answers[f.id] || f.id === currentId);
          const state = now ? "now" : done ? "done" : isStepStarted(brief, step) ? "open" : "todo";
          const StepIcon = done ? IconCheck : sectionIcon(step.section);
          return (
            <li key={step.section.id} className={`brief-section is-${state} ${toneOf(i)}`}>
              <div className="brief-section-head">
                <span className="brief-num" aria-hidden>
                  <StepIcon size={16} stroke={done ? 2.5 : 1.9} />
                </span>
                <h3>{step.section.title}</h3>
                <span className="brief-count">
                  {count}/{step.fields.length}
                  <span className="visually-hidden">{done ? ", gotowe" : now ? ", teraz" : ""}</span>
                </span>
              </div>
              {rows.length > 0 && (
                <ul className="brief-rows">
                  {rows.map((f) => {
                    const answer = brief.answers[f.id];
                    const isNow = f.id === currentId;
                    const Icon = answerIcon(f, answer, optionsOf(f));
                    return (
                      <li key={f.id}>
                        <button className="brief-row" aria-current={isNow ? "step" : undefined} onClick={() => onEdit(f.id)}>
                          <span className="brief-q">{f.label}</span>
                          <span className={`brief-a ${answer?.status === "answered" ? "" : "is-tentative"}`}>
                            {Icon && <Icon size={15} stroke={2} aria-hidden />}
                            {isNow && !answer ? "Odpowiadasz teraz" : answerText(f, answer)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {onFinish && !brief.completedAt && (
        <footer className="brief-foot">
          <button className="btn btn-small" onClick={onFinish}>
            <IconSend size={15} aria-hidden /> Przejdź do wysyłki
          </button>
          <span>Resztę możesz uzupełnić później.</span>
        </footer>
      )}
    </aside>
  );
}
