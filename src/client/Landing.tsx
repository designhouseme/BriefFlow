import {
  IconArrowBackUp,
  IconArrowRight,
  IconArrowUp,
  IconCheck,
  IconClockPause,
  IconCopy,
  IconCreditCard,
  IconFileText,
  IconGitBranch,
  IconHelpCircle,
  IconLink,
  IconListCheck,
  IconPlus,
  IconReceipt,
  IconRefresh,
  IconTruckDelivery,
  IconUsers,
  IconWand,
  type Icon,
} from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Me } from "../shared/account";
import { questions } from "../shared/flow";
import { findField, optionsOf } from "../shared/ops";
import { briefFromTemplate } from "../shared/templates";
import type { Field, Option } from "../shared/types";
import { getMe, primeMe } from "./api";
import { AuthForm } from "./AuthForm";
import { BrandLockup, Wordmark } from "./Brand";
import { optionIcon, toneOf } from "./icons";
import { Orb } from "./Orb";
import { navigate } from "./router";
import { ShaderOrb } from "./ShaderOrb";

// Strona startowa pokazuje sam produkt: kula z powitania aplikacji, wokół niej krążą prawdziwe odpowiedzi
// z szablonu „Strona WWW”, niżej demo do przeklikania. Logowanie stoi w pierwszym ekranie i po kodzie
// z maila przechodzi płynnie w aplikację (View Transitions).

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Pytania i odpowiedzi z prawdziwego szablonu, żeby strona nie pokazywała wymyślonych przykładów. */
const WWW = briefFromTemplate("www", { id: "demo", title: "", clientName: "" });
const field = (id: string): Field => findField(WWW, id).field;

function answer(fieldId: string, label: string): { field: Field; option: Option } | null {
  const f = field(fieldId);
  const option = optionsOf(f).find((o) => o.label === label);
  return option ? { field: f, option } : null;
}

