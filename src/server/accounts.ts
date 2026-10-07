import { DurableObject } from "cloudflare:workers";
import type { BriefSummary } from "../shared/account";

// Na produkcji dane zostają w UE (RODO): briefy i konta. Lokalny workerd nie obsługuje jurysdykcji.
export const JURISDICTION = import.meta.env.DEV ? undefined : ("eu" as const);

const CODE_TTL = 10 * 60_000;
const CODE_ATTEMPTS = 5;
const RESEND_AFTER = 30_000;
const CODES_PER_HOUR = 5;
export const SESSION_TTL = 30 * 24 * 3600_000;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function randomString(length: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => ALPHABET[b % 62]).join("");
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Nazwa instancji konta: skrót adresu, żeby adres nie trafiał do identyfikatorów i logów. */
export const accountKey = async (email: string) => (await sha256(`account:${email}`)).slice(0, 40);

export function accountStub(env: Env, key: string) {
  const namespace = JURISDICTION ? env.Accounts.jurisdiction(JURISDICTION) : env.Accounts;
  return namespace.get(namespace.idFromName(key));
}

export type CodeRequest = { ok: true; code: string } | { ok: false; retryAfter: number };
export type CodeCheck = { ok: true; session: string } | { ok: false; error: string };

type BriefRow = {
  id: string;
  title: string;
  client_name: string;
  template_id: string;
  agency_token: string;
  client_token: string;
  created_at: number;
  updated_at: number;
  settled: number;
  total: number;
  completed_at: number | null;
};

/**
 * Jedno konto agencji = jedna instancja (Durable Object z SQLite), nazwana skrótem adresu e-mail.
 * Trzyma kod logowania, sesje i listę briefów tej osoby. Woła ją tylko Worker i BriefAgent, nigdy przeglądarka.
 */
