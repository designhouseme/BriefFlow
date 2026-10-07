// Maile BriefFlow wyglądają jak aplikacja: logo Design House z podpisem „BriefFlow”, kula jako awatar,
// wiadomość w dymku, kafelki i pigułki jak w rozmowie, przycisk jak w pasku na dole aplikacji.
// Każdy mail ma też wersję tekstową. Lokalnie maile idą do Mailpita, na produkcji przez Cloudflare Email Service.

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const INK = "#111318";
const INK_2 = "#474c58";
const INK_3 = "#686e7b";
const PANEL = "#f4f5f8";
const LINE = "#e9ebef";

/** Wiadomość od BriefFlow: kula jako awatar i dymek, jak pytanie w rozmowie. */
function bubble(origin: string, html: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
<td width="40" valign="bottom" style="padding-right:10px"><img src="${esc(origin)}/brand/orb-email.png" width="36" height="36" alt="" style="display:block;border:0"></td>
<td valign="bottom"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background:${PANEL};border:1px solid ${LINE};border-radius:20px 20px 20px 6px;padding:13px 18px;font-size:16px;line-height:1.45;font-weight:600;color:${INK}">${html}</td>
</tr></table></td>
</tr></table>`;
}

/** Pigułka z tłem w pastelowym tonie, jak plakietki w aplikacji. */
function pill(label: string, bg: string, fg: string) {
  return `<td style="padding:0 6px 6px 0"><span style="display:inline-block;padding:6px 12px;border-radius:999px;background:${bg};color:${fg};font-size:13px;font-weight:600;white-space:nowrap">${esc(label)}</span></td>`;
}

/** Przycisk jak „Wyślij” w aplikacji: czarna pigułka, strzałka w białym kółku. Tabela, bo Outlook nie zna border-radius na <a>. */
function sendButton(label: string, href: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:26px"><tr>
<td style="background:${INK};border-radius:999px;padding:6px 6px 6px 22px">
<a href="${esc(href)}" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;padding-right:14px">${esc(label)}</td>
<td style="background:#ffffff;border-radius:999px;width:34px;height:34px;text-align:center;font-size:17px;font-weight:700;line-height:34px;color:${INK}">&rarr;</td>
</tr></table></a>
</td></tr></table>`;
}

function layout(origin: string, preheader: string, body: string) {
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${PANEL};font-family:${FONT};color:${INK}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PANEL};padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px">
<tr><td style="padding:0 6px 18px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td><img src="${esc(origin)}/brand/dh/logo-email.png" width="154" height="19" alt="Design House" style="display:block;border:0"></td>
<td style="padding:0 12px"><span style="display:block;width:1px;height:18px;background:#dcdfe5;font-size:0;line-height:0">&nbsp;</span></td>
<td style="font-size:15px;font-weight:600;color:${INK_2}">BriefFlow</td>
</tr></table>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:24px;padding:28px 28px 30px">
${body}
</td></tr>
<tr><td style="padding:18px 6px 0;font-size:12px;color:${INK_3}">
<a href="https://designhouse.me" style="color:${INK_3};text-decoration:none;font-weight:600">Design House</a>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

const footerText = "\n\n--\nDesign House";

/** Kod logowania: 6 cyfr, ważny 10 minut. */
export function loginCodeMail(input: { to: string; code: string; origin: string }): Mail {
  const spaced = `${input.code.slice(0, 3)} ${input.code.slice(3)}`;
  // Cyfry jak kafelki odpowiedzi w rozmowie, z przerwą po trzeciej.
  const tiles = input.code
    .split("")
    .map(
      (digit, i) =>
        `${i === 3 ? '<td style="width:10px"></td>' : ""}<td style="padding-right:6px"><span style="display:inline-block;width:42px;height:54px;line-height:54px;text-align:center;border:1px solid ${LINE};border-radius:14px;background:#ffffff;font-size:26px;font-weight:700;color:${INK};box-shadow:0 2px 8px -2px rgba(17,19,24,0.08)">${digit}</span></td>`,
    )
    .join("");
  const body = `${bubble(input.origin, `Oto Twój kod logowania.<br><span style="font-weight:400;font-size:14px;color:${INK_2}">Wpisz go na stronie, na której podałeś adres.</span>`)}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0 50px"><tr>${tiles}</tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 0 50px"><tr>
${pill("Ważny 10 minut", "#e8eeff", "#3550d4")}${pill("Działa raz", "#e2f4ea", "#1f7a4f")}
</tr></table>
<p style="margin:18px 0 0 50px;font-size:13.5px;line-height:1.55;color:${INK_3}">Jeśli to nie Ty prosiłeś o kod, zignoruj tę wiadomość: bez kodu nikt się nie zaloguje.</p>`;
  return {
    to: input.to,
    subject: `${spaced} to Twój kod do BriefFlow`,
    html: layout(input.origin, `Kod logowania: ${spaced}. Ważny 10 minut.`, body),
    text: `Twój kod logowania do BriefFlow: ${spaced}\n\nWpisz go na stronie, na której podałeś adres. Kod jest ważny 10 minut i działa tylko raz.\nJeśli to nie Ty prosiłeś o kod, zignoruj tę wiadomość.${footerText}`,
  };
}

