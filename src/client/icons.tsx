import {
  IconAdjustmentsHorizontal,
  IconAlignLeft,
  IconBadge,
  IconBox,
  IconBoxMultiple,
  IconBrandWhatsapp,
  IconBriefcase,
  IconBrush,
  IconBuilding,
  IconBuildingBank,
  IconBuildingFactory2,
  IconBuildingStore,
  IconBuildingWarehouse,
  IconCalendar,
  IconCalendarClock,
  IconCalendarEvent,
  IconCalendarMonth,
  IconCash,
  IconCheck,
  IconCircleDot,
  IconCircleOff,
  IconClockPause,
  IconCoffee,
  IconCoins,
  IconCreditCard,
  IconCrown,
  IconCursorText,
  IconDeviceMobile,
  IconDots,
  IconDownload,
  IconEdit,
  IconFile,
  IconFileCheck,
  IconFileInvoice,
  IconFiles,
  IconFolder,
  IconForms,
  IconHeadset,
  IconHeartbeat,
  IconHelp,
  IconHelpCircle,
  IconHome,
  IconHourglass,
  IconKey,
  IconLanguage,
  IconLayoutGrid,
  IconLifebuoy,
  IconLink,
  IconListDetails,
  IconMail,
  IconMap,
  IconMapPin,
  IconMessageCircle,
  IconNews,
  IconPackage,
  IconPalette,
  IconPaperclip,
  IconPhone,
  IconPhoto,
  IconReceipt2,
  IconShieldCheck,
  IconShoppingBag,
  IconShoppingCart,
  IconSquareCheck,
  IconStack2,
  IconStack3,
  IconTarget,
  IconToggleRight,
  IconTool,
  IconToolsKitchen2,
  IconTruckDelivery,
  IconUser,
  IconUserEdit,
  IconUsers,
  IconWorld,
  IconWorldOff,
  IconWriting,
  IconX,
  type Icon,
} from "@tabler/icons-react";
import type { Answer, Field, FieldType, Option, Section } from "../shared/types";

// Ikony dobieramy po treści podpisu, nie po id: działa też dla pytań, które dopisze agencja albo AI.
// Kolejność ma znaczenie: pierwsza pasująca reguła wygrywa.

type Rule = [RegExp, Icon];

const OPTION_RULES: Rule[] = [
  [/newsletter/, IconMail],
  [/whatsapp|messenger|czat/, IconBrandWhatsapp],
  [/telefon|zadzwoni/, IconPhone],
  [/formularz|zapytani|kontakt/, IconForms],
  [/innym języku|język/, IconLanguage],
  [/zagranic|za granic/, IconWorld],
  [/sprzeda|kupi|e-commerce|handel|sklep/, IconShoppingCart],
  [/rezerw|zapis/, IconCalendarEvent],
  [/wizerun|zaufani/, IconShieldCheck],
  [/rekrut/, IconBriefcase],
  [/usług/, IconTool],
  [/produkc/, IconBuildingFactory2],
  [/okolic|lokaln/, IconMapPin],
  [/cał(ej|a) polsk|kraj/, IconMap],
  [/firm|b2b/, IconBuilding],
  [/pobrani/, IconCash],
  [/ofert/, IconDownload],
  [/jedna strona|landing/, IconFile],
  [/^2–5|kilka podstron/, IconFiles],
  [/^6–15/, IconStack2],
  [/ponad 15|dużo podstron/, IconStack3],
  [/blog|aktualno/, IconNews],
  [/galeri|realizac|zdjęć|zdjęci/, IconPhoto],
  [/my sami|sami/, IconUserEdit],
  [/agencj|opiek/, IconHeadset],
  [/nic nie|z niczym|brak/, IconCircleOff],
  [/blik|szybkie przelewy/, IconDeviceMobile],
  [/kart/, IconCreditCard],
  [/raty|odroczon/, IconReceipt2],
  [/przelew/, IconBuildingBank],
  [/kurier/, IconTruckDelivery],
  [/paczkomat/, IconPackage],
  [/odbiór|odbior/, IconBuildingStore],
  [/magazyn|erp/, IconBuildingWarehouse],
  [/allegro/, IconShoppingBag],
  [/faktur/, IconFileInvoice],
  [/pełną|kolory|fonty/, IconPalette],
  [/logo/, IconBadge],
  [/zaprojekt/, IconBrush],
  [/gotowe tekst/, IconFileCheck],
  [/zredag|redakc/, IconEdit],
  [/copywriter|tekst/, IconWriting],
  [/nie mamy domeny/, IconWorldOff],
  [/nie wiemy|nie wiem/, IconHelp],
  [/domen|panel/, IconKey],
  [/do miesiąca|pilne|szybko/, IconHourglass],
  [/miesięc|miesiąc/, IconCalendarMonth],
  [/pośpiech|spokojnie/, IconCoffee],
  [/zł|budżet|tys\./, IconCoins],
  [/jedna osoba|^ja$/, IconUser],
  [/kilka osób|wspólnie|zespół/, IconUsers],
  [/zarząd|właściciel/, IconCrown],
  [/gastro|restaurac|kawiar/, IconToolsKitchen2],
  [/zdrow|urod/, IconHeartbeat],
  [/budown|nieruchom|dom/, IconHome],
  [/^do 50$/, IconBox],
  [/50–500|ponad 500/, IconBoxMultiple],
  [/termin|kalendarz|data/, IconCalendar],
  [/strona|www|internet/, IconWorld],
];