export class AccountStore extends DurableObject<Env> {
  private sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS profile (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS codes (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS briefs (id TEXT PRIMARY KEY, title TEXT NOT NULL, client_name TEXT NOT NULL, template_id TEXT NOT NULL, agency_token TEXT NOT NULL, client_token TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, settled INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, completed_at INTEGER)`,
    );
  }

  private email(): string | null {
    const [row] = this.sql.exec<{ value: string }>(`SELECT value FROM profile WHERE key = 'email'`).toArray();
    return row?.value ?? null;
  }

  // --- Logowanie kodem ---

  async requestCode(email: string): Promise<CodeRequest> {
    const now = Date.now();
    const recent = this.sql
      .exec<{ created_at: number }>(`SELECT created_at FROM codes WHERE created_at > ? ORDER BY id DESC`, now - 3600_000)
      .toArray();
    if (recent[0] && now - recent[0].created_at < RESEND_AFTER) {
      return { ok: false, retryAfter: Math.ceil((RESEND_AFTER - (now - recent[0].created_at)) / 1000) };
    }
    if (recent.length >= CODES_PER_HOUR) {
      return { ok: false, retryAfter: Math.ceil((recent[recent.length - 1].created_at + 3600_000 - now) / 1000) };
    }

    this.sql.exec(`INSERT OR REPLACE INTO profile (key, value) VALUES ('email', ?)`, email);
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    // Nowy kod unieważnia poprzednie: ważny jest zawsze ostatni z maila.
    this.sql.exec(`UPDATE codes SET used = 1 WHERE used = 0`);
    this.sql.exec(
      `INSERT INTO codes (hash, created_at, expires_at) VALUES (?, ?, ?)`,
      await sha256(`${email}:${code}`),
      now,
      now + CODE_TTL,
    );
    this.sql.exec(`DELETE FROM codes WHERE created_at < ?`, now - 24 * 3600_000);
    return { ok: true, code };
  }

  async verifyCode(code: string): Promise<CodeCheck> {
    const email = this.email();
    const [row] = this.sql
      .exec<{ id: number; hash: string; expires_at: number; attempts: number }>(
        `SELECT id, hash, expires_at, attempts FROM codes WHERE used = 0 ORDER BY id DESC LIMIT 1`,
      )
      .toArray();
    if (!email || !row) return { ok: false, error: "Poproś o nowy kod." };
    if (row.expires_at < Date.now()) return { ok: false, error: "Kod wygasł. Wyślij nowy." };
    if (row.attempts >= CODE_ATTEMPTS) return { ok: false, error: "Za dużo prób. Wyślij nowy kod." };

    if (!sameString(row.hash, await sha256(`${email}:${code}`))) {
      this.sql.exec(`UPDATE codes SET attempts = attempts + 1 WHERE id = ?`, row.id);
      const left = CODE_ATTEMPTS - row.attempts - 1;
      return { ok: false, error: left > 0 ? "To nie ten kod. Sprawdź ostatni mail." : "Za dużo prób. Wyślij nowy kod." };
    }

    this.sql.exec(`UPDATE codes SET used = 1 WHERE id = ?`, row.id);
    const session = randomString(32);
    const now = Date.now();
    this.sql.exec(`INSERT INTO sessions (hash, created_at, expires_at) VALUES (?, ?, ?)`, await sha256(session), now, now + SESSION_TTL);
    this.sql.exec(`DELETE FROM sessions WHERE expires_at < ?`, now);
    return { ok: true, session };
  }

  /** Adres właściciela, gdy sesja jest ważna. */
  async sessionEmail(session: string): Promise<string | null> {
    const hash = await sha256(session);
    const [row] = this.sql
      .exec<{ expires_at: number }>(`SELECT expires_at FROM sessions WHERE hash = ?`, hash)
      .toArray();
    if (!row || row.expires_at < Date.now()) return null;
    return this.email();
  }

  async endSession(session: string) {
    this.sql.exec(`DELETE FROM sessions WHERE hash = ?`, await sha256(session));
  }

  // --- Briefy tej osoby ---

  listBriefs(): BriefSummary[] {
    return this.sql
      .exec<BriefRow>(`SELECT * FROM briefs ORDER BY updated_at DESC`)
      .toArray()
      .map((row) => ({
        id: row.id,
        title: row.title,
        clientName: row.client_name,
        templateId: row.template_id,
        clientToken: row.client_token,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        settled: row.settled,
        total: row.total,
        completedAt: row.completed_at ?? undefined,
      }));
  }

  addBrief(brief: BriefSummary & { agencyToken: string }) {
    this.sql.exec(
      `INSERT OR REPLACE INTO briefs (id, title, client_name, template_id, agency_token, client_token, created_at, updated_at, settled, total, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      brief.id,
      brief.title,
      brief.clientName,
      brief.templateId,
      brief.agencyToken,
      brief.clientToken,
      brief.createdAt,
      brief.updatedAt,
      brief.settled,
      brief.total,
      brief.completedAt ?? null,
    );
  }

  /** Brief zmienił się (tytuł, odpowiedź, wysyłka): odświeżamy wiersz na liście. Nieznane id pomijamy. */
  touchBrief(id: string, patch: Pick<BriefSummary, "title" | "clientName" | "updatedAt" | "settled" | "total" | "completedAt">) {
    this.sql.exec(
      `UPDATE briefs SET title = ?, client_name = ?, updated_at = ?, settled = ?, total = ?, completed_at = ? WHERE id = ?`,
      patch.title,
      patch.clientName,
      patch.updatedAt,
      patch.settled,
      patch.total,
      patch.completedAt ?? null,
      id,
    );
  }

  agencyToken(id: string): string | null {
    const [row] = this.sql.exec<{ agency_token: string }>(`SELECT agency_token FROM briefs WHERE id = ?`, id).toArray();
    return row?.agency_token ?? null;
  }

  removeBrief(id: string) {
    this.sql.exec(`DELETE FROM briefs WHERE id = ?`, id);
  }
}
