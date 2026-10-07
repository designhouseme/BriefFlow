import { Agent, type Connection, type ConnectionContext, callable, getCurrentAgent } from "agents";
import {
  OpError,
  addField,
  addSection,
  describeAnswer,
  findField,
  moveField,
  normalizeAnswer,
  nudgeField,
  progress,
  removeField,
  removeSection,
  updateField,
  updateSection,
} from "../shared/ops";
import { openQuestions } from "../shared/flow";
import { briefFromTemplate } from "../shared/templates";
import type { Actor, AiResult, AnswerInput, Brief, FieldInput, LogEntry, Role } from "../shared/types";
import type { BriefSummary } from "../shared/account";
import { accountStub } from "./accounts";
import { runCommand } from "./ai";

type ConnState = { role: Role };

/** Token w linku: 24 znaki base62. */
function randomToken(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => alphabet[b % 62]).join("");
}

function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Wiersz na liście briefów agencji (bez tokenów). */
function summaryOf(brief: Brief): Omit<BriefSummary, "clientToken"> {
  const p = progress(brief);
  return {
    id: brief.id,
    title: brief.title,
    clientName: brief.clientName,
    templateId: brief.templateId,
    createdAt: brief.createdAt,
    updatedAt: brief.updatedAt,
    settled: p.answered + p.unknown,
    total: p.total,
    completedAt: brief.completedAt,
  };
}

/**
 * Jeden brief = jedna instancja Agenta (Durable Object z SQLite).
 * Stan (brief) jest synchronizowany do wszystkich połączonych przeglądarek.
 * Tokeny dostępu leżą w SQL, nigdy w stanie, bo stan widzi też klient.
 */
export class BriefAgent extends Agent<Env, Brief | null> {
  initialState: Brief | null = null;

  onStart() {
    this.ensureTables();
  }

  private ensureTables() {
    this.sql`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, label TEXT NOT NULL, before TEXT NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, text TEXT NOT NULL)`;
  }

  // --- Dostęp (wywoływane przez Worker przez RPC Durable Object, nie przez przeglądarkę) ---

  async initBrief(input: { templateId: string; title: string; clientName: string; owner: string }) {
    this.ensureTables();
    if (this.state) throw new Error("Brief już istnieje.");
    const tokens = { agency: randomToken(), client: randomToken() };
    this.sql`INSERT INTO meta (key, value) VALUES ('agency_token', ${tokens.agency}), ('client_token', ${tokens.client}), ('owner', ${input.owner})`;
    this.setState(briefFromTemplate(input.templateId, { id: this.name, title: input.title, clientName: input.clientName }));
    this.logEvent("agency", `Utworzono brief „${this.state!.title}”.`);
    return { ...tokens, summary: summaryOf(this.state!) };
  }

  /** Usunięcie briefu z konta agencji: kasuje wszystkie dane tej instancji. */
  async destroyBrief() {
    await this.destroy();
  }

  // Lista briefów na koncie agencji pokazuje tytuł i postęp, więc każda zmiana stanu idzie też tam.
  onStateChanged(state: Brief | null | undefined) {
    if (!state) return;
    const [owner] = this.sql<{ value: string }>`SELECT value FROM meta WHERE key = 'owner'`;
    if (!owner) return;
    const { createdAt: _c, templateId: _t, ...patch } = summaryOf(state);
    this.ctx.waitUntil(
      accountStub(this.env, owner.value)
        .touchBrief(this.name, patch)
        .catch((error: unknown) => console.error("Nie udało się odświeżyć listy briefów", error)),
    );
  }

  roleForToken(token: string | null): Role | null {
    if (!token || !this.state) return null;
    this.ensureTables();
    const rows = this.sql<{ key: string; value: string }>`SELECT key, value FROM meta WHERE key IN ('agency_token', 'client_token')`;
    for (const row of rows) {
      if (sameToken(row.value, token)) return row.key === "agency_token" ? "agency" : "client";
    }
    return null;
  }

  private roleFromRequest(request: Request): Role | null {
    return this.roleForToken(new URL(request.url).searchParams.get("k"));
  }

  // Stan jest wysyłany do połączenia przed onConnect, dlatego bramka jest tutaj.
  shouldSendProtocolMessages(_connection: Connection, ctx: ConnectionContext): boolean {
    return this.roleFromRequest(ctx.request) !== null;
  }

