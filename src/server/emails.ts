// Maile Briefingu: wspólny układ (logo Design House z podpisem „Briefing”, biała karta, stopka z danymi firmy)
// i wersja tekstowa każdego maila. Kolory jak w aplikacji. Lokalnie maile idą do Mailpita, na produkcji przez
// Cloudflare Email Service.

export const COMPANY = {
  name: "Design House Maciej Recław",
  address: "ul. Rzemieślnicza 11, 83-400 Skorzewo",
  site: "designhouse.me",
} as const;

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/** Przycisk jak w aplikacji: czarna pigułka. Tabela, bo Outlook nie zna border-radius na <a>. */
function button(label: string, href: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px"><tr>
<td style="background:#111318;border-radius:999px"><a href="${esc(href)}" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${esc(label)}&nbsp;&rarr;</a></td>
</tr></table>`;
}

function layout(origin: string, preheader: string, body: string) {
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:${FONT};color:#111318">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 8px 18px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td><img src="${esc(origin)}/brand/dh/logo-email.png" width="154" height="19" alt="Design House" style="display:block;border:0"></td>
<td style="padding:0 12px"><span style="display:block;width:1px;height:18px;background:#dcdfe5;font-size:0;line-height:0">&nbsp;</span></td>
<td style="font-size:15px;font-weight:600;color:#474c58">Briefing</td>
</tr></table>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e9ebef;border-radius:20px;padding:32px 32px 30px">
${body}
</td></tr>
<tr><td style="padding:18px 8px 0;font-size:12px;line-height:1.6;color:#686e7b">
${COMPANY.name}, ${COMPANY.address}<br>
<a href="https://${COMPANY.site}" style="color:#686e7b">${COMPANY.site}</a>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

const footerText = `\n\n--\n${COMPANY.name}, ${COMPANY.address}\n${COMPANY.site}`;

/** Kod logowania: 6 cyfr, ważny 10 minut. */
export function loginCodeMail(input: { to: string; code: string; origin: string }): Mail {
  const spaced = `${input.code.slice(0, 3)} ${input.code.slice(3)}`;
  const body = `<p style="margin:0;font-size:22px;font-weight:700;letter-spacing:-0.01em">Twój kod logowania</p>
<p style="margin:8px 0 0;font-size:15px;line-height:1.55;color:#474c58">Wpisz go na stronie, na której podałeś adres.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px"><tr>
<td style="background:#f4f5f8;border:1px solid #e9ebef;border-radius:16px;padding:16px 26px;font-size:34px;font-weight:700;letter-spacing:8px;font-variant-numeric:tabular-nums">${spaced}</td>
</tr></table>
<p style="margin:22px 0 0;font-size:14px;line-height:1.55;color:#474c58">Kod jest ważny 10 minut i działa tylko raz. Jeśli to nie Ty prosiłeś o kod, zignoruj tę wiadomość: bez kodu nikt się nie zaloguje.</p>`;
  return {
    to: input.to,
    subject: `${spaced} to Twój kod do Briefingu`,
    html: layout(input.origin, `Kod logowania: ${spaced}. Ważny 10 minut.`, body),
    text: `Twój kod logowania do Briefingu: ${spaced}\n\nWpisz go na stronie, na której podałeś adres. Kod jest ważny 10 minut i działa tylko raz.\nJeśli to nie Ty prosiłeś o kod, zignoruj tę wiadomość.${footerText}`,
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
  const openLine = input.open
    ? `${input.open} ${input.open === 1 ? "pytanie czeka" : input.open % 10 >= 2 && input.open % 10 <= 4 && (input.open % 100 < 12 || input.open % 100 > 14) ? "pytania czekają" : "pytań czeka"} na uzupełnienie. Klient może to zrobić tym samym linkiem.`
    : "Wszystkie pytania mają odpowiedź.";
  const body = `<p style="margin:0;font-size:22px;font-weight:700;letter-spacing:-0.01em">Klient wysłał brief</p>
<p style="margin:8px 0 0;font-size:15px;line-height:1.55;color:#474c58">${esc(input.briefName)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;background:#f4f5f8;border-radius:16px">
<tr><td style="padding:18px 20px 8px"><span style="font-size:30px;font-weight:700;letter-spacing:-0.02em">${pct}%</span>
<span style="font-size:14px;color:#474c58">&nbsp; ${input.settled} z ${input.total} odpowiedzi</span></td></tr>
<tr><td style="padding:0 20px 18px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9ebef;border-radius:999px"><tr>
<td width="${Math.max(pct, 2)}%" style="background:#2f9466;border-radius:999px;height:6px;font-size:0;line-height:0">&nbsp;</td><td style="font-size:0;line-height:0">&nbsp;</td>
</tr></table>
</td></tr>
</table>
<p style="margin:18px 0 0;font-size:14px;line-height:1.55;color:#474c58">${openLine}</p>
${button("Otwórz brief", url)}`;
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
