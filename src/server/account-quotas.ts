import type { AccountUsage } from "../shared/account";

export const FREE_BRIEF_LIMIT = 3;
export const FREE_AI_LIMIT = 10;
export const AI_EXECUTION_MS = 60_000;
const RESERVATION_MS = 3 * 60_000;
const ZONE = "Europe/Warsaw";

export function calendarMonth(now: number): { key: string; resetsAt: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")!.value);
  const month = Number(parts.find((part) => part.type === "month")!.value);
  const utc = Date.UTC(year, month, 1);
  const next = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(utc);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(next.find((part) => part.type === type)!.value);
  const localAsUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  return { key: `${year}-${String(month).padStart(2, "0")}`, resetsAt: utc - (localAsUtc - utc) };
}

export type QuotaReservation = { ok: true; reservation: string; usage: AccountUsage } | { ok: false; usage: AccountUsage };

/** Every method is synchronous: a single account DO serializes checks and reservations across all briefs. */
export class AccountQuotas {
  private sql: Pick<SqlStorage, "exec">;
  private now: () => number;
  private newId: () => string;

  constructor(sql: Pick<SqlStorage, "exec">, now = Date.now, newId = () => crypto.randomUUID()) {
    this.sql = sql;
    this.now = now;
    this.newId = newId;
    sql.exec(`CREATE TABLE IF NOT EXISTS brief_reservations (brief_id TEXT PRIMARY KEY, reservation TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS ai_usage (id TEXT PRIMARY KEY, brief_id TEXT NOT NULL, month TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('reserved', 'used')), expires_at INTEGER NOT NULL)`);
  }

  private clearExpired(now: number) {
    this.sql.exec(`DELETE FROM brief_reservations WHERE expires_at <= ?`, now);
    this.sql.exec(`DELETE FROM ai_usage WHERE status = 'reserved' AND expires_at <= ?`, now);
  }

  usage(): AccountUsage {
    const now = this.now();
    this.clearExpired(now);
    const month = calendarMonth(now);
    const [{ used: briefs }] = this.sql.exec<{ used: number }>(`SELECT (SELECT COUNT(*) FROM briefs WHERE completed_at IS NULL) + (SELECT COUNT(*) FROM brief_reservations) AS used`).toArray();
    const [{ used: ai }] = this.sql.exec<{ used: number }>(`SELECT COUNT(*) AS used FROM ai_usage WHERE month = ?`, month.key).toArray();
    return { briefs: { used: briefs, limit: FREE_BRIEF_LIMIT }, ai: { used: ai, limit: FREE_AI_LIMIT, resetsAt: month.resetsAt } };
  }

  reserveBrief(briefId: string): QuotaReservation {
    const usage = this.usage();
    if (usage.briefs.used >= FREE_BRIEF_LIMIT) return { ok: false, usage };
    if (this.sql.exec<{ id: string }>(`SELECT id FROM briefs WHERE id = ?`, briefId).toArray().length || this.sql.exec<{ brief_id: string }>(`SELECT brief_id FROM brief_reservations WHERE brief_id = ?`, briefId).toArray().length) return { ok: false, usage };
    const reservation = this.newId();
    this.sql.exec(`INSERT INTO brief_reservations (brief_id, reservation, expires_at) VALUES (?, ?, ?)`, briefId, reservation, this.now() + RESERVATION_MS);
    return { ok: true, reservation, usage: this.usage() };
  }

  commitBrief(briefId: string, reservation: string, insert: () => void): boolean {
    this.clearExpired(this.now());
    const [row] = this.sql.exec<{ reservation: string }>(`SELECT reservation FROM brief_reservations WHERE brief_id = ?`, briefId).toArray();
    if (row?.reservation !== reservation) return false;
    insert();
    this.cancelBrief(briefId, reservation);
    return true;
  }

  cancelBrief(briefId: string, reservation: string) {
    this.sql.exec(`DELETE FROM brief_reservations WHERE brief_id = ? AND reservation = ?`, briefId, reservation);
  }

  reserveAi(briefId: string): QuotaReservation {
    const usage = this.usage();
    const [brief] = this.sql.exec<{ id: string }>(`SELECT id FROM briefs WHERE id = ?`, briefId).toArray();
    if (!brief || usage.ai.used >= FREE_AI_LIMIT) return { ok: false, usage };
    const reservation = this.newId();
    this.sql.exec(`INSERT INTO ai_usage (id, brief_id, month, status, expires_at) VALUES (?, ?, ?, 'reserved', ?)`, reservation, briefId, calendarMonth(this.now()).key, this.now() + RESERVATION_MS);
    return { ok: true, reservation, usage: this.usage() };
  }

  commitAi(reservation: string): boolean {
    this.clearExpired(this.now());
    const [row] = this.sql.exec<{ id: string }>(`SELECT id FROM ai_usage WHERE id = ?`, reservation).toArray();
    if (!row) return false;
    this.sql.exec(`UPDATE ai_usage SET status = 'used' WHERE id = ?`, reservation);
    return true;
  }

  /** Also permits rolling back a just-committed unit when an edit raced the account RPC. */
  cancelAi(reservation: string) {
    this.sql.exec(`DELETE FROM ai_usage WHERE id = ?`, reservation);
  }
}

/** Abort the SDK and reject even if a provider fails to honour the cancellation signal. */
export async function boundedAiCommand<T>(start: (signal: AbortSignal) => Promise<T>, timeoutMs = AI_EXECUTION_MS): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      start(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("AI_TIMEOUT")); }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
