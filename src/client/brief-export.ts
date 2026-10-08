import { visibleSteps } from "../shared/flow";
import { describeAnswer, formatDate, optionsOf, progress } from "../shared/ops";
import type { Answer, Brief, Field } from "../shared/types";

const dateTime = (at: number) =>
  new Date(at).toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" });

/** Every user-controlled string enters the print document through this function. */
export function escapePrintHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/** Readable labels rather than option ids; line breaks also work in the clipboard export. */
export function exportAnswer(field: Field, answer: Answer | undefined): string {
  if (!answer) return "Brak odpowiedzi";
  if (answer.status === "skipped") return "Pominięte — do uzupełnienia";
  if (answer.status === "unknown") return "Nie wiem — do ustalenia";
  const label = (id: string) =>
    id === "__other"
      ? `Inne: ${answer.other || "do ustalenia"}`
      : optionsOf(field).find((option) => option.id === id)?.label ?? id;
  if (Array.isArray(answer.value)) return answer.value.map(label).join("\n");
  if (field.type === "scale") return `${answer.value}/5 (${field.scaleMin || "Mało"} → ${field.scaleMax || "Dużo"})`;
  if (field.type === "confirm") return answer.value === "fix" ? `Trzeba poprawić:\n${answer.other || "do ustalenia"}` : "Zgadza się";
  if (field.type === "deadline" && answer.value === "data") {
    return `Na konkretną datę${answer.other ? `: ${formatDate(answer.other)}` : " — do ustalenia"}`;
  }
  if (field.type === "consent") return `${label(String(answer.value))}\nData odpowiedzi: ${dateTime(answer.at)}`;
  if (typeof answer.value === "string" && optionsOf(field).length) {
    return label(answer.value) + (answer.value !== "__other" && answer.other ? `\n${answer.other}` : "");
  }
  return describeAnswer(field, answer);
}

function counts(brief: Brief): string {
  const { total, answered, skipped, unknown } = progress(brief);
  return `Odpowiedzi: ${answered}/${total} · Pominięte: ${skipped} · Nie wiem: ${unknown} · Bez odpowiedzi: ${total - answered - skipped - unknown}`;
}

/** A complete text snapshot, with the same visibility rules as the client flow. No access link is added. */
export function buildBriefSummary(brief: Brief): string {
  const lines = [
    brief.title || "Brief",
    `Klient: ${brief.clientName || "Nie podano"}`,
    `Utworzono: ${dateTime(brief.createdAt)}`,
    `Aktualizacja: ${dateTime(brief.updatedAt)}`,
    brief.completedAt ? `Zakończono: ${dateTime(brief.completedAt)}` : "Status: brief w trakcie uzupełniania",
    counts(brief),
  ];
  for (const { section, fields } of visibleSteps(brief)) {
    lines.push("", section.title);
    if (section.description) lines.push(section.description);
    for (const field of fields) {
      lines.push("", `${field.label}${field.required ? " [wymagane]" : ""}`);
      if (field.prefill) lines.push(`Do potwierdzenia: ${field.prefill}`);
      lines.push(exportAnswer(field, brief.answers[field.id]));
    }
  }
  return lines.join("\n");
}

/** Links remain clickable in saved PDFs. Other schemes are printed as plain text. */
function textWithLinks(value: string): string {
  const pattern = /https?:\/\/[^\s<>"']+/g;
  let html = "";
  let end = 0;
  for (const match of value.matchAll(pattern)) {
    const start = match.index;
    const raw = match[0];
    // Sentence punctuation does not belong to a URL. Preserve matching parentheses inside URLs.
    let url = raw.replace(/[.,;!?:]+$/, "");
    while (url.endsWith(")") && (url.match(/\)/g)?.length ?? 0) > (url.match(/\(/g)?.length ?? 0)) url = url.slice(0, -1);
    html += escapePrintHtml(value.slice(end, start));
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Unsupported protocol");
      html += `<a href="${escapePrintHtml(url)}" rel="noreferrer">${escapePrintHtml(url)}</a>`;
      html += escapePrintHtml(raw.slice(url.length));
    } catch {
      html += escapePrintHtml(raw);
    }
    end = start + raw.length;
  }
  return html + escapePrintHtml(value.slice(end));
}

function safeLogoUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // Sender logos are served by the app; this also supports a temporary preview from an uploaded image.
  if (/^\/(?!\/)[^\s]*$/.test(value)) return value;
  if (/^blob:https?:\/\//.test(value)) return value;
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const PRINT_STYLE = `
  @page { size: A4; margin: 14mm 15mm 16mm; }
  * { box-sizing: border-box; }
  html { color-scheme: light; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; color: #111318; background: #eef0f5; font: 10.5pt/1.48 "Atkinson Hyperlegible Next Variable", Arial, Helvetica, sans-serif; }
  .toolbar { position: sticky; top: 0; z-index: 1; padding: 14px 24px; background: #fff; border-bottom: 1px solid #e1e4ec; display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
  .toolbar p { margin: 0; flex: 1; font-size: 10pt; color: #596174; }
  .toolbar button { border: 1px solid #d9dee9; border-radius: 8px; padding: 9px 14px; font: inherit; cursor: pointer; background: white; color: inherit; }
  .toolbar button:first-of-type { background: #3d5bf0; border-color: #3d5bf0; color: white; }
  .toolbar button:disabled { opacity: .5; cursor: wait; }
  .toolbar button:focus-visible { outline: 3px solid #9cadff; outline-offset: 3px; }
  .document { max-width: 210mm; margin: 24px auto; padding: 14mm 15mm 16mm; background: #fff; box-shadow: 0 4px 30px #18233d12; }
  .brand { display: flex; justify-content: space-between; align-items: center; gap: 24px; margin-bottom: 30px; }
  .brand-lockup { display: flex; align-items: center; gap: 10px; color: #111214; background: #fff; }
  .brand-dh { display: block; width: 35px; height: auto; flex: 0 0 auto; }
  .brand-name { font-size: 19pt; font-weight: 700; line-height: 1; letter-spacing: -.035em; }
  .sender { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
  .sender-label { font-size: 7.5pt; letter-spacing: .09em; text-transform: uppercase; color: #737d92; }
  .sender-logo { display: block; max-width: 145px; max-height: 54px; object-fit: contain; }
  .eyebrow { margin: 0 0 8px; font-size: 8pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #3d5bf0; }
  h1 { font-size: 29pt; font-weight: 700; line-height: 1.12; letter-spacing: -.035em; margin: 0 0 12px; overflow-wrap: anywhere; }
  .client { margin: 0 0 18px; font-size: 12pt; color: #596174; overflow-wrap: anywhere; }
  .client strong { color: #111318; font-weight: 600; }
  .metadata { display: flex; flex-wrap: wrap; gap: 16px 25px; margin: 0; padding: 14px 0; border-top: 1px solid #e6e9f0; }
  .metadata div { display: flex; flex-direction: column; gap: 3px; }
  .metadata dt { color: #737d92; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .06em; }
  .metadata dd { margin: 0; color: #40495c; font-size: 9pt; }
  .overview { padding: 16px 18px; border: 1px solid #dde4ff; border-radius: 12px; background: #f6f8ff; margin-top: 4px; break-inside: avoid; }
  .overview-top { display: flex; justify-content: space-between; gap: 14px; align-items: center; margin-bottom: 12px; }
  .overview-title { margin: 0; font-weight: 600; font-size: 9.5pt; }
  .brief-status { display: inline-flex; align-items: center; gap: 5px; border-radius: 20px; padding: 4px 9px; font-size: 8pt; font-weight: 600; color: #2c43c0; background: #e9edff; }
  .brief-status.is-completed { color: #196448; background: #e7f4ed; }
  .stats { display: grid; grid-template-columns: 1.2fr 1fr 1fr 1fr; gap: 12px; margin: 0; }
  .stats div { display: flex; flex-direction: column; min-width: 0; }
  .stats dt { order: 2; color: #667087; font-size: 8pt; margin-top: 2px; }
  .stats dd { margin: 0; color: #111318; font-size: 21pt; font-weight: 600; letter-spacing: -.025em; line-height: 1.1; }
  .stats dd small { font-size: 12pt; font-weight: 400; color: #8992a6; }
  .stats .stat-answered dd { color: #3d5bf0; }
  .progress-track { height: 4px; border-radius: 2px; overflow: hidden; background: #e3e8f9; margin-top: 14px; }
  .progress-track span { display: block; height: 100%; background: #3d5bf0; border-radius: inherit; }
  section { margin-top: 26px; }
  .section-head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 12px; break-inside: avoid; break-after: avoid; page-break-after: avoid; }
  .section-number { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 30px; width: 30px; height: 30px; background: #e9edff; color: #3d5bf0; font-size: 10pt; font-weight: 700; border-radius: 8px; }
  .section-titles { flex: 1; min-width: 0; }
  h2 { font-size: 16pt; font-weight: 600; line-height: 1.25; letter-spacing: -.02em; margin: 1px 0 0; overflow-wrap: anywhere; }
  .section-description { margin: 5px 0 0; color: #667087; font-size: 9.5pt; white-space: pre-wrap; overflow-wrap: anywhere; }
  .section-count { margin: 6px 0 0; color: #737d92; font-size: 8pt; }
  .question { padding: 13px 15px; margin-bottom: 9px; border: 1px solid #e3e7ef; border-radius: 10px; break-inside: avoid; page-break-inside: avoid; }
  .question-header { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; margin-bottom: 8px; }
  .question-label { display: flex; gap: 8px; flex: 1; min-width: 0; }
  .question-index { color: #929aab; font-size: 8pt; line-height: 1.8; flex: 0 0 auto; }
  h3 { font-size: 10.5pt; font-weight: 600; line-height: 1.35; margin: 0; break-after: avoid; overflow-wrap: anywhere; }
  .required { display: inline-block; color: #737d92; font-size: 7pt; font-weight: 400; padding-left: 4px; white-space: nowrap; }
  .answer-tag { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 5px; padding: 3px 7px; border-radius: 5px; font-size: 7.5pt; line-height: 1.2; color: #196448; background: #eaf5ee; }
  .answer-tag::before { content: ""; width: 4px; height: 4px; border-radius: 50%; background: currentColor; }
  .is-skipped .answer-tag { color: #946010; background: #fff4de; }
  .is-unknown .answer-tag { color: #6750a4; background: #f0ebfb; }
  .is-missing .answer-tag { color: #6f788b; background: #eff1f5; }
  .prefill { margin: 0 0 8px; padding-left: 9px; border-left: 2px solid #ccd7ff; color: #667087; font-size: 9pt; white-space: pre-wrap; overflow-wrap: anywhere; }
  .answer { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; orphans: 3; widows: 3; }
  .answer.is-open { color: #737d92; font-size: 9.5pt; }
  a { color: #2c43c0; text-decoration: underline; text-decoration-color: #bcc7f7; text-underline-offset: 2px; overflow-wrap: anywhere; }
  footer { display: flex; gap: 18px; justify-content: space-between; margin-top: 26px; color: #8992a6; font-size: 7.5pt; border-top: 1px solid #e6e9f0; padding-top: 11px; break-inside: avoid; }
  .footer-brand { color: #596174; font-weight: 600; white-space: nowrap; }
  .footer-meta { text-align: right; }
  .empty { padding: 22px; border: 1px dashed #d9deea; border-radius: 10px; color: #667087; margin-top: 24px; }
  @media (max-width: 650px) {
    .document { margin: 0; padding: 24px; box-shadow: none; }
    .toolbar { padding: 12px; }
    h1 { font-size: 24pt; }
    .question-header { flex-direction: column; gap: 7px; }
    .stats { gap: 8px; }
    .stats dd { font-size: 18pt; }
  }
  @media print {
    html, body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .toolbar { display: none; }
    .document { max-width: none; padding: 0; margin: 0; box-shadow: none; }
    .brand, .brief-head { break-inside: avoid; }
    .question-header { flex-direction: row; gap: 12px; }
    h1 { font-size: 29pt; }
    .stats dd { font-size: 21pt; }
  }
`;

/** Pure HTML builder, also useful for checking the exact document sent to the print dialog. */
export function buildBriefPrintHtml(brief: Brief, logoUrl?: string, exportedAt = Date.now()): string {
  const logo = safeLogoUrl(logoUrl);
  // Reuse the application's bundled font assets. Resolve URLs against their stylesheet so the
  // same faces work in Vite dev and after a production build, inside the separate print document.
  let fontFaces = "";
  if (typeof document !== "undefined") {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          if (rule.type !== 5 || !rule.cssText.includes("Atkinson Hyperlegible Next Variable")) continue;
          fontFaces += rule.cssText.replace(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/g, (_match, _quote: string, source: string) =>
            `url("${new URL(source.trim(), sheet.href || document.baseURI).href.replace(/"/g, "%22")}")`,
          );
        }
      } catch { /* Cross-origin stylesheets may deny reading; the system font remains available. */ }
    }
  }
  const { total, answered, skipped, unknown } = progress(brief);
  const missing = total - answered - skipped - unknown;
  const pct = total ? Math.round(answered / total * 100) : 0;
  const sections = visibleSteps(brief).map(({ section, fields }, sectionIndex) => `
    <section>
      <div class="section-head"><span class="section-number" aria-hidden="true">${String(sectionIndex + 1).padStart(2, "0")}</span><div class="section-titles"><h2>${escapePrintHtml(section.title)}</h2>${section.description ? `<p class="section-description">${escapePrintHtml(section.description)}</p>` : ""}<p class="section-count">${fields.filter((field) => brief.answers[field.id]?.status === "answered").length} z ${fields.length} odpowiedzi</p></div></div>
      ${fields.map((field, fieldIndex) => {
        const answer = brief.answers[field.id];
        const state = answer?.status || "missing";
        const tag = { answered: "Odpowiedź", skipped: "Do uzupełnienia", unknown: "Do ustalenia", missing: "Brak odpowiedzi" }[state];
        return `<article class="question is-${state}">
          <div class="question-header"><div class="question-label"><span class="question-index" aria-hidden="true">${fieldIndex + 1}.</span><h3>${escapePrintHtml(field.label)}${field.required ? ' <span class="required">Wymagane</span>' : ""}</h3></div><span class="answer-tag">${tag}</span></div>
          ${field.prefill ? `<p class="prefill">Do potwierdzenia: ${escapePrintHtml(field.prefill)}</p>` : ""}
          <p class="answer${answer?.status === "answered" ? "" : " is-open"}">${textWithLinks(exportAnswer(field, answer))}</p>
        </article>`;
      }).join("\n")}
    </section>`).join("\n");
  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapePrintHtml(brief.title || "Brief")} – BriefFlow</title><style>${fontFaces.replace(/</g, "\\3c ")}${PRINT_STYLE}</style></head>
