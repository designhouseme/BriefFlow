import { getAgentByName, routeAgentRequest } from "agents";
import type { BriefSummary, Me } from "../shared/account";
import { TEMPLATE_LIST } from "../shared/templates";
import type { AccessInfo } from "../shared/types";
import { accountStub, JURISDICTION } from "./accounts";
import { getSession, logout, type Session, startLogin, verifyLogin } from "./auth";
import { briefSentMail, loginCodeMail, sendMail } from "./emails";
import { fromBase64, LOGO_MAX_BYTES, TEMPLATE_ID, toBase64, validateLogo, type StoredLogo } from "./account-resources";

export { BriefAgent } from "./brief-agent";
export { AccountStore } from "./accounts";

const BRIEF_ID = /^[A-Za-z0-9]{12}$/;

function newBriefId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => alphabet[b % 62]).join("");
}

const json = (data: unknown, status = 200) => Response.json(data, { status });
const unauthorized = () => json({ error: "Zaloguj się ponownie." }, 401);
const briefAgent = (env: Env, id: string) => getAgentByName(env.BriefAgent, id, { jurisdiction: JURISDICTION });
const sameOrigin = (request: Request) => request.headers.get("origin") === new URL(request.url).origin;
const forbidden = async (request: Request) => {
  // Drain small rejected uploads too: workerd's local keepalive transport reuses the connection.
  await boundedBytes(request, LOGO_MAX_BYTES);
  return json({ error: "Zapis jest dostępny tylko z aplikacji BriefFlow." }, 403);
};
const accountLogoUrl = (updatedAt: number) => `/api/account/logo?v=${updatedAt}`;

async function boundedBytes(request: Request, limit: number): Promise<Uint8Array | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } catch { return null; }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

async function smallJson<T extends Record<string, unknown>>(request: Request): Promise<T | null> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return null;
  const bytes = await boundedBytes(request, 8192);
  if (!bytes) return null;
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return body && typeof body === "object" && !Array.isArray(body) ? body as T : null;
  } catch { return null; }
}

function logoResponse(logo: StoredLogo | null): Response {
  if (!logo) return json({ error: "Logo nie jest ustawione." }, 404);
  return new Response(fromBase64(logo.data), {
    headers: {
      "content-type": logo.mimeType,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "cross-origin-resource-policy": "same-origin",
    },
  });
}

