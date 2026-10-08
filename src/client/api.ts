import type { AccountUsage, BriefSummary, Me } from "../shared/account";
import type { AccessInfo } from "../shared/types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const REQUEST_TIMEOUT_MS = 20_000;
const CONNECTION_ERROR = "Nie można połączyć się z BriefFlow. Sprawdź połączenie i spróbuj ponownie.";
const TIMEOUT_ERROR = "Serwer nie odpowiedział na czas. Spróbuj ponownie.";

async function request<T>(url: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init?.signal?.aborted) abort();
  else init?.signal?.addEventListener("abort", abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { credentials: "same-origin", ...init, signal: controller.signal });
        const data = (await response.json().catch((error: unknown) => {
          // HTTP errors retain their status even when their body is absent or incomplete.
          if (response.ok && (!(error instanceof SyntaxError) || controller.signal.aborted)) throw error;
          return {};
        })) as Record<string, unknown>;
        if (!response.ok) {
          throw new ApiError((data as { error?: string }).error ?? "Coś poszło nie tak.", response.status, data);
        }
        return data as T;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          // Reject before aborting so the timeout message wins the fetch abort race.
          reject(new ApiError(TIMEOUT_ERROR, 0));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(CONNECTION_ERROR, 0);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    init?.signal?.removeEventListener("abort", abort);
  }
}

const post = <T>(url: string, body: unknown) =>
  request<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// --- Logowanie ---

export const startLogin = (email: string) => post<{ ok: true; devCode?: string }>("/api/auth/start", { email });
export const verifyLogin = async (email: string, code: string): Promise<{ email: string }> => {
  try {
    return await post<{ email: string }>("/api/auth/verify", { email, code });
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) {
      // The server may have redeemed the code and set the cookie before the response was lost.
      try {
        const me = await getMe();
        if (me.email === email.trim().toLowerCase()) return { email: me.email };
      } catch { /* Keep the original transport error if there is no confirmed matching session. */ }
    }
    throw error;
  }
};
export const logout = () => {
  primed = null;
  return post<{ ok: true }>("/api/auth/logout", {});
};
export const getMe = () => request<Me>("/api/me");
export const getAccountUsage = () => request<AccountUsage>("/api/account/usage");

export interface SavedTemplate {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export const listSavedTemplates = () => request<SavedTemplate[]>("/api/account/templates");
export const saveTemplate = (input: { briefId: string; title: string; description?: string }) =>
  post<SavedTemplate>("/api/account/templates", input);
export const deleteTemplate = (id: string) =>
  request<{ ok: true }>(`/api/account/templates/${encodeURIComponent(id)}`, { method: "DELETE" });

// Strona startowa zna już konto, zanim przejdzie do aplikacji: przejście pokazuje gotowy widok, nie ładowanie.
let primed: Me | null = null;
export const primeMe = (me: Me) => {
  primed = me;
};
// Bez czyszczenia: StrictMode woła inicjalizator stanu dwa razy. Wylogowanie zeruje wartość.
export const takePrimedMe = () => primed;

// --- Briefy agencji ---

export const listBriefs = () => request<BriefSummary[]>("/api/briefs");

export const createBrief = (input: { templateId: string; clientName: string; title: string }) =>
  post<{ id: string }>("/api/briefs", input);

export const createSmartBrief = (input: { source: string; clientName: string }) =>
  request<{ id: string }>("/api/smartbriefs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }, 75_000);

export const deleteBrief = (id: string) => request<{ ok: true }>(`/api/briefs/${encodeURIComponent(id)}`, { method: "DELETE" });

/** Bez tokenu: dostęp z sesji agencji. Z tokenem: link klienta. */
export const checkAccess = (id: string, token?: string) =>
  request<AccessInfo>(`/api/briefs/${encodeURIComponent(id)}/access${token ? `?k=${encodeURIComponent(token)}` : ""}`);

export const clientUrl = (id: string, token: string) => `${location.origin}/b/${id}?k=${token}`;
