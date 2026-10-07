// Konto agencji: lista briefów w panelu bocznym i dane sesji. Klient (link klienta) konta nie ma.

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
}