  onConnect(connection: Connection<ConnState>, ctx: ConnectionContext) {
    const role = this.roleFromRequest(ctx.request);
    if (!role) {
      connection.close(4001, "Nieprawidłowy link");
      return;
    }
    connection.setState({ role });
  }

  // Przeglądarka nie może nadpisać stanu: zmiany idą tylko przez @callable z kontrolą roli.
  validateStateChange(_next: Brief | null, source: Connection | "server") {
    if (source !== "server") throw new Error("Zmiany tylko przez akcje.");
  }

  private requireRole(...allowed: Role[]): Role {
    const { connection } = getCurrentAgent<BriefAgent>();
    const role = (connection?.state as ConnState | null | undefined)?.role;
    if (!role || !allowed.includes(role)) throw new Error("Brak uprawnień.");
    if (!this.state) throw new Error("Brief nie istnieje.");
    return role;
  }

  // --- Dziennik i cofanie ---

  private logEvent(actor: Actor, text: string) {
    this.sql`INSERT INTO events (at, actor, text) VALUES (${Date.now()}, ${actor}, ${text})`;
  }

  /** Zmiana struktury: zapis „przed” do historii (cofanie) + wpis w dzienniku. */
  private commitStructure(actor: Actor, label: string, next: Brief) {
    const before = JSON.stringify(this.state!.sections);
    this.sql`INSERT INTO history (at, actor, label, before) VALUES (${Date.now()}, ${actor}, ${label}, ${before})`;
    this.logEvent(actor, label);
    this.setState({ ...next, updatedAt: Date.now(), canUndo: true });
  }

  private mutate(label: (brief: Brief) => string, fn: (brief: Brief) => void) {
    this.requireRole("agency");
    const next = structuredClone(this.state!);
    try {
      fn(next);
    } catch (error) {
      if (error instanceof OpError) throw new Error(error.message);
      throw error;
    }
    this.commitStructure("agency", label(next), next);
  }

  @callable()
  undo() {
    this.requireRole("agency");
    const [last] = this.sql<{ id: number; label: string; before: string }>`SELECT id, label, before FROM history ORDER BY id DESC LIMIT 1`;
    if (!last) return;
    this.sql`DELETE FROM history WHERE id = ${last.id}`;
    const [{ remaining }] = this.sql<{ remaining: number }>`SELECT COUNT(*) AS remaining FROM history`;
    this.logEvent("agency", `Cofnięto: ${last.label}`);
    // Odpowiedzi zostają, więc przywrócone pole odzyskuje swoją odpowiedź.
    this.setState({ ...this.state!, sections: JSON.parse(last.before), updatedAt: Date.now(), canUndo: remaining > 0 });
  }

  @callable()
  getLog(): LogEntry[] {
    this.requireRole("agency");
    return this.sql<LogEntry>`SELECT at, actor, text FROM events ORDER BY id DESC LIMIT 100`;
  }

  @callable()
  getClientToken(): string {
    this.requireRole("agency");
    const [row] = this.sql<{ value: string }>`SELECT value FROM meta WHERE key = 'client_token'`;
    return row.value;
  }

  // --- Odpowiedzi (agencja i klient) ---

  @callable()
  setAnswer(fieldId: string, input: AnswerInput) {
    const role = this.requireRole("agency", "client");
    const brief = this.state!;
    let field;
    try {
      field = findField(brief, fieldId).field;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Nie ma takiego pola.");
    }
    let normalized;
    try {
      normalized = normalizeAnswer(field, input);
    } catch (error) {
      if (error instanceof OpError) throw new Error(error.message);
      throw error;
    }
    const answer = { ...normalized, by: role, at: Date.now() };
    this.logEvent(role, `„${field.label}” → ${describeAnswer(field, answer)}`);
    this.setState({ ...brief, answers: { ...brief.answers, [fieldId]: answer }, updatedAt: Date.now() });
  }

  @callable()
  clearAnswer(fieldId: string) {
    const role = this.requireRole("agency", "client");
    const brief = this.state!;
    if (!brief.answers[fieldId]) return;
    const { [fieldId]: _removed, ...answers } = brief.answers;
    const label = brief.sections.flatMap((s) => s.fields).find((f) => f.id === fieldId)?.label ?? fieldId;
    this.logEvent(role, `„${label}” → wyczyszczono odpowiedź`);
    this.setState({ ...brief, answers, updatedAt: Date.now() });
  }

