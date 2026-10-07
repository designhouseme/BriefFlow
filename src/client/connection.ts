import { useAgent } from "agents/react";
import type { BriefAgent } from "../server/brief-agent";
import type { Brief } from "../shared/types";

export function useBriefAgent(id: string, token: string) {
  return useAgent<BriefAgent, Brief | null>({ agent: "BriefAgent", name: id, query: { k: token } });
}

export type BriefConnection = ReturnType<typeof useBriefAgent>;
export type BriefStub = BriefConnection["stub"];

/** Wywołuje akcję i zamienia błąd na komunikat dla użytkownika. */
export type Run = <T>(action: () => Promise<T>) => Promise<T | undefined>;