async function accountLogo(request: Request, session: Session): Promise<Response> {
  if (request.method === "GET") return logoResponse(await session.account.logo());
  if (!sameOrigin(request)) return forbidden(request);
  if (request.method === "DELETE") {
    await session.account.removeLogo();
    return json({ ok: true });
  }
  const bytes = await boundedBytes(request, LOGO_MAX_BYTES);
  if (!bytes) return json({ error: "Logo może mieć maksymalnie 512 KB." }, 413);
  try {
    const mimeType = validateLogo(bytes, request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "");
    const updatedAt = await session.account.saveLogo({ data: toBase64(bytes), mimeType });
    return json({ logoUrl: accountLogoUrl(updatedAt) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Nie udało się zapisać logo." }, 400);
  }
}

async function briefLogo(request: Request, id: string, env: Env): Promise<Response> {
  const token = new URL(request.url).searchParams.get("k");
  if (token) {
    const agent = await briefAgent(env, id);
    const owner = await agent.ownerKeyForToken(token);
    if (!owner) return json({ error: "Nieprawidłowy link." }, 404);
    return logoResponse(await accountStub(env, owner).logo());
  }
  const session = await getSession(request, env);
  if (!session) return unauthorized();
  if (!(await session.account.agencyToken(id))) return json({ error: "Nie ma takiego briefu." }, 404);
  return logoResponse(await session.account.logo());
}

async function saveTemplate(request: Request, env: Env, session: Session): Promise<Response> {
  if (!sameOrigin(request)) return forbidden(request);
  const body = await smallJson<{ briefId?: unknown; title?: unknown; description?: unknown }>(request);
  if (!body || typeof body.briefId !== "string" || !BRIEF_ID.test(body.briefId) || (body.title !== undefined && typeof body.title !== "string") || (body.description !== undefined && typeof body.description !== "string")) return json({ error: "Nieprawidłowe dane szablonu." }, 400);
  if (!(await session.account.agencyToken(body.briefId))) return json({ error: "Nie ma takiego briefu na Twoim koncie." }, 404);
  const agent = await briefAgent(env, body.briefId);
  const snapshot = await agent.templateSnapshot(session.key);
  if (!snapshot) return json({ error: "Nie ma takiego briefu na Twoim koncie." }, 404);
  try {
    const summary = await session.account.saveTemplate({ title: body.title ?? snapshot.title, description: body.description, sections: snapshot.sections });
    return json(summary, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Nie udało się zapisać szablonu." }, 400);
  }
}

async function createBrief(request: Request, env: Env, session: Session): Promise<Response> {
  if (!sameOrigin(request)) return forbidden(request);
  const body = await smallJson<{ templateId?: unknown; title?: unknown; clientName?: unknown }>(request);
  if (!body || [body.templateId, body.title, body.clientName].some((value) => value !== undefined && typeof value !== "string")) return json({ error: "Nieprawidłowe dane." }, 400);
  const templateId = body.templateId ?? "www";
  if (typeof templateId !== "string") return json({ error: "Nieznany szablon." }, 400);
  const savedTemplate = TEMPLATE_ID.test(templateId) ? await session.account.template(templateId) : null;
  if (!savedTemplate && !TEMPLATE_LIST.some((t) => t.id === templateId)) return json({ error: "Nieznany szablon lub nie należy do Twojego konta." }, 400);

  const id = newBriefId();
  const slot = await session.account.reserveBrief(id);
  if (!slot.ok) return json({ error: "W darmowej wersji możesz mieć 3 aktywne briefy. Zakończ lub usuń jeden, aby utworzyć kolejny.", usage: slot.usage }, 429);
  let agent: Awaited<ReturnType<typeof briefAgent>> | undefined;
  try {
    agent = await briefAgent(env, id);
    const created = await agent.initBrief({
      templateId,
      title: String(body.title ?? "").trim().slice(0, 120),
      clientName: String(body.clientName ?? "").trim().slice(0, 120),
      owner: session.key,
      origin: new URL(request.url).origin,
      ...(savedTemplate ? { template: { title: savedTemplate.title, sections: savedTemplate.sections } } : {}),
    });
    if (!(await session.account.commitBrief(slot.reservation, { ...created.summary, agencyToken: created.agency, clientToken: created.client }))) throw new Error("Brief reservation expired");
    return json({ id }, 201);
  } catch {
    await session.account.cancelBriefReservation(id, slot.reservation).catch(() => undefined);
    await session.account.removeBrief(id).catch(() => undefined);
    // A failed initialization must leave neither a quota slot nor an orphan client-accessible DO.
    await agent?.destroyBrief().catch(() => undefined);
    return json({ error: "Nie udało się utworzyć briefu. Spróbuj ponownie." }, 503);
  }
}

async function deleteBrief(id: string, env: Env, session: Session): Promise<Response> {
  if (!(await session.account.agencyToken(id))) return json({ error: "Nie ma takiego briefu." }, 404);
  await session.account.removeBrief(id);
  const agent = await briefAgent(env, id);
  await agent.destroyBrief().catch(() => {
    /* Agent kończy izolat w trakcie usuwania, więc RPC może nie wrócić. */
  });
  return json({ ok: true });
}

/** Link klienta (?k=) albo zalogowana agencja, która ma ten brief na swojej liście. */
async function checkAccess(request: Request, id: string, env: Env): Promise<Response> {
  const token = new URL(request.url).searchParams.get("k");
  if (!token) {
    const session = await getSession(request, env);
    if (!session) return unauthorized();
    if (!(await session.account.agencyToken(id))) return json({ error: "Nie ma takiego briefu na Twojej liście." }, 404);
    const info: AccessInfo = { role: "agency", aiEnabled: Boolean(env.GEMINI_API_KEY) };
    const updatedAt = await session.account.logoUpdatedAt();
    if (updatedAt) info.logoUrl = `/api/briefs/${id}/logo?v=${updatedAt}`;
    return json(info);
  }
  const agent = await briefAgent(env, id);
  const role = await agent.roleForToken(token);
  if (!role) return json({ error: "Ten link jest nieprawidłowy albo brief nie istnieje." }, 404);
  const info: AccessInfo = { role, aiEnabled: role === "agency" && Boolean(env.GEMINI_API_KEY) };
  const owner = role === "client" ? await agent.ownerKeyForToken(token) : null;
  const updatedAt = owner ? await accountStub(env, owner).logoUpdatedAt() : null;
  if (updatedAt) info.logoUrl = `/api/briefs/${id}/logo?k=${encodeURIComponent(token)}&v=${updatedAt}`;
  return json(info);
}

/**
 * WebSocket do briefu. Link klienta niesie token w ?k=. Agencja łączy się bez tokenu: sprawdzamy sesję
 * i wstawiamy token agencji po stronie serwera, więc nigdy nie trafia on do przeglądarki.
 */
async function authorizeSocket(request: Request, name: string, env: Env): Promise<Request | Response | undefined> {
  if (!BRIEF_ID.test(name)) return new Response("Unauthorized", { status: 401 });
  const url = new URL(request.url);
  if (url.searchParams.get("k")) return undefined;

  // Ciasteczko leci też z cudzych stron: przy połączeniu na sesji wymagamy własnego originu.
  if (request.headers.get("origin") !== url.origin) return new Response("Forbidden", { status: 403 });
  const session = await getSession(request, env);
  const token = session && (await session.account.agencyToken(name));
  if (!token) return new Response("Unauthorized", { status: 401 });
  url.searchParams.set("k", token);
  return new Request(url, request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (pathname === "/api/templates" && method === "GET") return json(TEMPLATE_LIST);

    if (pathname === "/api/auth/start" && method === "POST") return startLogin(request, env);
    if (pathname === "/api/auth/verify" && method === "POST") return verifyLogin(request, env);
    if (pathname === "/api/auth/logout" && method === "POST") return logout(request, env);

    // Tylko lokalnie: wysyła przykład każdego maila do Mailpita (podgląd szablonów). W buildzie produkcyjnym znika.
    if (import.meta.env.DEV && pathname === "/api/dev/emails" && method === "POST") {
      const session = await getSession(request, env);
      if (!session) return unauthorized();
      const origin = url.origin;
      const mails = [
        loginCodeMail({ to: session.email, code: "482913", origin }),
        briefSentMail({
          to: session.email,
          origin,
          briefId: "PrzykladBrief",
          briefName: "Piekarnia Kowalski, Strona WWW",
          settled: 24,
          total: 30,
          open: 6,
        }),
        briefSentMail({
          to: session.email,
          origin,
          briefId: "PrzykladBrief",
          briefName: "Studio Fryzur Ola, Strona WWW",
          settled: 30,
          total: 30,
          open: 0,
        }),
      ];
      for (const mail of mails) await sendMail(env, mail);
      return json({ sent: mails.length, to: session.email });
    }

    if (pathname === "/api/me" && method === "GET") {
      const session = await getSession(request, env);
      if (!session) return unauthorized();
      const me: Me = { email: session.email, aiEnabled: Boolean(env.GEMINI_API_KEY), usage: await session.account.usage() };
      const updatedAt = await session.account.logoUpdatedAt();
      if (updatedAt) me.logoUrl = accountLogoUrl(updatedAt);
      return json(me);
    }

    if (pathname === "/api/account/usage" && method === "GET") {
      const session = await getSession(request, env);
      if (!session) return unauthorized();
      return json(await session.account.usage());
    }

    if (pathname === "/api/account/logo" && ["GET", "PUT", "DELETE"].includes(method)) {
      const session = await getSession(request, env);
      if (!session) return unauthorized();
      return accountLogo(request, session);
    }

    if (pathname === "/api/account/templates" && (method === "GET" || method === "POST")) {
      const session = await getSession(request, env);
      if (!session) return unauthorized();
      return method === "POST" ? saveTemplate(request, env, session) : json(await session.account.listTemplates());
    }

    const savedTemplate = pathname.match(/^\/api\/account\/templates\/([^/]+)$/);
    if (savedTemplate && method === "DELETE") {
      const session = await getSession(request, env);
      if (!session) return unauthorized();
      if (!sameOrigin(request)) return forbidden(request);
      if (!TEMPLATE_ID.test(savedTemplate[1]) || !(await session.account.removeTemplate(savedTemplate[1]))) return json({ error: "Nie ma takiego szablonu." }, 404);
      return json({ ok: true });
    }

    if (pathname === "/api/briefs" && (method === "GET" || method === "POST")) {
      const session = await getSession(request, env);
      if (!session) return unauthorized();
      if (method === "POST") return createBrief(request, env, session);
      const list: BriefSummary[] = await session.account.listBriefs();
      return json(list);
    }

    const one = pathname.match(/^\/api\/briefs\/([^/]+)$/);
    if (one && method === "DELETE") {
      if (!BRIEF_ID.test(one[1])) return json({ error: "Nie ma takiego briefu." }, 404);
      const session = await getSession(request, env);
      if (!session) return unauthorized();
      if (!sameOrigin(request)) return forbidden(request);
      return deleteBrief(one[1], env, session);
    }

    const logo = pathname.match(/^\/api\/briefs\/([^/]+)\/logo$/);
    if (logo && method === "GET") {
      if (!BRIEF_ID.test(logo[1])) return json({ error: "Nieprawidłowy link." }, 404);
      return briefLogo(request, logo[1], env);
    }

    const access = pathname.match(/^\/api\/briefs\/([^/]+)\/access$/);
    if (access && method === "GET") {
      if (!BRIEF_ID.test(access[1])) return json({ error: "Nieprawidłowy link." }, 404);
      return checkAccess(request, access[1], env);
    }

    const routed = await routeAgentRequest(request, env, {
      jurisdiction: JURISDICTION,
      onBeforeConnect: (req, route) => authorizeSocket(req, route.name, env),
      // Do Agenta rozmawiamy tylko przez WebSocket.
      onBeforeRequest: () => new Response("Not found", { status: 404 }),
    });
    return routed ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