<body>
  <div class="toolbar"><p id="print-status" role="status">W oknie drukowania wybierz „Zapisz jako PDF”. Wyłącz nagłówki i stopki przeglądarki.</p><button id="print-button" type="button">Zapisz jako PDF / Drukuj</button><button id="close-button" type="button">Zamknij</button></div>
  <main class="document">
    <div class="brand"><div class="brand-lockup"><svg class="brand-dh" viewBox="0 0 151 106" fill="currentColor" aria-hidden="true"><rect x="73.18" y="0" width="31.73" height="31.73" rx="5.88"/><rect x="0" y="31.82" width="73.39" height="73.39" rx="5.88"/><rect x="104.8" y="31.81" width="45.5" height="45.5" rx="5.88"/></svg><span class="brand-name">BriefFlow</span></div>${logo ? `<div class="sender"><span class="sender-label">Przygotowane przez</span><img class="sender-logo" src="${escapePrintHtml(logo)}" alt="Logo wysyłającego"></div>` : ""}</div>
    <header class="brief-head"><p class="eyebrow">Brief projektu</p><h1>${escapePrintHtml(brief.title || "Brief")}</h1><p class="client">Klient: <strong>${escapePrintHtml(brief.clientName || "Nie podano")}</strong></p>
      <dl class="metadata"><div><dt>Utworzono</dt><dd>${escapePrintHtml(dateTime(brief.createdAt))}</dd></div><div><dt>Ostatnia aktualizacja</dt><dd>${escapePrintHtml(dateTime(brief.updatedAt))}</dd></div>${brief.completedAt ? `<div><dt>Zakończono</dt><dd>${escapePrintHtml(dateTime(brief.completedAt))}</dd></div>` : ""}</dl>
      <div class="overview" aria-label="${escapePrintHtml(counts(brief))}"><div class="overview-top"><p class="overview-title">Stan odpowiedzi</p><span class="brief-status${brief.completedAt ? " is-completed" : ""}">${brief.completedAt ? "Brief zakończony" : "W trakcie uzupełniania"}</span></div>
        <dl class="stats"><div class="stat-answered"><dt>Odpowiedzi</dt><dd>${answered}<small> / ${total}</small></dd></div><div><dt>Pominięte</dt><dd>${skipped}</dd></div><div><dt>Nie wiem</dt><dd>${unknown}</dd></div><div><dt>Bez odpowiedzi</dt><dd>${missing}</dd></div></dl>
        <div class="progress-track" role="img" aria-label="${pct}% konkretnych odpowiedzi"><span style="width:${pct}%"></span></div>
      </div>
    </header>
    ${sections || '<p class="empty">Brief nie ma obecnie pytań widocznych dla klienta.</p>'}
    <footer><span class="footer-brand">BriefFlow · Brief projektu</span><span class="footer-meta">Stan odpowiedzi: ${escapePrintHtml(dateTime(brief.updatedAt))}<br>Eksport: ${escapePrintHtml(dateTime(exportedAt))}</span></footer>
  </main>
