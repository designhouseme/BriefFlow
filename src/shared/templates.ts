import type { Brief, Field, FieldType, Option, Section, ShowIf } from "./types";

export interface TemplateInfo {
  id: string;
  title: string;
  description: string;
}

type F = {
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  /** [id, etykieta] albo [id, etykieta, "wycena"], gdy wybór zmienia wycenę. */
  options?: Opt[];
  allowOther?: boolean;
  scale?: [string, string];
  required?: boolean;
  showIf?: ShowIf;
};

type S = { id: string; title: string; description?: string; showIf?: ShowIf; fields: F[] };

type Opt = [id: string, label: string, quote?: "wycena"];

const opts = (list: Opt[]): Option[] =>
  list.map(([id, label, quote]) => (quote ? { id, label, quote: true } : { id, label }));

// Pytania „ważne” (required) to Baza: bez nich nie startujemy projektu.

const WWW: S[] = [
  {
    id: "s_firma",
    title: "O firmie",
    fields: [
      { id: "f_nazwa", type: "short_text", label: "Nazwa firmy lub marki", required: true },
      {
        id: "f_branza",
        type: "single_choice",
        label: "Branża",
        options: [
          ["uslugi", "Usługi lokalne"],
          ["handel", "Handel / e-commerce"],
          ["gastro", "Gastronomia"],
          ["zdrowie", "Zdrowie i uroda"],
          ["budownictwo", "Budownictwo i nieruchomości"],
          ["b2b", "Produkcja / B2B"],
        ],
        allowOther: true,
        required: true,
      },
      {
        id: "f_sytuacja",
        type: "single_choice",
        label: "W jakiej sytuacji klienci was szukają?",
        help: "To ustawia ton i kolejność treści na stronie.",
        options: [
          ["pilne", "Pilna potrzeba, np. awaria"],
          ["plan", "Planowany zakup lub remont"],
          ["porownanie", "Porównują oferty i ceny"],
          ["polecenie", "Z polecenia, szukają kontaktu"],
        ],
        allowOther: true,
        required: true,
      },
      {
        id: "f_obszar",
        type: "area",
        label: "Gdzie działacie?",
        help: "Od tego zależy, pod jakie miejscowości ustawimy stronę w Google.",
        required: true,
      },
      { id: "f_ma_strone", type: "yes_no", label: "Czy macie już stronę internetową?" },
      {
        id: "f_adres_strony",
        type: "short_text",
        label: "Adres obecnej strony",
        help: "np. twojafirma.pl",
        showIf: { fieldId: "f_ma_strone", equals: "yes" },
      },
    ],
  },
  {
    id: "s_cel",
    title: "Cel strony",
    fields: [
      {
        id: "f_cel",
        type: "single_choice",
        label: "Najważniejszy cel strony",
        help: "Wybierz jeden: ten, bez którego strona nie ma sensu.",
        options: [
          ["zapytania", "Telefony i zapytania"],
          ["sprzedaz", "Sprzedaż online"],
          ["rezerwacje", "Rezerwacje i zapisy"],
          ["wizerunek", "Wizerunek i zaufanie"],
          ["rekrutacja", "Rekrutacja"],
        ],
        allowOther: true,
        required: true,
      },
      {
        id: "f_odbiorcy",
        type: "single_choice",
        label: "Kto jest waszym najważniejszym klientem?",
        help: "Jedna grupa: pod nią ułożymy teksty i układ strony.",
        options: [
          ["lokalni", "Klienci indywidualni z okolicy"],
          ["polska", "Klienci indywidualni z całej Polski"],
          ["firmy", "Firmy (B2B)"],
          ["zagranica", "Klienci zagraniczni"],
        ],
        required: true,
      },
      {
        id: "f_akcje",
        type: "single_choice",
        label: "Jedna główna rzecz, którą ma zrobić odwiedzający",
        help: "Pozostałe drogi kontaktu też pokażemy, ale mniej wyraźnie.",
        required: true,
        options: [
          ["zadzwonic", "Zadzwonić"],
          ["formularz", "Wypełnić formularz"],
          ["czat", "Napisać na WhatsApp / Messengerze"],
          ["kupic", "Kupić"],
          ["rezerwacja", "Zarezerwować termin"],
          ["oferta", "Pobrać ofertę"],
        ],
      },
    ],
  },
  {
    id: "s_dlaczego",
    title: "Dlaczego wy",
    description: "Na tym zbudujemy argumenty na stronie.",
    fields: [
      {
        id: "f_dowod",
        type: "multi_choice",
        label: "Czym najlepiej przekonacie klienta?",
        help: "Zaznacz to, co naprawdę możecie pokazać.",
        options: [
          ["realizacje", "Realizacje ze zdjęciami"],
          ["opinie", "Opinie klientów"],
          ["certyfikaty", "Certyfikaty i uprawnienia"],
          ["doswiadczenie", "Lata doświadczenia"],
          ["gwarancja", "Gwarancja"],
          ["ceny", "Jasne ceny"],
        ],
        required: true,
      },
      {
        id: "f_obawa",
        type: "single_choice",
        label: "Czego klienci najbardziej się obawiają przed zakupem?",
        options: [
          ["koszty", "Ukrytych kosztów"],
          ["jakosc", "Słabej jakości"],
          ["opoznienia", "Opóźnień"],
          ["kontakt", "Że nikt nie oddzwoni"],
          ["nieznana", "Że firma jest nieznana"],
        ],
        allowOther: true,
      },
      {
        id: "f_odpowiedz",
        type: "single_choice",
        label: "Jak szybko odpowiadacie na zapytania?",
        help: "Napiszemy to na stronie, więc musi być prawdą.",
        options: [
          ["godzina", "W ciągu godziny"],
          ["dzien", "Tego samego dnia"],
          ["doba", "Do 24 godzin"],
          ["dni", "W ciągu kilku dni"],
        ],
        required: true,
      },
    ],
  },
  {
    id: "s_zakres",
    title: "Zakres",
    fields: [
      {
        id: "f_wielkosc",
        type: "single_choice",
        label: "Jak duża ma być strona?",
        options: [
          ["landing", "Jedna strona (landing)"],
          ["mala", "2–5 podstron"],
          ["srednia", "6–15 podstron"],
          ["duza", "Ponad 15 podstron", "wycena"],
        ],
      },
      { id: "f_sklep", type: "yes_no", label: "Czy strona ma mieć sklep internetowy?" },
      {
        id: "f_funkcje",
        type: "multi_choice",
        label: "Jakie funkcje są potrzebne?",
        options: [
          ["formularz", "Formularz kontaktowy"],
          ["blog", "Blog / aktualności"],
          ["realizacje", "Galeria realizacji"],
          ["rezerwacje", "Rezerwacje online", "wycena"],
          ["jezyki", "Wersja w innym języku", "wycena"],
          ["newsletter", "Zapis do newslettera", "wycena"],
        ],
        allowOther: true,
      },
      {
        id: "f_tresci",
        type: "single_choice",
        label: "Kto będzie zmieniał treści po starcie?",
        options: [
          ["my", "My sami (potrzebny prosty panel)"],
          ["agencja", "Agencja, w ramach opieki"],
          ["nikt", "Raczej nic nie będzie się zmieniać"],
        ],
      },
    ],
  },
  {
    id: "s_sklep",
    title: "Sklep",
    description: "Ta sekcja pojawia się, bo strona ma mieć sklep.",
    showIf: { fieldId: "f_sklep", equals: "yes" },
    fields: [
      {
        id: "f_produkty",
        type: "single_choice",
        label: "Ile produktów będzie w sklepie?",
        options: [
          ["do50", "Do 50"],
          ["do500", "50–500"],
          ["wiecej", "Ponad 500"],
        ],
      },
      {
        id: "f_platnosci",
        type: "multi_choice",
        label: "Metody płatności",
        options: [
          ["blik", "BLIK i szybkie przelewy"],
          ["karty", "Karty płatnicze"],
          ["pobranie", "Za pobraniem"],
          ["przelew", "Przelew tradycyjny"],
          ["raty", "Raty / płatności odroczone", "wycena"],
        ],
      },
      {
        id: "f_dostawa",
        type: "multi_choice",
        label: "Metody dostawy",
        options: [
          ["kurier", "Kurier"],
          ["paczkomaty", "Paczkomaty"],
          ["odbior", "Odbiór osobisty"],
          ["zagranica", "Wysyłka za granicę"],
        ],
      },
      {
        id: "f_integracje",
        type: "multi_choice",
        label: "Z czym sklep ma się łączyć?",
        options: [
          ["magazyn", "Program magazynowy / ERP", "wycena"],
          ["allegro", "Allegro", "wycena"],
          ["faktury", "System do faktur", "wycena"],
          ["brak", "Z niczym"],
        ],
        allowOther: true,
      },
    ],
  },
  {
    id: "s_wyglad",
    title: "Wygląd i charakter",
    fields: [
      { id: "f_styl", type: "scale", label: "Jaki ma być styl strony?", scale: ["Klasyczny", "Nowoczesny"] },
      { id: "f_ton", type: "scale", label: "Jakim tonem mówicie do klientów?", scale: ["Poważnie, ekspercko", "Luźno, przyjaźnie"] },
      {
        id: "f_forma",
        type: "single_choice",
        label: "Jak zwracacie się do klientów?",
        options: [
          ["ty", "Per Ty"],
          ["pan", "Per Pan / Pani"],
        ],
      },
      {
        id: "f_identyfikacja",
        type: "single_choice",
        label: "Czy macie identyfikację wizualną?",
        options: [
          ["pelna", "Tak, pełną (logo, kolory, fonty)"],
          ["logo", "Tylko logo"],
          ["brak", "Nie, do zaprojektowania", "wycena"],
        ],
      },
      {
        id: "f_inspiracje",
        type: "long_text",
        label: "Strony, które wam się podobają",
        help: "Wklej linki, po jednym w linii. Wystarczą 2–3.",
      },
    ],
  },
  {
    id: "s_materialy",
    title: "Materiały",
    description: "Najczęstsza przyczyna opóźnień. Zaznacz, co macie, resztę ustalimy.",
    fields: [
      {
        id: "f_logo",
        type: "material",
        label: "Logo w wersji wektorowej",
        help: "Plik SVG, AI, PDF lub EPS. Logo z Facebooka czy JPG zwykle nie wystarczy.",
        required: true,
      },
      {
        id: "f_zdjecia",
        type: "material",
        label: "Zdjęcia firmy, zespołu lub realizacji",
        help: "Własne zdjęcia. Zdjęcie z internetu nie może udawać waszej realizacji.",
        required: true,
      },
      {
        id: "f_prawa",
        type: "consent",
        label: "Mamy prawa do zdjęć i tekstów, które przekażemy na stronę.",
        help: "Zdjęcia ze stocków też są w porządku, jeśli mamy licencję.",
        required: true,
      },
      {
        id: "f_teksty",
        type: "single_choice",
        label: "Teksty na stronę",
        options: [
          ["gotowe", "Mamy gotowe teksty"],
          ["redakcja", "Mamy materiały, trzeba je zredagować"],
          ["copywriter", "Potrzebujemy copywritera", "wycena"],
        ],
      },
      {
        id: "f_domena",
        type: "single_choice",
        label: "Domena",
        options: [
          ["panel", "Mamy domenę i dostęp do panelu"],
          ["bez_dostepu", "Mamy domenę, ale nie wiemy, gdzie jest panel"],
          ["brak", "Nie mamy domeny"],
        ],
        required: true,
      },
      {
        id: "f_poczta",
        type: "yes_no",
        label: "Czy macie pocztę e-mail na swojej domenie?",
        help: "Np. biuro@twojafirma.pl. Przy zmianie strony poczta nie może przestać działać.",
      },
    ],
  },
  {
    id: "s_termin",
    title: "Termin i budżet",
    fields: [
      {
        id: "f_termin",
        type: "deadline",
        label: "Kiedy strona powinna działać?",
        help: "Termin liczymy od dnia, w którym mamy komplet materiałów.",
        required: true,
      },
      {
        id: "f_powod",
        type: "single_choice",
        label: "Skąd ten termin?",
        options: [
          ["sezon", "Sezon"],
          ["wydarzenie", "Targi lub wydarzenie"],
          ["kampania", "Kampania reklamowa"],
          ["otwarcie", "Otwarcie firmy"],
          ["brak", "Nie ma konkretnego powodu"],
        ],
      },
      {
        id: "f_budzet",
        type: "single_choice",
        label: "Budżet",
        options: [
          ["do5", "Do 5 tys. zł"],
          ["do10", "5–10 tys. zł"],
          ["do20", "10–20 tys. zł"],
          ["do40", "20–40 tys. zł"],
          ["powyzej", "Powyżej 40 tys. zł"],
        ],
        required: true,
      },
      {
        id: "f_decyzje",
        type: "single_choice",
        label: "Kto po waszej stronie zatwierdza projekt?",
        options: [
          ["ja", "Jedna osoba"],
          ["kilka", "Kilka osób wspólnie"],
          ["zarzad", "Zarząd lub właściciel na końcu"],
        ],
        required: true,
      },
    ],
  },
];

