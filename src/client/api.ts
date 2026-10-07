import type { TemplateInfo } from "../shared/templates";
import type { AccessInfo } from "../shared/types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error ?? "Coś poszło nie tak.");
  return data as T;
}

export const getTemplates = () => request<TemplateInfo[]>("/api/templates");

export const createBrief = (input: { templateId: string; clientName: string; title: string }) =>
  request<{ id: string; agencyToken: string; clientToken: string }>("/api/briefs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

export const checkAccess = (id: string, token: string) =>
  request<AccessInfo>(`/api/briefs/${encodeURIComponent(id)}/access?k=${encodeURIComponent(token)}`);

export const briefUrl = (id: string, token: string) => `${location.origin}/b/${id}?k=${token}`;
