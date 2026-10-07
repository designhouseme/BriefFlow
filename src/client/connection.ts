import { useAgent } from "agents/react";
import type { BriefAgent } from "../server/brief-agent";
import type { Brief } from "../shared/types";

/** Klient łączy się tokenem z linku. Agencja bez tokenu: Worker rozpoznaje ją po sesji. */
export function useBriefAgent(id: string, token?: string) {
  return useAgent<BriefAgent, Brief | null>({ agent: "BriefAgent", name: id, query: token ? { k: token } : undefined });
}

export type BriefConnection = ReturnType<typeof useBriefAgent>;
export type BriefStub = BriefConnection["stub"];

/** Wywołuje akcję i zamienia błąd na komunikat dla użytkownika. */
export type Run = <T>(action: () => Promise<T>) => Promise<T | undefined>;