</body></html>`;
}

/** PDF preview and printing stay in the current page; no popup permission is needed. */
export async function exportBrief(brief: Brief, logoUrl?: string): Promise<void> {
  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = document.createElement("dialog");
  dialog.className = "brief-export-dialog";
  dialog.setAttribute("aria-label", "Podgląd PDF briefu");
  const frame = document.createElement("iframe");
  frame.title = "Podgląd dokumentu A4";
  dialog.appendChild(frame);
  document.body.appendChild(dialog);
  const close = () => {
    dialog.close();
    dialog.remove();
    if (previouslyFocused?.isConnected) previouslyFocused.focus();
  };
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  try {
    dialog.showModal();
    const printWindow = frame.contentWindow;
    const printDocument = frame.contentDocument;
    if (!printWindow || !printDocument) throw new Error("Nie udało się otworzyć podglądu PDF. Spróbuj ponownie.");
    const absoluteLogo = logoUrl ? new URL(logoUrl, window.location.origin).href : undefined;
    printDocument.open();
    printDocument.write(buildBriefPrintHtml(brief, absoluteLogo));
    printDocument.close();
    const printButton = printDocument.getElementById("print-button") as HTMLButtonElement;
    const closeButton = printDocument.getElementById("close-button") as HTMLButtonElement;
    const status = printDocument.getElementById("print-status")!;
    printButton.disabled = true;
    status.textContent = "Przygotowuję dokument…";
    closeButton.addEventListener("click", close, { once: true });
    printDocument.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); close(); } });
    closeButton.focus();
    let logoFailed = false;
    const loads = [...printDocument.images].map((img) => new Promise<void>((resolve) => {
      if (img.complete) {
        if (!img.naturalWidth) { logoFailed = true; img.remove(); }
        resolve();
        return;
      }
      let timer: number;
      const done = () => {
        window.clearTimeout(timer);
        img.removeEventListener("load", done);
        img.removeEventListener("error", done);
        if (!img.naturalWidth) { logoFailed = true; img.remove(); }
        resolve();
      };
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
      timer = window.setTimeout(done, 8000);
    }));
    let fontsTimer: number | undefined;
    const fontsReady = Promise.race([
      printDocument.fonts.ready,
      new Promise<void>((resolve) => { fontsTimer = window.setTimeout(resolve, 8000); }),
    ]).finally(() => window.clearTimeout(fontsTimer));
    await Promise.all([...loads, fontsReady]);
    if (!dialog.isConnected) return;
    status.textContent = logoFailed
      ? "Nie udało się wczytać logo. Dokument jest gotowy bez logo. Wybierz „Zapisz jako PDF” w oknie drukowania."
      : "W oknie drukowania wybierz „Zapisz jako PDF”. Wyłącz nagłówki i stopki przeglądarki.";
    printButton.disabled = false;
    printButton.addEventListener("click", () => {
      if (!dialog.isConnected) return;
      printWindow.focus();
      printWindow.print();
    });
    printButton.focus();
  } catch (error) {
    close();
    throw error;
  }
}
