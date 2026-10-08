import { ApiError } from "./api";

async function logoRequest<T>(init: RequestInit): Promise<T> {
  const response = await fetch("/api/account/logo", { credentials: "same-origin", ...init });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(typeof data.error === "string" ? data.error : "Nie udało się zapisać logo. Spróbuj ponownie.", response.status, data);
  }
  return data as T;
}

export const uploadAccountLogo = (file: File) =>
  logoRequest<{ logoUrl: string }>({ method: "PUT", headers: { "content-type": file.type }, body: file });

export const removeAccountLogo = () => logoRequest<{ ok: true }>({ method: "DELETE" });
