import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { AccountQuotas, boundedAiCommand, calendarMonth } from "../src/server/account-quotas.ts";

// Load the actual account methods without importing the Cloudflare-only DurableObject module.
const source = ts.createSourceFile("accounts.ts", readFileSync(new URL("../src/server/accounts.ts", import.meta.url), "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const accountClass = source.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === "AccountStore");
const names = ["usage", "reserveBrief", "commitBrief", "cancelBriefReservation", "reserveAi", "commitAi", "cancelAi", "completeBrief", "addBrief", "touchBrief", "removeBrief"];
const methods = names.map((name) => {
  const method = accountClass.members.find((node) => ts.isMethodDeclaration(node) && node.name.getText(source) === name);
  assert.ok(method, `production ${name} method exists`);
  return method.getText(source);
});
const implementation = ts.transpileModule(`class StoreUnderTest { ${methods.join("\n")} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const StoreUnderTest = new Function(`${implementation}\nreturn StoreUnderTest;`)();

function harness(start = Date.UTC(2026, 9, 8, 12)) {
  let now = start;
  let serial = 0;
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE briefs (id TEXT PRIMARY KEY, title TEXT, client_name TEXT, template_id TEXT, agency_token TEXT, client_token TEXT, created_at INTEGER, updated_at INTEGER, settled INTEGER, total INTEGER, completed_at INTEGER)`);
  const sql = { exec(query, ...bindings) { const rows = db.prepare(query).all(...bindings); return { toArray: () => rows }; } };
  const store = new StoreUnderTest();
  store.sql = sql;
  store.quotas = new AccountQuotas(sql, () => now, () => `reservation-${++serial}`);
  store.ctx = { storage: { transactionSync(fn) {
    db.exec("BEGIN");
    try { const result = fn(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  } } };
  const summary = (id, completedAt) => ({ id, title: id, clientName: "Test", templateId: "empty", agencyToken: "agency", clientToken: "client", createdAt: now, updatedAt: now, settled: 0, total: 1, completedAt });
  return { store, db, summary, advance(ms) { now += ms; } };
}

test("concurrent brief creations reserve only three slots and failed initialization releases a slot", async () => {
  const { store, db, summary } = harness();
  try {
    const requests = await Promise.all(Array.from({ length: 20 }, (_, index) => Promise.resolve().then(() => ({ id: `brief-${index}`, ...store.reserveBrief(`brief-${index}`) }))));
    const accepted = requests.filter((result) => result.ok);
    assert.equal(accepted.length, 3);
    assert.equal(store.usage().briefs.used, 3);
    const [first, second, failed] = accepted;
    assert.equal(store.commitBrief(first.reservation, summary(first.id)), true);
    assert.equal(store.commitBrief(second.reservation, summary(second.id)), true);
    store.cancelBriefReservation(failed.id, failed.reservation);
    assert.equal(store.usage().briefs.used, 2);
    const retry = store.reserveBrief("retry"); assert.equal(retry.ok, true);
    assert.equal(store.commitBrief(retry.reservation, summary("retry")), true);
    assert.equal(store.usage().briefs.used, 3);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM brief_reservations").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM briefs").get().count, 3);
  } finally { db.close(); }
});

test("failed atomic commit rolls back inserted brief and cancelled or expired creation cannot commit", () => {
  const { store, db, summary, advance } = harness();
  try {
    const first = store.reserveBrief("first");
    const originalInsert = store.addBrief;
    store.addBrief = (brief) => { originalInsert.call(store, brief); throw new Error("simulated storage failure"); };
    assert.throws(() => store.commitBrief(first.reservation, summary("first")), /storage failure/);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM briefs").get().count, 0);
    store.cancelBriefReservation("first", first.reservation);
    assert.equal(store.usage().briefs.used, 0);
    store.addBrief = originalInsert;
    const expired = store.reserveBrief("expired"); advance(3 * 60_000 + 1);
    assert.equal(store.commitBrief(expired.reservation, summary("expired")), false);
    assert.equal(store.usage().briefs.used, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM briefs").get().count, 0);
  } finally { db.close(); }
});

test("completion retains history, permanently frees a slot, and stale/null patches cannot reopen it", () => {
  const { store, db, summary } = harness();
  try {
    for (let i = 0; i < 3; i++) store.addBrief(summary(`brief-${i}`));
    assert.equal(store.reserveBrief("fourth").ok, false);
    const at = summary("brief-0").updatedAt + 1;
    assert.equal(store.completeBrief("brief-0", at), true);
    store.touchBrief("brief-0", { title: "New title", clientName: "Test", updatedAt: at + 1, settled: 1, total: 1, completedAt: undefined });
    store.touchBrief("brief-0", { title: "Stale title", clientName: "Test", updatedAt: at - 1, settled: 0, total: 1, completedAt: undefined });
    const completed = db.prepare("SELECT * FROM briefs WHERE id='brief-0'").get();
    assert.equal(completed.completed_at, at); assert.equal(completed.title, "New title");
    assert.equal(store.usage().briefs.used, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM briefs").get().count, 3);
    assert.equal(store.reserveBrief("fourth").ok, true);
  } finally { db.close(); }
});

test("legacy over-limit accounts retain editable briefs but cannot allocate more", () => {
  const { store, db, summary } = harness();
  try {
    for (let i = 0; i < 5; i++) store.addBrief(summary(`legacy-${i}`));
    assert.equal(store.usage().briefs.used, 5);
    assert.equal(store.reserveBrief("sixth").ok, false);
    const patch = summary("legacy-0"); store.touchBrief(patch.id, { ...patch, title: "Still editable", updatedAt: patch.updatedAt + 1 });
    assert.equal(db.prepare("SELECT title FROM briefs WHERE id='legacy-0'").get().title, "Still editable");
    store.removeBrief("legacy-4"); assert.equal(store.usage().briefs.used, 4);
  } finally { db.close(); }
});

test("AI reservations atomically span briefs, refund failures, consume success once and expire abandonment", async () => {
  const { store, db, summary, advance } = harness();
  try {
    store.addBrief(summary("first")); store.addBrief(summary("second"));
    const requests = await Promise.all(Array.from({ length: 30 }, (_, index) => Promise.resolve().then(() => store.reserveAi(index % 2 ? "first" : "second"))));
    const accepted = requests.filter((result) => result.ok);
    assert.equal(accepted.length, 10); assert.equal(store.usage().ai.used, 10);
    const success = accepted[0].reservation;
    assert.equal(store.commitAi(success), true); assert.equal(store.commitAi(success), true);
    store.cancelAi(accepted[1].reservation); assert.equal(store.usage().ai.used, 9);
    const retry = store.reserveAi("first"); assert.equal(retry.ok, true);
    assert.equal(store.usage().ai.used, 10);
    advance(3 * 60_000 + 1);
    assert.equal(store.usage().ai.used, 1);
    assert.equal(store.commitAi(retry.reservation), false);
    assert.equal(store.reserveAi("missing").ok, false);
  } finally { db.close(); }
});

test("monthly quota resets at Warsaw midnight, including winter/summer transitions and December", () => {
  assert.deepEqual(calendarMonth(Date.UTC(2026, 8, 30, 21, 59, 59)), { key: "2026-09", resetsAt: Date.UTC(2026, 8, 30, 22) });
  assert.deepEqual(calendarMonth(Date.UTC(2026, 8, 30, 22)), { key: "2026-10", resetsAt: Date.UTC(2026, 9, 31, 23) });
  assert.deepEqual(calendarMonth(Date.UTC(2026, 11, 31, 22, 59, 59)), { key: "2026-12", resetsAt: Date.UTC(2026, 11, 31, 23) });
  assert.deepEqual(calendarMonth(Date.UTC(2026, 11, 31, 23)), { key: "2027-01", resetsAt: Date.UTC(2027, 0, 31, 23) });
  const { store, db, summary, advance } = harness(Date.UTC(2026, 8, 30, 21, 59, 59));
  try {
    store.addBrief(summary("brief"));
    for (let i = 0; i < 10; i++) assert.equal(store.commitAi(store.reserveAi("brief").reservation), true);
    assert.equal(store.reserveAi("brief").ok, false);
    advance(1000);
    assert.equal(store.usage().ai.used, 0); assert.equal(store.reserveAi("brief").ok, true);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ai_usage WHERE status='used'").get().count, 10);
  } finally { db.close(); }
});

test("bounded AI execution aborts a hanging request and leaves later requests usable", async () => {
  let signal;
  await assert.rejects(boundedAiCommand((current) => { signal = current; return new Promise(() => {}); }, 5), /AI_TIMEOUT/);
  assert.equal(signal.aborted, true);
  assert.equal(await boundedAiCommand(async () => "retry", 20), "retry");
});
