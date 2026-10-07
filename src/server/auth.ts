import { accountKey, accountStub, SESSION_TTL } from "./accounts";

// Logowanie agencji kodem z maila. Klient briefu nie loguje się nigdy: wchodzi swoim linkiem.

const COOKIE = "dh_session";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (data: unknown, status = 200, headers?: HeadersInit) => Response.json(data, { status, headers });

export function normalizeEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

function domainAllowed(env: Env, email: string): boolean {
  const allowed = String(env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return allowed.length === 0 || allowed.includes(email.split("@")[1]);
}

/** Zapis tylko z naszej strony: JSON wymusza preflight przy obcym originie, a ciasteczko ma SameSite=Lax. */
export async function readJson<T>(request: Request): Promise<T | null> {
  // Ciało czytamy zawsze do końca: nieprzeczytane psuje lokalnemu serwerowi następne żądanie.
  const text = await request.text().catch(() => "");
  if (!request.headers.get("content-type")?.includes("application/json")) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function sessionCookie(value: string, maxAge: number, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function readCookie(request: Request): { key: string; session: string } | null {
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  const match = raw?.match(/^([0-9a-f]{40})\.([A-Za-z0-9]{32})$/);
  return match ? { key: match[1], session: match[2] } : null;
}

export interface Session {
  key: string;
  email: string;
  account: ReturnType<typeof accountStub>;
}

export async function getSession(request: Request, env: Env): Promise<Session | null> {
  const cookie = readCookie(request);
  if (cookie) {
    const account = accountStub(env, cookie.key);
    const email = await account.sessionEmail(cookie.session);
    if (email) return { key: cookie.key, email, account };
  }
  // Lokalnie bez maila i kodu: od razu konto deweloperskie. W buildzie produkcyjnym ta gałąź znika.
  if (import.meta.env.DEV) return devSession(env);
  return null;
}

async function devSession(env: Env): Promise<Session> {
  const email = normalizeEmail(env.DEV_EMAIL) ?? "dev@designhouse.me";
  const key = await accountKey(email);
  const account = accountStub(env, key);
  await account.ensureEmail(email);
  return { key, email, account };
}

function codeEmail(code: string) {
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  const text = `Twój kod do Briefingu Design House: ${spaced}\n\nWpisz go na stronie, na której podałeś adres. Kod jest ważny 10 minut.\nJeśli to nie Ty, zignoruj tę wiadomość.\n\nDesign House, designhouse.me`;
  // Mail w barwach Design House: płótno, biała karta, znak z limonką na czarnym kafelku.
  const html = `<!doctype html><html lang="pl"><body style="margin:0;background:#fafaf9;font-family:Geist,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111113">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border:1px solid #e8e8e5;border-radius:16px;padding:32px">
<tr><td><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:28px;height:28px;background:#0f1113;border-radius:8px;text-align:center;vertical-align:middle"><span style="display:inline-block;width:12px;height:12px;background:#e6ff32;border-radius:3px"></span></td>
<td style="padding-left:10px;font-size:15px;font-weight:700">Design House</td>
<td style="padding-left:10px;font-size:15px;color:#62626b">Briefing</td>
</tr></table></td></tr>
<tr><td style="padding-top:28px;font-size:15px;line-height:1.5;color:#3f3f46">Twój kod logowania:</td></tr>
<tr><td style="padding:12px 0 20px;font-size:34px;font-weight:700;letter-spacing:6px">${spaced}</td></tr>
<tr><td style="font-size:14px;line-height:1.5;color:#3f3f46">Wpisz go na stronie, na której podałeś adres. Kod jest ważny 10 minut. Jeśli to nie Ty, zignoruj tę wiadomość.</td></tr>
</table>
<p style="font-size:12px;color:#62626b;margin-top:16px">Design House, designhouse.me</p>
</td></tr></table></body></html>`;
  return { text, html, subject: `${spaced} to Twój kod do Briefingu Design House` };
}

/** POST /api/auth/start { email } → wysyła kod. W trybie dev kod wraca też w odpowiedzi (mail idzie tylko do logu). */
export async function startLogin(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ email?: string }>(request);
  const email = normalizeEmail(body?.email);
  if (!email) return json({ error: "Wpisz poprawny adres e-mail." }, 400);
  if (!domainAllowed(env, email)) {
    return json({ error: "Ten adres nie ma dostępu. Zaloguj się adresem firmowym Design House." }, 403);
  }

  const result = await accountStub(env, await accountKey(email)).requestCode(email);
  if (!result.ok) {
    return json({ error: `Kod już wysłany. Następny możesz wysłać za ${result.retryAfter} s.`, retryAfter: result.retryAfter }, 429);
  }

  const message = codeEmail(result.code);
  try {
    await env.EMAIL.send({
      to: email,
      from: { email: env.EMAIL_FROM, name: "Design House" },
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch (error) {
    console.error("Nie udało się wysłać kodu", error);
    if (!import.meta.env.DEV) return json({ error: "Nie udało się wysłać maila. Spróbuj za chwilę." }, 502);
  }
  if (import.meta.env.DEV) {
    console.log(`[dev] Kod logowania dla ${email}: ${result.code}`);
    return json({ ok: true, devCode: result.code });
  }
  return json({ ok: true });
}

/** POST /api/auth/verify { email, code } → ustawia ciasteczko sesji. */
export async function verifyLogin(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ email?: string; code?: string }>(request);
  const email = normalizeEmail(body?.email);
  const code = String(body?.code ?? "").replace(/\D/g, "");
  if (!email || code.length !== 6) return json({ error: "Wpisz 6 cyfr z maila." }, 400);

  const key = await accountKey(email);
  const result = await accountStub(env, key).verifyCode(code);
  if (!result.ok) return json({ error: result.error }, 401);
  return json({ email }, 200, { "set-cookie": sessionCookie(`${key}.${result.session}`, SESSION_TTL / 1000, request) });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const cookie = readCookie(request);
  if (cookie) await accountStub(env, cookie.key).endSession(cookie.session);
  return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0, request) });
}
