// Markup for the film, rendered from the app's own components and the "Strona WWW" template,
// so the film shows real questions, real icons and real cards. Writes data.js next to index.html.
// Run from the repository root after a change to the template, the cards or the icons:
//
//   node_modules/.bin/esbuild design/film/gen-data.tsx --bundle --platform=node --format=esm --jsx=automatic \
//     --packages=external --outfile=design/film/.gen-data.mjs && node design/film/.gen-data.mjs && rm design/film/.gen-data.mjs

import {
  IconArrowBackUp,
  IconArrowRight,
  IconArrowUp,
  IconCheck,
  IconClockPause,
  IconFileText,
  IconHelpCircle,
  IconPointerFilled,
  IconWand,
  IconX,
  type Icon,
} from "@tabler/icons-react";
import { writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { FieldCard } from "../../src/client/FieldCard";
import { optionIcon, sectionIcon, toneOf } from "../../src/client/icons";
import { findField, optionsOf } from "../../src/shared/ops";
import { questions } from "../../src/shared/flow";
import { briefFromTemplate } from "../../src/shared/templates";
import type { Brief, Field } from "../../src/shared/types";

const svg = (I: Icon, size: number, stroke?: number) => renderToStaticMarkup(<I size={size} stroke={stroke} />);

const WWW = briefFromTemplate("www", { id: "demo", title: "", clientName: "" });
const field = (b: Brief, id: string): Field => findField(b, id).field;

// Client conversation: the four questions of the landing page demo.
const chat = ["f_ma_strone", "f_sytuacja", "f_funkcje", "f_logo"].map((id) => {
  const f = field(WWW, id);
  return {
    id,
    type: f.type,
    label: f.label,
    help: f.help ?? "",
    options: optionsOf(f).map((o, n) => ({ id: o.id, label: o.label, tone: toneOf(n), icon: svg(optionIcon(f, o), 22, 1.75) })),
  };
});

// Answers orbiting the orb on the landing page, in the same order.
const orbitSrc: [string, string][] = [
  ["f_logo", "Mam, wyślę mailem"],
  ["f_ma_strone", "Tak"],
  ["f_funkcje", "Rezerwacje online"],
  ["f_forma", "Per Ty"],
  ["f_budzet", "10–20 tys. zł"],
  ["f_branza", "Gastronomia"],
  ["f_termin", "Do miesiąca"],
  ["f_obszar", "Jedno miasto"],
];
const orbit = orbitSrc
  .map(([id, label]) => {
    const f = field(WWW, id);
    const o = optionsOf(f).find((x) => x.label === label);
    return o ? { label, icon: optionIcon(f, o) } : null;
  })
  .filter((x): x is { label: string; icon: Icon } => x !== null)
  .map((x, i) => ({ label: x.label, tone: toneOf(i), icon: svg(x.icon, 16, 1.9) }));
orbit.splice(2, 0, { label: "Nie wiem", tone: "", icon: svg(IconHelpCircle, 16, 1.9) });
orbit.splice(7, 0, { label: "Pomiń na razie", tone: "", icon: svg(IconClockPause, 16, 1.9) });

// Agency view: the "Sklep" section of a brief where the client has an online shop, before and after an AI command.
const shop: Brief = structuredClone(WWW);
shop.title = "Piekarnia Kowalski";
shop.clientName = "Piekarnia Kowalski";
shop.answers.f_sklep = { status: "answered", value: ["yes"], by: "client", at: Date.UTC(2026, 9, 7, 10) } as never;
const section = shop.sections.find((s) => s.title === "Sklep")!;
// Example of what an AI command adds: clickable questions, as the AI prompt asks by default.
const added: Field[] = [
  {
    id: "f_kraje",
    type: "multi_choice",
    label: "Do jakich krajów wysyłacie?",
    options: [
      { id: "ue", label: "Unia Europejska" },
      { id: "uk", label: "Wielka Brytania" },
      { id: "swiat", label: "Cały świat" },
    ],
  } as Field,
  {
    id: "f_zwroty",
    type: "single_choice",
    label: "Kto płaci za zwroty?",
    options: [
      { id: "klient", label: "Klient" },
      { id: "sklep", label: "Sklep" },
      { id: "zalezy", label: "Zależy od kraju" },
    ],
  } as Field,
];
const noop = () => {};
const card = (f: Field, b: Brief) =>
  renderToStaticMarkup(
    <FieldCard brief={b} field={f} role="agency" stub={{} as never} run={(async () => undefined) as never} editing={false} setEditing={noop} />,
  );
const withAdded: Brief = structuredClone(shop);
withAdded.sections.find((s) => s.title === "Sklep")!.fields.push(...added);
const agency = {
  client: shop.clientName,
  section: { title: section.title, icon: svg(sectionIcon(section), 18, 1.9), count: section.fields.length },
  cards: section.fields.map((f) => card(f, shop)),
  added: added.map((f) => card(f, withAdded)),
  addedLabels: added.map((f) => f.label),
};

const icons = {
  help: svg(IconHelpCircle, 17),
  pause: svg(IconClockPause, 17),
  check15: svg(IconCheck, 15, 2.5),
  check14: svg(IconCheck, 14, 3),
  arrowRight: svg(IconArrowRight, 17),
  fileText: svg(IconFileText, 19, 1.75),
  wand: svg(IconWand, 19, 1.9),
  undo: svg(IconArrowBackUp, 19),
  send: svg(IconArrowUp, 18, 2.4),
  close: svg(IconX, 16),
  pointer: svg(IconPointerFilled, 40),
};

const data = { chat, orbit, agency, icons, templateSize: questions(WWW).length };
writeFileSync(new URL("./data.js", import.meta.url), `// Generated by gen-data.tsx from the app's components. Do not edit.\nwindow.DATA = ${JSON.stringify(data)};\n`);
console.log("data.js:", chat.length, "questions,", orbit.length, "orbit answers,", agency.cards.length, "+", agency.added.length, "cards");