const TEMPLATES: Record<string, { info: TemplateInfo; sections: S[] }> = {
  www: {
    info: {
      id: "www",
      title: "Strona WWW",
      description: "Firma, cel, argumenty, zakres, sklep, wygląd, materiały, termin i budżet.",
    },
    sections: WWW,
  },
  empty: {
    info: { id: "empty", title: "Pusty brief", description: "Zaczynasz od zera. Pytania dodajesz ręcznie albo poleceniem AI." },
    sections: [{ id: "s_start", title: "Pytania", fields: [] }],
  },
};

export const TEMPLATE_LIST: TemplateInfo[] = Object.values(TEMPLATES).map((t) => t.info);

function toField(f: F): Field {
  const field: Field = { id: f.id, type: f.type, label: f.label, required: Boolean(f.required), origin: "template" };
  if (f.help) field.help = f.help;
  if (f.options) field.options = opts(f.options);
  if (f.allowOther) field.allowOther = true;
  if (f.scale) [field.scaleMin, field.scaleMax] = f.scale;
  if (f.showIf) field.showIf = f.showIf;
  return field;
}

export function briefFromTemplate(templateId: string, meta: { id: string; title: string; clientName: string }): Brief {
  const template = TEMPLATES[templateId];
  if (!template) throw new Error(`Nieznany szablon: ${templateId}`);
  const now = Date.now();
  const sections: Section[] = template.sections.map((s) => ({
    id: s.id,
    title: s.title,
    ...(s.description ? { description: s.description } : {}),
    ...(s.showIf ? { showIf: s.showIf } : {}),
    fields: s.fields.map(toField),
  }));
  return {
    id: meta.id,
    title: meta.title || template.info.title,
    clientName: meta.clientName,
    templateId,
    createdAt: now,
    updatedAt: now,
    sections,
    answers: {},
    canUndo: false,
  };
}