  /** Klient zamyka brief na podsumowaniu. Otwarte pytania zostają do uzupełnienia tym samym linkiem. */
  @callable()
  complete() {
    const role = this.requireRole("agency", "client");
    const open = openQuestions(this.state!).length;
    this.logEvent(role, open ? `Zakończono brief, ${open} pytań do uzupełnienia` : "Zakończono brief, wszystko uzupełnione");
    this.setState({ ...this.state!, completedAt: Date.now(), updatedAt: Date.now() });
  }

  // --- Struktura (tylko agencja) ---

  @callable()
  updateMeta(input: { title: string; clientName: string }) {
    this.requireRole("agency");
    const title = input.title.trim().slice(0, 120) || this.state!.title;
    const clientName = input.clientName.trim().slice(0, 120);
    this.logEvent("agency", `Zmieniono nagłówek briefu: „${title}”${clientName ? ` · ${clientName}` : ""}`);
    this.setState({ ...this.state!, title, clientName, updatedAt: Date.now() });
  }

  @callable()
  addSection(title: string, afterSectionId: string | null) {
    this.mutate(() => `Dodano sekcję „${title}”`, (b) => {
      addSection(b, { title, afterSectionId });
    });
  }

  @callable()
  updateSection(sectionId: string, input: { title: string; description?: string }) {
    this.mutate(() => `Zmieniono sekcję „${input.title}”`, (b) => {
      updateSection(b, sectionId, input);
    });
  }

  @callable()
  removeSection(sectionId: string) {
    const title = this.state?.sections.find((s) => s.id === sectionId)?.title ?? sectionId;
    this.mutate(() => `Usunięto sekcję „${title}”`, (b) => {
      removeSection(b, sectionId);
    });
  }

  /** afterFieldId: id pola, "__start" = na początek, null = na koniec sekcji. Zwraca id nowego pola. */
  @callable()
  addField(sectionId: string, afterFieldId: string | null, input: FieldInput): string {
    let id = "";
    this.mutate(() => `Dodano pole „${input.label}”`, (b) => {
      id = addField(b, sectionId, afterFieldId, input, { origin: "agency" }).id;
    });
    return id;
  }

  @callable()
  updateField(fieldId: string, input: FieldInput) {
    this.mutate(() => `Zmieniono pole „${input.label}”`, (b) => {
      updateField(b, fieldId, input, { origin: "agency", reason: undefined });
    });
  }

  @callable()
  removeField(fieldId: string) {
    const label = this.state?.sections.flatMap((s) => s.fields).find((f) => f.id === fieldId)?.label ?? fieldId;
    this.mutate(() => `Usunięto pole „${label}”`, (b) => {
      removeField(b, fieldId);
    });
  }

  @callable()
  nudgeField(fieldId: string, direction: "up" | "down") {
    this.mutate((b) => `Przesunięto pole „${findField(b, fieldId).field.label}”`, (b) => {
      nudgeField(b, fieldId, direction);
    });
  }

  @callable()
  moveField(fieldId: string, targetSectionId: string, afterFieldId: string | null) {
    this.mutate((b) => `Przeniesiono pole „${findField(b, fieldId).field.label}”`, (b) => {
      moveField(b, fieldId, targetSectionId, afterFieldId);
    });
  }

  // --- AI ---

  @callable()
  async runAiCommand(command: string): Promise<AiResult> {
    this.requireRole("agency");
    const text = command.trim().slice(0, 1000);
    if (!text) return { ok: false, summary: "Wpisz polecenie.", changes: [] };
    if (!this.env.GEMINI_API_KEY) return { ok: false, summary: "AI jest wyłączone: brak klucza API.", changes: [] };

    const outcome = await runCommand(this.env.GEMINI_API_KEY, this.state!, text);
    if (outcome.ok && outcome.changes.length > 0) {
      // Brief mógł się zmienić w trakcie (np. klient odpowiadał), więc bierzemy świeże odpowiedzi, strukturę od AI.
      this.commitStructure("ai", `Polecenie AI: „${text}”`, { ...this.state!, sections: outcome.brief.sections });
      for (const change of outcome.changes) this.logEvent("ai", change);
    }
    return { ok: outcome.ok, summary: outcome.summary, changes: outcome.changes };
  }
}
