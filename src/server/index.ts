import { getAgentByName, routeAgentRequest } from "agents";
import type { BriefSummary, Me } from "../shared/account";
import { TEMPLATE_LIST } from "../shared/templates";
import type { AccessInfo } from "../shared/types";
import { JURISDICTION } from "./accounts";
import { getSession, logout, readJson, type Session, startLogin, verifyLogin } from "./auth";

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

async function createBrief(request: Request, env: Env, session: Session): Promise<Response> {
  const body = await readJson<{ templateId?: string; title?: string; clientName?: string }>(request);
  if (!body) return json({ error: "Nieprawidłowe dane." }, 400);
  const templateId = body.templateId ?? "www";
  if (!TEMPLATE_LIST.some((t) => t.id === templateId)) return json({ error: "Nieznany szablon." }, 400);

  const id = newBriefId();
  const agent = await briefAgent(env, id);
  const created = await agent.initBrief({
    templateId,
    title: String(body.title ?? "").trim().slice(0, 120),
    clientName: String(body.clientName ?? "").trim().slice(0, 120),
    owner: session.key,
  });
  await session.account.addBrief({ ...created.summary, agencyToken: created.agency, clientToken: created.client });
  return json({ id }, 201);
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
    return json(info);
  }
  const agent = await briefAgent(env, id);
  const role = await agent.roleForToken(token);
  if (!role) return json({ error: "Ten link jest nieprawidłowy albo brief nie istnieje." }, 404);
  const info: AccessInfo = { role, aiEnabled: role === "agency" && Boolean(env.GEMINI_API_KEY) };
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

    if (pathname === "/api/me" && method === "GET") {
      const session = await getSession(request, env);
      if (!session) return unauthorized();
      const me: Me = { email: session.email, aiEnabled: Boolean(env.GEMINI_API_KEY) };
      return json(me);
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
      return deleteBrief(one[1], env, session);
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
