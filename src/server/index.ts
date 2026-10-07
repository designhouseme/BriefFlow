import { getAgentByName, routeAgentRequest } from "agents";
import { TEMPLATE_LIST } from "../shared/templates";
import type { AccessInfo } from "../shared/types";

export { BriefAgent } from "./brief-agent";

// Na produkcji dane briefów zostają w UE (RODO). Zmiana później wymaga migracji istniejących briefów.
// Lokalny workerd nie obsługuje jurysdykcji, więc w dev jej nie ustawiamy.
const JURISDICTION = import.meta.env.DEV ? undefined : ("eu" as const);

const BRIEF_ID = /^[A-Za-z0-9]{12}$/;

function newBriefId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => alphabet[b % 62]).join("");
}

const json = (data: unknown, status = 200) => Response.json(data, { status });

async function createBrief(request: Request, env: Env): Promise<Response> {
  let body: { templateId?: string; title?: string; clientName?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Nieprawidłowe dane." }, 400);
  }
  const templateId = body.templateId ?? "www";
  if (!TEMPLATE_LIST.some((t) => t.id === templateId)) return json({ error: "Nieznany szablon." }, 400);

  const id = newBriefId();
  const agent = await getAgentByName(env.BriefAgent, id, { jurisdiction: JURISDICTION });
  const tokens = await agent.initBrief({
    templateId,
    title: String(body.title ?? "").trim().slice(0, 120),
    clientName: String(body.clientName ?? "").trim().slice(0, 120),
  });
  return json({ id, agencyToken: tokens.agency, clientToken: tokens.client }, 201);
}

async function checkAccess(id: string, token: string | null, env: Env): Promise<Response> {
  if (!token) return json({ error: "Brak tokenu w linku." }, 401);
  const agent = await getAgentByName(env.BriefAgent, id, { jurisdiction: JURISDICTION });
  const role = await agent.roleForToken(token);
  if (!role) return json({ error: "Ten link jest nieprawidłowy albo brief nie istnieje." }, 404);
  const info: AccessInfo = { role, aiEnabled: role === "agency" && Boolean(env.GEMINI_API_KEY) };
  return json(info);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/templates" && request.method === "GET") return json(TEMPLATE_LIST);
    if (url.pathname === "/api/briefs" && request.method === "POST") return createBrief(request, env);

    const access = url.pathname.match(/^\/api\/briefs\/([^/]+)\/access$/);
    if (access && request.method === "GET") {
      if (!BRIEF_ID.test(access[1])) return json({ error: "Nieprawidłowy link." }, 404);
      return checkAccess(access[1], url.searchParams.get("k"), env);
    }

    const routed = await routeAgentRequest(request, env, {
      jurisdiction: JURISDICTION,
      // Token sprawdza sam Agent (zna tokeny briefu); tu odcinamy tylko śmieci.
      onBeforeConnect: (req, route) => {
        if (!BRIEF_ID.test(route.name) || !new URL(req.url).searchParams.get("k")) {
          return new Response("Unauthorized", { status: 401 });
        }
      },
      // Do Agenta rozmawiamy tylko przez WebSocket.
      onBeforeRequest: () => new Response("Not found", { status: 404 }),
    });
    return routed ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
