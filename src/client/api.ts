import type { BriefSummary, Me } from "../shared/account";
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

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError((data as { error?: string }).error ?? "Coś poszło nie tak.", response.status, data);
  }
  return data as T;
}

const post = <T>(url: string, body: unknown) =>
  request<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// --- Logowanie ---

export const startLogin = (email: string) => post<{ ok: true; devCode?: string }>("/api/auth/start", { email });
export const verifyLogin = (email: string, code: string) => post<{ email: string }>("/api/auth/verify", { email, code });
export const logout = () => {
  primed = null;
  return post<{ ok: true }>("/api/auth/logout", {});
};
export const getMe = () => request<Me>("/api/me");

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

export const deleteBrief = (id: string) => request<{ ok: true }>(`/api/briefs/${encodeURIComponent(id)}`, { method: "DELETE" });

/** Bez tokenu: dostęp z sesji agencji. Z tokenem: link klienta. */
export const checkAccess = (id: string, token?: string) =>
  request<AccessInfo>(`/api/briefs/${encodeURIComponent(id)}/access${token ? `?k=${encodeURIComponent(token)}` : ""}`);

export const clientUrl = (id: string, token: string) => `${location.origin}/b/${id}?k=${token}`;
