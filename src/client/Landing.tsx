import {
  IconArrowRight,
  IconArrowUp,
  IconBuildingStore,
  IconCalendarMonth,
  IconCheck,
  IconClockPause,
  IconCopy,
  IconCreditCard,
  IconHelpCircle,
  IconHourglass,
  IconLanguage,
  IconLifebuoy,
  IconLink,
  IconListCheck,
  IconMail,
  IconPlus,
  IconTruckDelivery,
  IconUsers,
  IconWand,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { Me } from "../shared/account";
import { getMe, primeMe } from "./api";
import { AuthForm } from "./AuthForm";
import { Orb } from "./Orb";
import { navigate } from "./router";

// Strona startowa: od razu prowadzi do aplikacji. Formularz logowania stoi w pierwszym ekranie,
// a po kodzie z maila widok przechodzi płynnie w aplikację (View Transitions).

export function Landing() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const formSlot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMe().then(setMe, () => setMe(null));
  }, []);

  const openApp = async () => {
    const known = me ?? (await getMe().catch(() => null));
    if (known) primeMe(known);
    navigate("/app", { transition: true });
  };
  const focusLogin = () => {
    if (me) return openApp();
    formSlot.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    formSlot.current?.querySelector("input")?.focus({ preventScroll: true });
  };

  return (
    <div className="site">
      <header className="site-nav">
        <a className="brand" href="/">
          <Orb size={30} className="vt-orb" />
          <span>DH Briefing</span>
        </a>
        <nav className="site-links" aria-label="Sekcje">
          <a href="#jak">Jak to działa</a>
          <a href="#agencja">Dla agencji</a>
          <a href="#pytania">Pytania</a>
        </nav>
        {me ? (
          <button className="btn btn-primary" onClick={openApp}>
            Otwórz aplikację <IconArrowRight size={17} aria-hidden />
          </button>
        ) : (
          <button className="btn" onClick={focusLogin}>
            Zaloguj się
          </button>
        )}
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1>Brief, który klient przechodzi jak rozmowę</h1>
            <p className="hero-lead">
              Zamiast formularza krótka rozmowa, w której klient głównie klika. Gdy czegoś nie wie, wybiera „Nie wiem” albo
              wraca później tym samym linkiem. Ty widzisz odpowiedzi na żywo.
            </p>
            <div className="hero-form vt-panel" ref={formSlot}>
              {me === undefined ? (
                <div className="auth-placeholder" aria-hidden />
              ) : me ? (
                <div className="signed-in">
                  <button className="btn btn-primary btn-big" onClick={openApp}>
                    Otwórz aplikację <IconArrowRight size={18} aria-hidden />
                  </button>
                  <p className="auth-note">Zalogowano jako {me.email}</p>
                </div>
              ) : (
                <AuthForm onDone={openApp} />
              )}
            </div>
            <ul className="hero-facts">
              <li>
                <IconCheck size={16} stroke={2.4} aria-hidden /> Klient nie zakłada konta
              </li>
              <li>
                <IconCheck size={16} stroke={2.4} aria-hidden /> Działa na telefonie
              </li>
              <li>
                <IconCheck size={16} stroke={2.4} aria-hidden /> Dane briefów w UE
              </li>
            </ul>
          </div>
          <HeroDemo />
        </section>

        <section className="site-section" id="jak" aria-labelledby="jak-title">
          <h2 className="site-h2" id="jak-title">
            Jak to działa
          </h2>
          <ol className="steps">
            <li className="step">
              <div className="step-text">
                <span className="step-num">1</span>
                <h3>Tworzysz brief</h3>
                <p>Wpisujesz klienta i wybierasz szablon. Pytania zmienisz ręcznie albo poleceniem dla AI.</p>
              </div>
              <div className="mini mini-composer" aria-hidden>
                <span className="mini-input">Piekarnia Kowalski</span>
                <span className="mini-row">
                  <span className="mini-chip">
                    <IconWorld size={15} /> Strona WWW
                  </span>
                  <span className="mini-send">
                    <IconArrowUp size={16} stroke={2.4} />
                  </span>
                </span>
              </div>
            </li>
            <li className="step">
              <div className="step-text">
                <span className="step-num">2</span>
                <h3>Wysyłasz link</h3>
                <p>Klient dostaje jeden link. Bez konta i bez hasła, w przeglądarce na telefonie albo laptopie.</p>
              </div>
              <div className="mini mini-link" aria-hidden>
                <span className="mini-link-icon">
                  <IconLink size={16} />
                </span>
                <span className="mini-url">…/b/Xk2pQ8rT4mNa</span>
                <span className="mini-btn">
                  <IconCopy size={15} /> Kopiuj
                </span>
              </div>
            </li>
            <li className="step">
              <div className="step-text">
                <span className="step-num">3</span>
                <h3>Widzisz odpowiedzi na żywo</h3>
                <p>Brief uzupełnia się przy każdym kliknięciu. Możecie też wypełniać go razem na spotkaniu.</p>
              </div>
              <div className="mini mini-progress" aria-hidden>
                <span className="mini-progress-head">
                  <strong>Piekarnia Kowalski</strong>
                  <span>40%</span>
                </span>
                <span className="meter meter-wide">
                  <span style={{ width: "40%" }} />
                </span>
                <span className="mini-answer">
                  <span>Branża</span>
                  <strong>Gastronomia</strong>
                </span>
              </div>
            </li>
          </ol>
        </section>

        <section className="site-section split" aria-labelledby="klient-title">
          <div>
            <h2 className="site-h2" id="klient-title">
              Klient nie wypełnia formularza
            </h2>
            <ul className="principles">
              <li>
                <strong>Jedno pytanie naraz.</strong> Klient nie widzi ściany pytań, tylko to, na które właśnie odpowiada.
              </li>
              <li>
                <strong>Klika zamiast pisać.</strong> Pole tekstowe pojawia się tylko tam, gdzie kliknięcie nie wystarczy.
              </li>
              <li>
                <strong>Niewiedza to też odpowiedź.</strong> „Nie wiem” i „Pomiń na razie” nigdy nie blokują dalszej drogi.
              </li>
              <li>
                <strong>Może wrócić później.</strong> Wszystko zapisuje się samo, a link prowadzi tam, gdzie klient przerwał.
              </li>
            </ul>
          </div>
          <div className="mini mini-question" aria-hidden>
            <div className="bot">
              <Orb size={30} className="avatar-orb" />
              <div className="bubble bubble-bot">Logo w wersji wektorowej</div>
            </div>
            <div className="tiles">
              <span className="tile tone-1">
                <span className="tile-icon">
                  <IconMail size={22} stroke={1.75} />
                </span>
                <span className="tile-text">Mam, wyślę mailem</span>
              </span>
              <span className="tile tone-2">
                <span className="tile-icon">
                  <IconLink size={22} stroke={1.75} />
                </span>
                <span className="tile-text">Mam, podam link</span>
              </span>
              <span className="tile tone-3">
                <span className="tile-icon">
                  <IconLifebuoy size={22} stroke={1.75} />
                </span>
                <span className="tile-text">Nie mam, potrzebuję pomocy</span>
              </span>
            </div>
            <div className="quick-row">
              <span className="quick">
                <IconHelpCircle size={17} /> Nie wiem
              </span>
              <span className="quick is-on">
                <IconClockPause size={17} /> Pomiń na razie
              </span>
            </div>
          </div>
        </section>

        <section className="site-section" id="agencja" aria-labelledby="agencja-title">
          <h2 className="site-h2" id="agencja-title">
            Ty dostajesz brief, z którym da się zacząć projekt
          </h2>
          <div className="bento">
            <article className="bento-card bento-wide">
              <div className="bento-text">
                <h3>Polecenia dla AI</h3>
                <p>Napisz, co dodać albo zmienić, a AI przerobi pytania. Każde polecenie to jeden krok do cofnięcia.</p>
              </div>
              <div className="mini mini-ai" aria-hidden>
                <span className="mini-input">
                  <IconWand size={17} /> Dodaj pytania o wysyłkę za granicę
                </span>
                <span className="mini-result">
                  <span>
                    <IconPlus size={14} /> Pole „Do jakich krajów wysyłacie?”
                  </span>
                  <span>
                    <IconPlus size={14} /> Pole „Kto płaci za zwroty?”
                  </span>
                </span>
              </div>
            </article>
            <article className="bento-card">
              <div className="bento-text">
                <h3>Przed startem</h3>
                <p>Widzisz, czego brakuje w Bazie, na co reagować od razu i co idzie do osobnej wyceny.</p>
              </div>
              <ul className="mini mini-checks" aria-hidden>
                <li>
                  <span className="mini-check-icon tone-1">
                    <IconListCheck size={15} />
                  </span>
                  Baza <strong>9/12</strong>
                </li>
                <li>
                  <span className="mini-check-icon tone-4">
                    <IconUsers size={15} />
                  </span>
                  Projekt zatwierdza kilka osób
                </li>
                <li>
                  <span className="mini-check-icon tone-2">
                    <IconLanguage size={15} />
                  </span>
                  Wersja w innym języku
                </li>
              </ul>
            </article>
            <article className="bento-card">
              <div className="bento-text">
                <h3>Historia zmian</h3>
                <p>Kto, co i kiedy odpowiedział albo zmienił. Zmiany pytań da się cofnąć, odpowiedzi zostają.</p>
              </div>
              <ol className="mini mini-log" aria-hidden>
                <li>
                  <span>Klient</span> Termin: do miesiąca
                </li>
                <li>
                  <span>AI</span> Dodano pole „Metody dostawy”
                </li>
                <li>
                  <span>Agencja</span> Cofnięto zmianę pytań
                </li>
              </ol>
            </article>
            <article className="bento-card bento-wide">
              <div className="bento-text">
                <h3>Pytania, które pojawiają się same</h3>
                <p>Pytania o płatności i dostawę zobaczy tylko klient, który zaznaczy sklep internetowy.</p>
              </div>
              <div className="mini mini-condition" aria-hidden>
                <span className="mini-chip is-on">
                  <IconCheck size={15} stroke={2.4} /> Sklep: tak
                </span>
                <IconArrowRight size={18} className="mini-arrow" />
                <span className="mini-chip">
                  <IconCreditCard size={15} /> Metody płatności
                </span>
                <span className="mini-chip">
                  <IconTruckDelivery size={15} /> Metody dostawy
                </span>
              </div>
            </article>
          </div>
        </section>

        <section className="site-section faq" id="pytania" aria-labelledby="pytania-title">
          <h2 className="site-h2" id="pytania-title">
            Pytania
          </h2>
          <div className="faq-list">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <IconPlus className="faq-icon" size={18} aria-hidden />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="cta" aria-labelledby="cta-title">
          <Orb size={64} />
          <div className="cta-text">
            <h2 id="cta-title">Zacznij od pierwszego briefu</h2>
            <p>Zaloguj się adresem firmowym i utwórz brief z szablonu „Strona WWW”.</p>
          </div>
          <button className="btn btn-invert btn-big" onClick={focusLogin}>
            {me ? "Otwórz aplikację" : "Zaloguj się"} <IconArrowRight size={18} aria-hidden />
          </button>
        </section>
      </main>

      <footer className="site-foot">
        <span>DH Briefing, narzędzie Design House</span>
        <span>Briefy przechowujemy w UE</span>
      </footer>
    </div>
  );
}