/** Klient kliknął „Wyślij” na końcu briefu. Idzie do osoby z agencji, która brief utworzyła. */
export function briefSentMail(input: {
  to: string;
  origin: string;
  briefId: string;
  briefName: string;
  settled: number;
  total: number;
  open: number;
}): Mail {
  const pct = input.total ? Math.round((input.settled / input.total) * 100) : 0;
  const url = `${input.origin}/app/b/${input.briefId}`;
  const few = input.open % 10 >= 2 && input.open % 10 <= 4 && (input.open % 100 < 12 || input.open % 100 > 14);
  const openLabel = input.open === 1 ? "1 pytanie do uzupełnienia" : `${input.open} ${few ? "pytania" : "pytań"} do uzupełnienia`;
  const openLine = input.open
    ? `${openLabel}. Klient może to zrobić tym samym linkiem.`
    : "Wszystkie pytania mają odpowiedź.";
  const status = input.open ? pill(openLabel, "#fff0dc", "#8a4f10") : pill("Komplet odpowiedzi", "#e2f4ea", "#1f7a4f");
  const body = `${bubble(input.origin, `Klient wysłał brief.<br><span style="font-weight:400;font-size:14px;color:${INK_2}">Tak wygląda postęp.</span>`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;border:1px solid ${LINE};border-radius:18px;background:#ffffff;box-shadow:0 2px 8px -2px rgba(17,19,24,0.06)">
<tr><td style="padding:18px 20px 4px">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
<td style="font-size:15px;font-weight:700;color:${INK}">${esc(input.briefName)}</td>
<td align="right" style="font-size:15px;font-weight:700;color:${INK}">${pct}%</td>
</tr></table>
</td></tr>
<tr><td style="padding:10px 20px 6px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LINE};border-radius:999px"><tr>
<td width="${Math.max(pct, 2)}%" style="background:#2f9466;border-radius:999px;height:6px;font-size:0;line-height:0">&nbsp;</td><td style="font-size:0;line-height:0">&nbsp;</td>
</tr></table>
</td></tr>
<tr><td style="padding:8px 20px 0;font-size:13.5px;color:${INK_2}">${input.settled} z ${input.total} odpowiedzi</td></tr>
<tr><td style="padding:12px 14px 12px 20px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${status}</tr></table></td></tr>
</table>
${sendButton("Otwórz brief", url)}`;
  return {
    to: input.to,
    subject: `Klient wysłał brief: ${input.briefName}`,
    html: layout(input.origin, `${input.settled} z ${input.total} odpowiedzi. ${openLine}`, body),
    text: `Klient wysłał brief: ${input.briefName}\n\n${input.settled} z ${input.total} odpowiedzi (${pct}%).\n${openLine}\n\nOtwórz brief: ${url}${footerText}`,
  };
}

/**
 * Wysyłka. Lokalnie (vite dev) z ustawionym MAILPIT_URL mail trafia do Mailpita przez jego API, żeby dało się go
 * obejrzeć; bez tego, i zawsze na produkcji, idzie przez Cloudflare Email Service (binding EMAIL).
 */
export async function sendMail(env: Env, mail: Mail): Promise<void> {
  if (import.meta.env.DEV && env.MAILPIT_URL) {
    const response = await fetch(`${env.MAILPIT_URL.replace(/\/$/, "")}/api/v1/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        From: { Email: env.EMAIL_FROM, Name: "Design House" },
        To: [{ Email: mail.to }],
        Subject: mail.subject,
        HTML: mail.html,
        Text: mail.text,
      }),
    });
    if (!response.ok) throw new Error(`Mailpit: ${response.status}`);
    return;
  }
  await env.EMAIL.send({
    to: mail.to,
    from: { email: env.EMAIL_FROM, name: "Design House" },
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
}