export function Landing() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const heroForm = useRef<HTMLDivElement>(null);

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
    heroForm.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    heroForm.current?.querySelector("input")?.focus({ preventScroll: true });
  };

  const signIn = () =>
    me === undefined ? (
      <div className="auth-placeholder" aria-hidden />
    ) : me ? (
      <div className="signed-in">
        <button className="btn-send btn-send-wide" onClick={openApp}>
          <span className="btn-send-label">Otwórz aplikację</span>
          <span className="btn-send-icon" aria-hidden>
            <IconArrowRight size={18} stroke={2.4} />
          </span>
        </button>
        <p className="auth-note">Zalogowano jako {me.email}</p>
      </div>
    ) : (
      <AuthForm onDone={openApp} />
    );

  return (
    <div className="site">
      <header className="site-nav">
        <a className="brand" href="/" aria-label="Design House Briefing, strona główna">
          <BrandLockup />
        </a>
        <nav className="site-links" aria-label="Sekcje">
          <a href="#demo">Wypróbuj</a>
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
        <section className="hero" aria-labelledby="hero-title">
          <HeroStage />
          <div className="hero-copy">
            <h1 id="hero-title">Brief, który klient przechodzi jak rozmowę</h1>
            <p className="hero-lead">
              Klient klika odpowiedzi, po jednym pytaniu. Może wybrać „Nie wiem” albo wrócić później tym samym linkiem,
              a Ty widzisz brief na żywo.
            </p>
            <div className="hero-form vt-panel" ref={heroForm}>
              {signIn()}
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
        </section>

        <section className="site-section try" id="demo" aria-labelledby="demo-title">
          <div className="section-intro">
            <h2 className="site-h2" id="demo-title">
              Kliknij jak klient
            </h2>
            <p>Cztery pytania z naszego szablonu „Strona WWW”. Z każdym kliknięciem rośnie brief, który zobaczy agencja.</p>
          </div>
          <TryDemo />
        </section>

        <section className="site-section" id="jak" aria-labelledby="jak-title">
          <div className="section-intro">
            <h2 className="site-h2" id="jak-title">
              Jak to działa
            </h2>
          </div>
          <ol className="flow">
            <li className="flow-step">
              <span className="flow-num">1</span>
              <div className="flow-text">
                <h3>Tworzysz brief</h3>
                <p>Wpisujesz klienta. Pytania zmienisz ręcznie albo poleceniem dla AI.</p>
              </div>
              <div className="mini mini-bar" aria-hidden>
                <span className="mini-input">Piekarnia Kowalski</span>
                <span className="mini-send">
                  <IconArrowUp size={16} stroke={2.4} />
                </span>
              </div>
            </li>
            <li className="flow-step">
              <span className="flow-num">2</span>
              <div className="flow-text">
                <h3>Wysyłasz link</h3>
                <p>Klient dostaje jeden link. Bez konta i bez hasła, na telefonie albo laptopie.</p>
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
            <li className="flow-step">
              <span className="flow-num">3</span>
              <div className="flow-text">
                <h3>Czytasz brief na żywo</h3>
                <p>Odpowiedzi wpadają przy każdym kliknięciu. Możecie też wypełniać brief razem na spotkaniu.</p>
              </div>
              <div className="mini mini-progress" aria-hidden>
                <span className="mini-progress-head">
                  <strong>Piekarnia Kowalski</strong>
                  <span>40%</span>
                </span>
                <span className="meter meter-wide">
                  <span style={{ width: "40%" }} />
                </span>
              </div>
            </li>
          </ol>
        </section>

        <section className="band" id="agencja" aria-labelledby="agencja-title">
          <div className="band-inner">
            <div className="section-intro">
              <h2 className="site-h2" id="agencja-title">
                Ty dostajesz brief, z którym da się zacząć projekt
              </h2>
              <p>Wszystko w jednym widoku: pytania, odpowiedzi klienta, kontrole przed startem i historia zmian.</p>
            </div>
            <div className="band-grid">
              <article className="band-card band-ai">
                <h3>Polecenia dla AI</h3>
                <p>Napisz, co dodać albo zmienić, a AI przerobi pytania. Każde polecenie cofniesz jednym kliknięciem.</p>
                <div className="band-ui" aria-hidden>
                  <div className="bar bar-static">
                    <span className="bar-lead tone-5">
                      <IconWand size={19} stroke={1.9} />
                    </span>
                    <span className="bar-text">Dodaj pytania o wysyłkę za granicę</span>
                    <span className="bar-icon-btn">
                      <IconArrowBackUp size={19} />
                    </span>
                    <span className="btn-send">
                      <span className="btn-send-label">Wykonaj</span>
                      <span className="btn-send-icon">
                        <IconArrowUp size={18} stroke={2.4} />
                      </span>
                    </span>
                  </div>
                  <ul className="band-result">
                    <li>
                      <IconPlus size={15} /> Pole „Do jakich krajów wysyłacie?”
                    </li>
                    <li>
                      <IconPlus size={15} /> Pole „Kto płaci za zwroty?”
                    </li>
                  </ul>
                </div>
              </article>

              <article className="band-card band-checks">
                <h3>Przed startem</h3>
                <p>Czego brakuje w Bazie, na co reagować od razu i co idzie do osobnej wyceny.</p>
                <ul className="band-list" aria-hidden>
                  <li>
                    <span className="band-icon tone-1">
                      <IconListCheck size={16} />
                    </span>
                    Baza <strong>9/12</strong>
                  </li>
                  <li>
                    <span className="band-icon tone-4">
                      <IconUsers size={16} />
                    </span>
                    Projekt zatwierdza kilka osób
                  </li>
                  <li>
                    <span className="band-icon tone-2">
                      <IconReceipt size={16} />
                    </span>
                    Rezerwacje online <span className="pill-quote">wycena</span>
                  </li>
                </ul>
              </article>

              <article className="band-card band-log">
                <h3>Historia zmian</h3>
                <p>Kto, co i kiedy zmienił. Zmiany pytań da się cofnąć, odpowiedzi zostają.</p>
                <ol className="band-log-list" aria-hidden>
                  <li>
                    <span className="log-who is-client">Klient</span> Termin: do miesiąca
                  </li>
                  <li>
                    <span className="log-who is-ai">AI</span> Dodano pole „Metody dostawy”
                  </li>
                  <li>
                    <span className="log-who">Agencja</span> Cofnięto zmianę pytań
                  </li>
                </ol>
              </article>

              <article className="band-card band-if">
                <h3>Pytania, które pojawiają się same</h3>
                <p>Płatności i dostawę zobaczy tylko klient, który zaznaczy sklep internetowy.</p>
                <div className="band-flow" aria-hidden>
                  <span className="chip-dark is-on">
                    <IconCheck size={15} stroke={2.4} /> Sklep: tak
                  </span>
                  <IconGitBranch size={18} className="band-arrow" />
                  <span className="chip-dark">
                    <IconCreditCard size={15} /> Metody płatności
                  </span>
                  <span className="chip-dark">
                    <IconTruckDelivery size={15} /> Metody dostawy
                  </span>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="site-section faq" id="pytania" aria-labelledby="pytania-title">
          <div className="section-intro">
            <h2 className="site-h2" id="pytania-title">
              Pytania
            </h2>
          </div>
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

        <section className="finale" aria-labelledby="finale-title">
          <div className="finale-orb" aria-hidden>
            <ShaderOrb size={220} />
          </div>
          <h2 id="finale-title">Zacznij od pierwszego briefu</h2>
          <p>Zaloguj się adresem firmowym i utwórz brief z szablonu „Strona WWW”.</p>
          <div className="finale-form">{signIn()}</div>
        </section>
      </main>

      <footer className="site-foot">
        <a className="foot-brand" href="https://designhouse.me" aria-label="Design House">
          <Wordmark />
        </a>
        <span>Briefing to narzędzie Design House. Briefy przechowujemy w UE.</span>
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

// --- Pierwszy ekran: kula i odpowiedzi krążące wokół niej ---

type Chip = { label: string; Icon: Icon; tone: string };

const ORBIT: Chip[] = [
  ...(
    [
      ["f_logo", "Mam, wyślę mailem"],
      ["f_ma_strone", "Tak"],
      ["f_funkcje", "Rezerwacje online"],
      ["f_forma", "Per Ty"],
      ["f_budzet", "10–20 tys. zł"],
      ["f_branza", "Gastronomia"],
      ["f_termin", "Do miesiąca"],
      ["f_obszar", "Jedno miasto"],
    ] as const
  )
    .map(([id, label]) => answer(id, label))
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .map(({ field: f, option }, i) => ({ label: option.label, Icon: optionIcon(f, option), tone: toneOf(i) })),
];
// „Nie wiem” i „Pomiń na razie” to też odpowiedzi: wstawione między pozostałe, nie obok siebie.
ORBIT.splice(2, 0, { label: "Nie wiem", Icon: IconHelpCircle, tone: "" });
ORBIT.splice(7, 0, { label: "Pomiń na razie", Icon: IconClockPause, tone: "" });

/**
 * Odpowiedzi krążą po pochylonej elipsie; te z tyłu są mniejsze, bledsze i chowają się za kulą.
 * Każdą można złapać i przesunąć albo rzucić: leci z bezwładnością, odbija się od krawędzi pierwszego
 * ekranu i po chwili wraca na orbitę. Wrzucona do kuli rozpryskuje się, kula błyska i odpowiedź
 * po chwili wraca na swoje miejsce.
 */
function HeroStage() {
  const stage = useRef<HTMLDivElement>(null);
  const orbit = useRef<HTMLDivElement>(null);
  const pulse = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const stageEl = stage.current;
    const box = orbit.current;
    const hero = stageEl?.parentElement;
    if (!stageEl || !box || !hero) return;
    const still = reducedMotion();
    const tilt = -0.16;

    type Mode = "orbit" | "held" | "free" | "return" | "gone" | "spawn";
    type Body = {
      el: HTMLElement;
      mode: Mode;
      x: number;
      y: number;
      vx: number;
      vy: number;
      since: number;
      grabX: number;
      grabY: number;
      pointer: number;
      trail: { x: number; y: number; t: number }[];
    };
    const bodies: Body[] = Array.from(box.children as HTMLCollectionOf<HTMLElement>).map((el) => ({
      el,
      mode: "orbit",
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      since: 0,
      grabX: 0,
      grabY: 0,
      pointer: -1,
      trail: [],
    }));

    let clock = 0;
    let last = performance.now();
    let frame = 0;
    let visible = true;

    /** Miejsce odpowiedzi na orbicie: pozycja, głębia (0 z tyłu, 1 z przodu). */
    const slot = (i: number, n: number, chip: HTMLElement) => {
      const angle = (i / n) * Math.PI * 2 + clock * 0.07;
      const a = box.clientWidth * 0.47;
      const b = box.clientHeight * 0.4;
      const x0 = Math.cos(angle) * a;
      const y0 = Math.sin(angle) * b;
      const depth = (Math.sin(angle) + 1) / 2;
      const scale = 0.8 + depth * 0.2;
      // Etykieta zawsze cała na ekranie: na wąskim końce elipsy się spłaszczają.
      const room = box.clientWidth / 2 - (chip.offsetWidth * scale) / 2 - 6;
      const x = Math.max(-room, Math.min(room, x0 * Math.cos(tilt) - y0 * Math.sin(tilt)));
      const y = x0 * Math.sin(tilt) + y0 * Math.cos(tilt);
      return { x, y, scale, opacity: 0.45 + depth * 0.55, z: depth > 0.5 ? 3 : 1 };
    };

    const render = (b: Body, x: number, y: number, scale: number, opacity: number, z: number) => {
      b.el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(3)})`;
      b.el.style.opacity = opacity.toFixed(2);
      b.el.style.zIndex = String(z);
    };

    const center = () => {
      const r = box.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const orbRadius = () => {
      const orb = stageEl.querySelector<HTMLElement>(".hero-orb canvas, .hero-orb .orb");
      if (!orb) return 0;
      const r = orb.getBoundingClientRect();
      return orb.tagName === "CANVAS" ? r.height * 0.21 : r.height / 2;
    };

    /** Rozprysk w kolorach odpowiedzi i kuli. */
    const burst = (b: Body) => {
      const tone = getComputedStyle(b.el).getPropertyValue("--tone-fg").trim() || "#3d5bf0";
      const colors = [tone, "#7e97ff", "#c9d6ff", "#3f5bf0"];
      for (let i = 0; i < 18; i++) {
        const bit = document.createElement("span");
        bit.className = "orbit-bit";
        bit.style.background = colors[i % colors.length];
        bit.style.left = `calc(50% + ${b.x}px)`;
        bit.style.top = `calc(50% + ${b.y}px)`;
        box.appendChild(bit);
        const angle = Math.random() * Math.PI * 2;
        const dist = 70 + Math.random() * 140;
        bit
          .animate(
            [
              { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
              {
                transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) scale(0.2) rotate(${Math.random() * 360}deg)`,
                opacity: 0,
              },
            ],
            { duration: 650 + Math.random() * 450, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
          )
          .finished.then(() => bit.remove(), () => bit.remove());
      }
    };

    const explode = (b: Body, now: number) => {
      b.mode = "gone";
      b.since = now;
      b.el.classList.remove("is-held");
      b.el.style.opacity = "0";
      b.el.style.pointerEvents = "none";
      pulse.current?.();
      if (!still) burst(b);
    };

    const inOrb = (b: Body) => Math.hypot(b.x, b.y) < orbRadius() * 0.85;

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (visible && !document.hidden) {
        if (!still) clock += dt;
        const shown = bodies.filter((b) => b.el.offsetParent !== null);
        const heroBox = hero.getBoundingClientRect();
        const c = center();
        shown.forEach((b, i) => {
          const s = slot(i, shown.length, b.el);
          const halfW = b.el.offsetWidth / 2;
          const halfH = b.el.offsetHeight / 2;
          const minX = heroBox.left - c.x + halfW;
          const maxX = heroBox.right - c.x - halfW;
          const minY = heroBox.top - c.y + halfH;
          const maxY = heroBox.bottom - c.y - halfH;
          switch (b.mode) {
            case "orbit":
              b.x = s.x;
              b.y = s.y;
              render(b, s.x, s.y, s.scale, s.opacity, s.z);
              break;
            case "held":
              render(b, b.x, b.y, 1.08, 1, 7);
              break;
            case "free": {
              b.x += b.vx * dt;
              b.y += b.vy * dt;
              const friction = Math.pow(0.22, dt);
              b.vx *= friction;
              b.vy *= friction;
              if (b.x < minX || b.x > maxX) {
                b.x = Math.max(minX, Math.min(maxX, b.x));
                b.vx *= -0.62;
              }
              if (b.y < minY || b.y > maxY) {
                b.y = Math.max(minY, Math.min(maxY, b.y));
                b.vy *= -0.62;
              }
              if (inOrb(b)) {
                explode(b, now);
                break;
              }
              const speed = Math.hypot(b.vx, b.vy);
              if ((speed < 30 && now - b.since > 900) || now - b.since > 4500) {
                b.mode = "return";
                b.since = now;
              }
              render(b, b.x, b.y, 1, 1, 6);
              break;
            }
            case "return": {
              // Sprężyna do miejsca na orbicie; po dojściu odpowiedź znowu krąży.
              const ax = (s.x - b.x) * 22 - b.vx * 9;
              const ay = (s.y - b.y) * 22 - b.vy * 9;
              b.vx += ax * dt;
              b.vy += ay * dt;
              b.x += b.vx * dt;
              b.y += b.vy * dt;
              const near = Math.hypot(s.x - b.x, s.y - b.y);
              if (near < 1.5 && Math.hypot(b.vx, b.vy) < 25) b.mode = "orbit";
              const k = Math.min(1, near / 120);
              render(b, b.x, b.y, s.scale + (1 - s.scale) * k, s.opacity + (1 - s.opacity) * k, near > 40 ? 6 : s.z);
              break;
            }
            case "gone":
              if (now - b.since > 1500) {
                b.mode = "spawn";
                b.since = now;
                b.el.style.pointerEvents = "";
              }
              break;
            case "spawn": {
              const p = Math.min(1, (now - b.since) / 450);
              const grow = 1 - Math.pow(1 - p, 3);
              b.x = s.x;
              b.y = s.y;
              render(b, s.x, s.y, s.scale * grow, s.opacity * grow, s.z);
              if (p >= 1) b.mode = "orbit";
              break;
            }
          }
        });
      }
      frame = requestAnimationFrame(loop);
    };

    const find = (el: EventTarget | null) => bodies.find((b) => b.el === el);
    const toStage = (e: PointerEvent) => {
      const c = center();
      return { x: e.clientX - c.x, y: e.clientY - c.y };
    };
    const onDown = (e: PointerEvent) => {
      const b = find(e.currentTarget);
      if (!b || b.mode === "gone" || b.mode === "spawn") return;
      e.preventDefault();
      try {
        b.el.setPointerCapture(e.pointerId);
      } catch {
        /* wskaźnik już nieaktywny: przeciąganie i tak działa, dopóki kursor jest nad etykietą */
      }
      const p = toStage(e);
      b.grabX = b.x - p.x;
      b.grabY = b.y - p.y;
      b.pointer = e.pointerId;
      b.mode = "held";
      b.trail = [{ x: b.x, y: b.y, t: performance.now() }];
      b.el.classList.add("is-held");
    };
    const onMove = (e: PointerEvent) => {
      const b = find(e.currentTarget);
      if (!b || b.mode !== "held" || b.pointer !== e.pointerId) return;
      const p = toStage(e);
      const now = performance.now();
      b.x = p.x + b.grabX;
      b.y = p.y + b.grabY;
      b.trail.push({ x: b.x, y: b.y, t: now });
      while (b.trail.length > 2 && now - b.trail[0].t > 90) b.trail.shift();
    };
    const onUp = (e: PointerEvent) => {
      const b = find(e.currentTarget);
      if (!b || b.mode !== "held" || b.pointer !== e.pointerId) return;
      const now = performance.now();
      b.el.classList.remove("is-held");
      b.pointer = -1;
      if (inOrb(b)) return explode(b, now);
      const first = b.trail[0];
      const span = Math.max((now - first.t) / 1000, 0.016);
      const cap = 2600;
      b.vx = Math.max(-cap, Math.min(cap, (b.x - first.x) / span));
      b.vy = Math.max(-cap, Math.min(cap, (b.y - first.y) / span));
      b.since = now;
      b.mode = still ? "return" : "free";
    };

    for (const b of bodies) {
      b.el.addEventListener("pointerdown", onDown);
      b.el.addEventListener("pointermove", onMove);
      b.el.addEventListener("pointerup", onUp);
      b.el.addEventListener("pointercancel", onUp);
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer.observe(stageEl);
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      for (const b of bodies) {
        b.el.removeEventListener("pointerdown", onDown);
        b.el.removeEventListener("pointermove", onMove);
        b.el.removeEventListener("pointerup", onUp);
        b.el.removeEventListener("pointercancel", onUp);
      }
    };
  }, []);

  return (
    <div className="hero-stage" ref={stage} aria-hidden>
      <svg className="hero-orbit-line" viewBox="-100 -100 200 200" preserveAspectRatio="none">
        <ellipse cx="0" cy="0" rx="94" ry="80" transform="rotate(-9)" />
      </svg>
      <div className="hero-orb">
        <ShaderOrb size={460} maxDpr={1.5} pulseRef={pulse} />
      </div>
      <div className="orbit" ref={orbit}>
        {ORBIT.map(({ label, Icon, tone }) => (
          <span key={label} className={`orbit-chip ${tone}`}>
            <span className="pill-icon">
              <Icon size={16} stroke={1.9} />
            </span>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// --- Demo do przeklikania: cztery pytania z szablonu i „Twój brief”, który rośnie obok ---

type DemoAnswer = { status: "answered" | "unknown" | "skipped"; value?: string[] };
const DEMO_FIELDS = ["f_ma_strone", "f_sytuacja", "f_funkcje", "f_logo"].map(field);
const TEMPLATE_SIZE = questions(WWW).length;

function demoText(f: Field, a: DemoAnswer | undefined) {
  if (!a) return "";
  if (a.status === "unknown") return "Nie wiem";
  if (a.status === "skipped") return "Pominięte, uzupełnię później";
  const labels = optionsOf(f)
    .filter((o) => a.value?.includes(o.id))
    .map((o) => o.label);
  return labels.join(", ");
}

function TryDemo() {
  const [answers, setAnswers] = useState<Record<string, DemoAnswer>>({});
  const [step, setStep] = useState(0);
  const [multi, setMulti] = useState<string[]>([]);
  const thread = useRef<HTMLDivElement>(null);
  const current = DEMO_FIELDS[step];
  const done = step >= DEMO_FIELDS.length;
  const settled = Object.values(answers).filter((a) => a.status !== "skipped").length;

  useEffect(() => {
    const el = thread.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [step]);

  const commit = (a: DemoAnswer) => {
    setAnswers((prev) => ({ ...prev, [current.id]: a }));
    setMulti([]);
    setStep((s) => s + 1);
  };
  const reset = () => {
    setAnswers({});
    setMulti([]);
    setStep(0);
  };

  return (
    <div className="try-frame">
      <div className="try-chat">
        <div className="try-thread" ref={thread} aria-live="polite">
          <div className="bot">
            <Orb size={28} className="avatar-orb" />
            <div className="bubble bubble-bot try-hello">Zaczynamy! Klikaj odpowiedzi, a jeśli czegoś nie wiesz, wybierz „Nie wiem”.</div>
          </div>
          {DEMO_FIELDS.slice(0, step + 1).map((f, i) => {
            const a = answers[f.id];
            const isCurrent = i === step && !done;
            const options = optionsOf(f);
            return (
              <div className="turn" key={f.id}>
                <div className="bot">
                  <Orb size={28} className="avatar-orb" />
                  <div className="bubble bubble-bot">
                    {f.label}
                    {f.help && <span className="bubble-help">{f.help}</span>}
                  </div>
                </div>
                {isCurrent ? (
                  <div className="try-answers">
                    {f.type === "multi_choice" && (
                      <p className="answer-hint">
                        <IconCheck size={15} stroke={2.5} aria-hidden /> Możesz zaznaczyć kilka
                      </p>
                    )}
                    <div className={`tiles ${f.type === "yes_no" ? "tiles-pair" : ""}`}>
                      {options.map((o, n) => {
                        const Icon = optionIcon(f, o);
                        const on = multi.includes(o.id);
                        return (
                          <button
                            key={o.id}
                            className={`tile ${toneOf(n)} ${on ? "is-on" : ""}`}
                            aria-pressed={f.type === "multi_choice" ? on : undefined}
                            onClick={() =>
                              f.type === "multi_choice"
                                ? setMulti((m) => (m.includes(o.id) ? m.filter((v) => v !== o.id) : [...m, o.id]))
                                : commit({ status: "answered", value: [o.id] })
                            }
                          >
                            <span className="tile-icon" aria-hidden>
                              <Icon size={22} stroke={1.75} />
                            </span>
                            <span className="tile-text">{o.label}</span>
                            {f.type === "multi_choice" && (
                              <span className="tile-check is-box" aria-hidden>
                                {on && <IconCheck size={14} stroke={3} />}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <div className="quick-row">
                      <button className="quick" onClick={() => commit({ status: "unknown" })}>
                        <IconHelpCircle size={17} aria-hidden /> Nie wiem
                      </button>
                      <button className="quick" onClick={() => commit({ status: "skipped" })}>
                        <IconClockPause size={17} aria-hidden /> Pomiń na razie
                      </button>
                      {f.type === "multi_choice" && (
                        <button
                          className="btn btn-primary answer-next"
                          disabled={multi.length === 0}
                          onClick={() => commit({ status: "answered", value: multi })}
                        >
                          Dalej <IconArrowRight size={17} aria-hidden />
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  a && <span className={`bubble bubble-me ${a.status === "answered" ? "" : "is-tentative"}`}>{demoText(f, a)}</span>
                )}
              </div>
            );
          })}
          {done && (
            <div className="bot">
              <Orb size={28} className="avatar-orb" />
              <div className="bubble bubble-bot">
                Gotowe. Tyle zajmuje klientowi kawałek briefu.
                <span className="bubble-help">
                  Pełny szablon ma {TEMPLATE_SIZE} pytań, a klient może przerwać w dowolnym miejscu.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <aside className="try-brief" aria-label="Brief, który widzi agencja">
        <div className="try-brief-head">
          <span className="brief-head-icon" aria-hidden>
            <IconFileText size={19} stroke={1.75} />
          </span>
          <h3>Twój brief</h3>
          <span className="pct">{Math.round((settled / DEMO_FIELDS.length) * 100)}%</span>
        </div>
        <span className="meter meter-wide" aria-hidden>
          <span style={{ width: `${(settled / DEMO_FIELDS.length) * 100}%` }} />
        </span>
        <ul className="try-rows">
          {DEMO_FIELDS.map((f, i) => {
            const a = answers[f.id];
            return (
              <li key={f.id} className={i === step && !done ? "is-now" : ""}>
                <span className="brief-q">{f.label}</span>
                <span className={`brief-a ${a && a.status !== "answered" ? "is-tentative" : ""}`}>
                  {a ? demoText(f, a) : i === step && !done ? "Odpowiadasz teraz" : "Jeszcze nie padło"}
                </span>
              </li>
            );
          })}
        </ul>
        <button className="btn btn-small try-reset" onClick={reset} disabled={step === 0}>
          <IconRefresh size={15} aria-hidden /> Od nowa
        </button>
      </aside>
    </div>
  );
}

