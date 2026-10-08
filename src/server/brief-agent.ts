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
import type { Actor, AiResult, AnswerInput, Brief, FieldInput, LogEntry, Role, Section } from "../shared/types";
import type { BriefSummary } from "../shared/account";
import { accountStub } from "./accounts";
import { briefSentMail, sendMail } from "./emails";
import { runCommand } from "./ai";
import { freshTemplateSections } from "./account-resources";
import { boundedAiCommand } from "./account-quotas";

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
  private aiRunning = false;

  onStart() {
    this.ensureTables();
  }

  private ensureTables() {
    this.sql`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, label TEXT NOT NULL, before TEXT NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, text TEXT NOT NULL)`;
  }

  // --- Dostęp (wywoływane przez Worker przez RPC Durable Object, nie przez przeglądarkę) ---

  async initBrief(input: { templateId: string; title: string; clientName: string; owner: string; origin: string; template?: { title: string; sections: Section[] } }) {
    this.ensureTables();
    if (this.state) throw new Error("Brief już istnieje.");
    const tokens = { agency: randomToken(), client: randomToken() };
    // origin: adres aplikacji, z którego utworzono brief; trafia do linków w mailach.
    this.sql`INSERT INTO meta (key, value) VALUES ('agency_token', ${tokens.agency}), ('client_token', ${tokens.client}), ('owner', ${input.owner}), ('origin', ${input.origin})`;
    if (input.template) {
      const now = Date.now();
      this.setState({
        id: this.name,
        title: input.title || input.template.title,
        clientName: input.clientName,
        templateId: input.templateId,
        createdAt: now,
        updatedAt: now,
        sections: freshTemplateSections(input.template.sections),
        answers: {},
        canUndo: false,
      });
    } else {
      this.setState(briefFromTemplate(input.templateId, { id: this.name, title: input.title, clientName: input.clientName }));
    }
    this.logEvent("agency", `Utworzono brief „${this.state!.title}”.`);
    return { ...tokens, summary: summaryOf(this.state!) };
  }

  /** Worker-only RPC: source is the current authoritative brief, never browser-supplied structure. */
  templateSnapshot(owner: string): { title: string; sections: Section[] } | null {
    this.ensureTables();
    const [row] = this.sql<{ value: string }>`SELECT value FROM meta WHERE key = 'owner'`;
    if (!this.state || row?.value !== owner) return null;
    return { title: this.state.title, sections: structuredClone(this.state.sections) };
  }

  /** Worker-only RPC: a client can view the sender's logo through their own brief link. */
  ownerKeyForToken(token: string): string | null {
    if (this.roleForToken(token) !== "client") return null;
    const [row] = this.sql<{ value: string }>`SELECT value FROM meta WHERE key = 'owner'`;
    return row?.value ?? null;
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

  private ownerAccount() {
    const [owner] = this.sql<{ value: string }>`SELECT value FROM meta WHERE key = 'owner'`;
    if (!owner) throw new Error("Nie ma konta właściciela briefu.");
    return accountStub(this.env, owner.value);
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
  async complete() {
    const role = this.requireRole("agency", "client");
    const alreadyCompleted = Boolean(this.state!.completedAt);
    const open = openQuestions(this.state!).length;
    if (!alreadyCompleted) {
      const at = Math.max(Date.now(), this.state!.updatedAt + 1);
      this.logEvent(role, open ? `Zakończono brief, ${open} pytań do uzupełnienia` : "Zakończono brief, wszystko uzupełnione");
      this.setState({ ...this.state!, completedAt: at, updatedAt: at });
    }
    // Release the account slot before the RPC resolves; completed history remains editable.
    await this.ownerAccount().completeBrief(this.name, this.state!.completedAt!);
    if (role === "client" && !alreadyCompleted) this.ctx.waitUntil(this.notifyOwner(open));
  }

  /** Mail do osoby z agencji, która utworzyła brief: klient go wysłał. Błąd wysyłki nie psuje briefu. */
  private async notifyOwner(open: number) {
    try {
      const meta = Object.fromEntries(
        this.sql<{ key: string; value: string }>`SELECT key, value FROM meta WHERE key IN ('owner', 'origin')`.map((r) => [r.key, r.value]),
      );
      if (!meta.owner || !meta.origin) return;
      const to = await accountStub(this.env, meta.owner).ownerEmail();
      if (!to) return;
      const p = progress(this.state!);
      const name = this.state!.clientName ? `${this.state!.clientName}, ${this.state!.title}` : this.state!.title;
      await sendMail(
        this.env,
        briefSentMail({ to, origin: meta.origin, briefId: this.name, briefName: name, settled: p.answered + p.unknown, total: p.total, open }),
      );
    } catch (error) {
      console.error("Nie udało się wysłać powiadomienia o briefie", error);
    }
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
    if (typeof command !== "string") return { ok: false, summary: "Wpisz polecenie.", changes: [] };
    const text = command.trim().slice(0, 1000);
    if (!text) return { ok: false, summary: "Wpisz polecenie.", changes: [] };
    if (!this.env.GEMINI_API_KEY) return { ok: false, summary: "AI jest wyłączone: brak klucza API.", changes: [] };
    if (this.aiRunning) return { ok: false, summary: "AI już pracuje nad tym briefem. Poczekaj na zakończenie poprzedniego polecenia.", changes: [] };

    this.aiRunning = true;
    let reservation: string | undefined;
    let consumed = false;
    let account: ReturnType<typeof accountStub> | undefined;
    try {
      account = this.ownerAccount();
      const quota = await account.reserveAi(this.name);
      if (!quota.ok) return { ok: false, summary: "Wykorzystano 10 poleceń AI w tym miesiącu. Limit odnowi się pierwszego dnia kolejnego miesiąca.", changes: [] };
      reservation = quota.reservation;
      const snapshot = structuredClone(this.state!);
      const sectionsBefore = JSON.stringify(snapshot.sections);
      const outcome = await boundedAiCommand((signal) => runCommand(this.env.GEMINI_API_KEY!, snapshot, text, signal));
      if (!outcome.ok || (!outcome.summary.trim() && outcome.changes.length === 0)) return { ok: false, summary: outcome.summary || "AI zwróciło pustą odpowiedź. Spróbuj ponownie.", changes: [] };
      const stale = () => !this.state || JSON.stringify(this.state.sections) !== sectionsBefore;
      if (stale()) return { ok: false, summary: "Pytania zmieniły się podczas pracy AI. Twoje zmiany zostały zachowane. Uruchom polecenie ponownie na aktualnym briefie.", changes: [] };
      if (!(await account.commitAi(reservation))) return { ok: false, summary: "Polecenie AI trwało zbyt długo. Spróbuj ponownie.", changes: [] };
      // The account RPC yields: an edit during that round trip also makes the result stale.
      if (stale()) return { ok: false, summary: "Pytania zmieniły się podczas pracy AI. Twoje zmiany zostały zachowane. Uruchom polecenie ponownie na aktualnym briefie.", changes: [] };
      if (outcome.ok && outcome.changes.length > 0) {
        const current = this.state;
        if (!current || JSON.stringify(current.sections) !== sectionsBefore) {
          return {
            ok: false,
            summary: "Pytania zmieniły się podczas pracy AI. Twoje zmiany zostały zachowane. Uruchom polecenie ponownie na aktualnym briefie.",
            changes: [],
          };
        }
        // Klient może odpowiadać, a agencja zmieniać nagłówek podczas pracy AI.
        // Z wyniku modelu przyjmujemy tylko strukturę, reszta pochodzi z najnowszego stanu.
        this.commitStructure("ai", `Polecenie AI: „${text}”`, { ...current, sections: outcome.brief.sections });
        for (const change of outcome.changes) this.logEvent("ai", change);
      }
      consumed = true; // A valid answer, including an explanation with no changes, costs one command.
      return { ok: outcome.ok, summary: outcome.summary, changes: outcome.changes };
    } catch (error) {
      return { ok: false, summary: error instanceof Error && (error.message === "AI_TIMEOUT" || error.name === "AbortError") ? "AI przekroczyło czas pracy. Spróbuj krótszego polecenia." : "Nie udało się wykonać polecenia AI. Spróbuj ponownie.", changes: [] };
    } finally {
      if (reservation && !consumed && account) await account.cancelAi(reservation).catch(() => undefined);
      // Nieoczekiwany błąd SDK także musi pozwolić na ponowną próbę.
      this.aiRunning = false;
    }
  }
}