/** Stałe odpowiedzi mają stałe ikony. */
const FIXED: Record<string, Icon> = {
  yes: IconCheck,
  no: IconX,
  will_send: IconMail,
  link: IconLink,
  need_help: IconLifebuoy,
  __other: IconDots,
};

export function optionIcon(field: Field, option: Option): Icon {
  if ((field.type === "yes_no" || field.type === "material" || option.id === "__other") && FIXED[option.id]) {
    return FIXED[option.id];
  }
  const label = option.label.toLowerCase();
  return OPTION_RULES.find(([re]) => re.test(label))?.[1] ?? IconCircleDot;
}

/** Pastelowe tony pod ikonami. Kolejne opcje dostają kolejne tony. */
export const TONES = 6;
export const toneOf = (index: number) => `tone-${(index % TONES) + 1}`;

const SECTION_RULES: Rule[] = [
  [/firm|o was|o nas/, IconBuildingStore],
  [/cel/, IconTarget],
  [/zakres|funkcj/, IconLayoutGrid],
  [/sklep|sprzeda/, IconShoppingCart],
  [/wygląd|charakter|styl|marka/, IconPalette],
  [/materiał|pliki|treści/, IconFolder],
  [/termin|budżet|harmonogram/, IconCalendarClock],
  [/seo|analityk|marketing/, IconTarget],
];

export function sectionIcon(section: Pick<Section, "title">): Icon {
  const title = section.title.toLowerCase();
  return SECTION_RULES.find(([re]) => re.test(title))?.[1] ?? IconListDetails;
}

export const FIELD_TYPE_ICON: Record<FieldType, Icon> = {
  single_choice: IconCircleDot,
  multi_choice: IconSquareCheck,
  yes_no: IconToggleRight,
  scale: IconAdjustmentsHorizontal,
  material: IconPaperclip,
  short_text: IconCursorText,
  long_text: IconAlignLeft,
};

/** Ikona do dymka z odpowiedzią: wybrana opcja, „nie wiem” albo „na później”. Wielokrotny wybór i tekst bez ikony. */
export function answerIcon(field: Field, answer: Answer | undefined, options: Option[]): Icon | null {
  if (!answer) return null;
  if (answer.status === "unknown") return IconHelpCircle;
  if (answer.status === "skipped") return IconClockPause;
  if (typeof answer.value !== "string" || field.type === "short_text" || field.type === "long_text") return null;
  const option = options.find((o) => o.id === answer.value) ?? (answer.value === "__other" ? { id: "__other", label: "" } : null);
  return option ? optionIcon(field, option) : null;
}

export { IconMessageCircle as ChatIcon };