const FAQ: [string, string][] = [
  ["Czy klient musi zakładać konto?", "Nie. Klient dostaje link i od razu odpowiada. Logujesz się tylko Ty, kodem z maila."],
  [
    "Co, jeśli klient nie skończy?",
    "Odpowiedzi zapisują się przy każdym kliknięciu. Klient wraca tym samym linkiem i zaczyna tam, gdzie przerwał. Pominięte pytania czekają na uzupełnienie.",
  ],
  ["Czy AI odpowiada za klienta?", "Nie. AI zmienia tylko zestaw pytań i tylko na Twoje polecenie. Odpowiedzi daje klient albo Ty."],
  [
    "Czy możemy wypełniać brief razem?",
    "Tak. Ty i klient widzicie te same zmiany na żywo, więc brief da się wypełnić na spotkaniu albo podczas rozmowy.",
  ],
  ["Gdzie są przechowywane dane?", "Na serwerach Cloudflare, w jurysdykcji Unii Europejskiej."],
];

// --- Podgląd w pierwszym ekranie: klient odpowiada na trzy pytania z szablonu „Strona WWW” ---

/** Kolejne kroki (ms od startu): wybór, odpowiedź, następne pytanie… Potem pętla. */
const TIMELINE = [1400, 2100, 2900, 4100, 4800, 5600, 6900, 7600];
const LOOP = 10500;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function HeroDemo() {
  // Bez animacji od razu stan końcowy.
  const [step, setStep] = useState(() => (reducedMotion() ? TIMELINE.length : 0));

  useEffect(() => {
    if (reducedMotion()) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      setStep(0);
      timers = TIMELINE.map((at, i) => setTimeout(() => setStep(i + 1), at));
      timers.push(setTimeout(run, LOOP));
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, []);

  const answered = (step >= 2 ? 1 : 0) + (step >= 5 ? 1 : 0);
  const pct = [0, 3, 7][answered];

  return (
    <div
      className="demo"
      role="img"
      aria-label="Podgląd: klient odpowiada na pytania briefu, klikając kafle, a pytanie, na które nie zna odpowiedzi, pomija na później."
    >
      <img className="demo-glow" src="/brand/orb-soft-900.webp" alt="" />
      <div className="demo-frame" aria-hidden>
        <div className="demo-head">
          <Orb size={26} />
          <span className="demo-title">Piekarnia Kowalski</span>
          <span className="demo-pct">{pct}%</span>
        </div>
        <div className="demo-thread">
          <div className="bot">
            <Orb size={26} className="avatar-orb" />
            <div className="bubble bubble-bot">Zaczynamy! Klikaj odpowiedzi, a jeśli czegoś nie wiesz, wybierz „Nie wiem”.</div>
          </div>
          <p className="thread-step tone-1">
            <span className="thread-step-icon">
              <IconBuildingStore size={15} stroke={2} />
            </span>
            Krok 1 z 8, O firmie
          </p>
          <DemoTurn
            question="Czy macie już stronę internetową?"
            options={[
              ["Tak", IconCheck],
              ["Nie", IconX],
            ]}
            picked={step >= 1 ? 0 : -1}
            replied={step >= 2}
            pair
          />
          {step >= 3 && (
            <DemoTurn
              question="W jakiej sytuacji klienci was szukają?"
              options={[
                ["Pilna potrzeba, np. awaria", IconHourglass],
                ["Planowany zakup lub remont", IconCalendarMonth],
              ]}
              picked={step >= 4 ? 1 : -1}
              replied={step >= 5}
            />
          )}
          {step >= 6 && (
            <DemoTurn
              question="Logo w wersji wektorowej"
              options={[
                ["Mam, wyślę mailem", IconMail],
                ["Mam, podam link", IconLink],
              ]}
              picked={-1}
              skipped={step >= 7}
              replied={step >= 8}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DemoTurn({
  question,
  options,
  picked,
  replied,
  skipped,
  pair,
}: {
  question: string;
  options: [string, typeof IconCheck][];
  picked: number;
  replied: boolean;
  skipped?: boolean;
  pair?: boolean;
}) {
  return (
    <div className="demo-turn">
      <div className="bot is-fresh">
        <Orb size={26} className="avatar-orb" />
        <div className="bubble bubble-bot">{question}</div>
      </div>
      {replied ? (
        <span className={`bubble bubble-me is-fresh ${skipped ? "is-tentative" : ""}`}>
          {skipped ? (
            <>
              <IconClockPause size={17} /> Pominięte, uzupełnię później
            </>
          ) : (
            options[picked]?.[0]
          )}
        </span>
      ) : (
        <div className="demo-answers">
          <div className={`tiles ${pair ? "tiles-pair" : ""}`}>
            {options.map(([label, Icon], i) => (
              <span key={label} className={`tile ${i ? "tone-2" : "tone-1"} ${picked === i ? "is-on" : ""}`}>
                <span className="tile-icon">
                  <Icon size={20} stroke={1.75} />
                </span>
                <span className="tile-text">{label}</span>
              </span>
            ))}
          </div>
          {!pair && (
            <div className="quick-row">
              <span className="quick">
                <IconHelpCircle size={16} /> Nie wiem
              </span>
              <span className={`quick ${skipped ? "is-on" : ""}`}>
                <IconClockPause size={16} /> Pomiń na razie
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
