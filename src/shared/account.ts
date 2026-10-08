// Konto agencji: lista briefów w panelu bocznym i dane sesji. Klient (link klienta) konta nie ma.
import type { Section } from "./types";

/** Wiersz na liście briefów. Tytuł i postęp odświeża sam brief przy każdej zmianie. */
export interface BriefSummary {
  id: string;
  title: string;
  clientName: string;
  templateId: string;
  clientToken: string;
  createdAt: number;
  updatedAt: number;
  /** Pytania z odpowiedzią albo „Nie wiem”. */
  settled: number;
  total: number;
  completedAt?: number;
}

export interface Me {
  email: string;
  aiEnabled: boolean;
  logoUrl?: string;
  usage: AccountUsage;
}

export interface AccountUsage {
  /** Łączny limit udanych ingestów; usunięcie briefu nie zwraca jednostki. */
  smartBriefs: { used: number; limit: number };
  /** Zakończone briefy pozostają w historii. Rezerwacja tworzenia zajmuje miejsce. */
  briefs: { used: number; limit: number };
  /** Zajęte jednostki, w tym trwające polecenia; błędy zwalniają rezerwację. */
  ai: { used: number; limit: number; resetsAt: number };
}

/** Lista prywatnych szablonów konta, bez odpowiedzi i danych klienta. */
export interface AccountTemplateSummary {
  id: string;
  title: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AccountTemplate extends AccountTemplateSummary {
  sections: Section[];
}
