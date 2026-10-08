import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { boundedAiCommand } from "../src/server/account-quotas.ts";

// Exercise the production RPC method with deferred provider responses. Extracting it
// avoids loading Cloudflare-only runtime modules into Node and keeps the guard under test.
const sourceText = readFileSync(new URL("../src/server/brief-agent.ts", import.meta.url), "utf8");
const source = ts.createSourceFile("brief-agent.ts", sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const agentClass = source.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === "BriefAgent");
assert.ok(agentClass, "BriefAgent class exists");
const method = agentClass.members.find((node) => ts.isMethodDeclaration(node) && node.name.getText(source) === "runAiCommand");
const lock = agentClass.members.find((node) => ts.isPropertyDeclaration(node) && node.name.getText(source) === "aiRunning");
assert.ok(method, "production runAiCommand method exists");
assert.ok(lock, "production instance lock exists");
const methodText = method.getText(source).replace(/@callable\(\)\s*/, "");
const implementation = ts.transpileModule(`class AgentUnderTest { ${lock.getText(source)}\n${methodText} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function brief() {
  return {
    id: "brief-test", title: "Pierwszy tytuł", clientName: "Klient", templateId: "www",
    createdAt: 1, updatedAt: 1, canUndo: false,
    sections: [{ id: "section-one", title: "Założenia", fields: [{ id: "field-one", type: "short_text", label: "Cel strony", required: true, origin: "agency" }] }],
    answers: {},
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function quotaHarness() {
  const records = new Map();
  let serial = 0;
  return {
    records,
    async reserveAi() {
      if (records.size >= 10) return { ok: false };
      const reservation = `reservation-${++serial}`; records.set(reservation, "reserved");
      return { ok: true, reservation };
    },
    async commitAi(reservation) { if (!records.has(reservation)) return false; records.set(reservation, "used"); return true; },
    async cancelAi(reservation) { records.delete(reservation); },
  };
}

function harness(provider, { quota = quotaHarness(), timeoutMs = 1000 } = {}) {
  let startedResolve;
  const started = new Promise((resolve) => { startedResolve = resolve; });
  const wrapped = (...args) => { try { return provider(...args); } finally { startedResolve(); } };
  const AgentUnderTest = new Function("runCommand", "boundedAiCommand", `${implementation}\nreturn AgentUnderTest;`)(wrapped, (start) => boundedAiCommand(start, timeoutMs));
  const agent = new AgentUnderTest();
  const commits = [];
  const events = [];
  agent.env = { GEMINI_API_KEY: "test-only-key" };
  agent.name = "brief-test";
  agent.ownerAccount = () => quota;
  agent.state = brief();
  agent.requireRole = (role) => assert.equal(role, "agency");
  agent.commitStructure = (actor, label, next) => {
    commits.push({ actor, label, next });
    agent.state = { ...next, canUndo: true };
  };
  agent.logEvent = (actor, text) => events.push({ actor, text });
  return { agent, commits, events, quota, started };
}

function success(snapshot) {
  const next = structuredClone(snapshot);
  next.sections[0].fields[0].label = "Cel strony po zmianie AI";
  return { ok: true, summary: "Zmieniono pytanie.", changes: ["Zmieniono pytanie o cel strony."], brief: next };
}

test("only one model request runs for a brief, including calls from another connection", async () => {
  const waiting = deferred();
  let calls = 0;
  let snapshot;
  const { agent, commits } = harness(async (_key, original) => {
    calls++;
    snapshot = original;
    return waiting.promise;
  });
  const first = agent.runAiCommand("Zmień pytanie");
  const second = await agent.runAiCommand("Dodaj pytanie");
  assert.equal(second.ok, false);
  assert.match(second.summary, /AI już pracuje/);
  assert.deepEqual(second.changes, []);
  assert.equal(calls, 1);
  waiting.resolve(success(snapshot));
  assert.equal((await first).ok, true);
  assert.equal(commits.length, 1);
  assert.equal(agent.aiRunning, false);
});

test("manual edits during the model request reject its stale structure without history writes", async () => {
  const waiting = deferred();
  let snapshot;
  const { agent, commits, events, started, quota } = harness(async (_key, original) => {
    snapshot = original;
    return waiting.promise;
  });
  const request = agent.runAiCommand("Zmień pytanie");
  await started;
  agent.state = structuredClone(agent.state);
  agent.state.sections[0].fields[0].label = "Ręczna poprawka";
  agent.state.sections[0].fields.push({ id: "field-two", type: "yes_no", label: "Nowe ręczne pytanie", required: false, origin: "agency" });
  const currentSections = structuredClone(agent.state.sections);
  waiting.resolve(success(snapshot));
  const result = await request;
  assert.equal(result.ok, false);
  assert.match(result.summary, /Pytania zmieniły się/);
  assert.deepEqual(result.changes, []);
  assert.deepEqual(agent.state.sections, currentSections);
  assert.equal(commits.length, 0);
  assert.equal(events.length, 0);
  assert.equal(agent.aiRunning, false);
  assert.equal(quota.records.size, 0);
});

test("model receives an isolated snapshot while accepted changes preserve new answers and metadata", async () => {
  const waiting = deferred();
  let snapshot;
  const { agent, commits, started, quota } = harness(async (_key, original) => {
    snapshot = original;
    return waiting.promise;
  });
  const originalState = agent.state;
  const request = agent.runAiCommand("Zmień pytanie");
  await started;
  assert.notEqual(snapshot, originalState);
  assert.notEqual(snapshot.sections, originalState.sections);
  assert.notEqual(snapshot.sections[0].fields[0], originalState.sections[0].fields[0]);
  agent.state = {
    ...agent.state, title: "Najnowszy tytuł", clientName: "Nowa nazwa klienta", completedAt: 7,
    answers: { "field-one": { status: "answered", value: "Aktualna odpowiedź klienta", by: "client", at: 6 } },
  };
  const newestAnswers = agent.state.answers;
  waiting.resolve(success(snapshot));
  assert.equal((await request).ok, true);
  assert.equal(commits.length, 1);
  assert.equal(agent.state.sections[0].fields[0].label, "Cel strony po zmianie AI");
  assert.equal(agent.state.answers, newestAnswers);
  assert.equal(agent.state.title, "Najnowszy tytuł");
  assert.equal(agent.state.clientName, "Nowa nazwa klienta");
  assert.equal(agent.state.completedAt, 7);
  assert.equal(quota.records.size, 1);
});

test("unexpected provider exceptions release the server lock so a later command can run", async () => {
  const waiting = deferred();
  let calls = 0;
  const { agent, commits, started, quota } = harness(async (_key, snapshot) => {
    calls++;
    if (calls === 1) return waiting.promise;
    return success(snapshot);
  });
  const request = agent.runAiCommand("Pierwsze polecenie");
  await started;
  waiting.reject(new Error("Unexpected SDK exception"));
  const failed = await request;
  assert.equal(failed.ok, false);
  assert.ok(!failed.summary.includes("Unexpected SDK exception"));
  assert.equal(agent.aiRunning, false);
  assert.equal(commits.length, 0);
  assert.equal(quota.records.size, 0);
  assert.equal((await agent.runAiCommand("Spróbuj ponownie")).ok, true);
  assert.equal(calls, 2);
  assert.equal(commits.length, 1);
});

test("expected provider failures release the lock and never commit unsuccessful changes", async () => {
  let calls = 0;
  const { agent, commits, events, quota } = harness(async (_key, snapshot) => {
    calls++;
    if (calls === 1) return { ...success(snapshot), ok: false, summary: "Limit zapytań do AI." };
    return success(snapshot);
  });
  assert.equal((await agent.runAiCommand("Pierwsze polecenie")).ok, false);
  assert.equal(agent.aiRunning, false);
  assert.equal(commits.length, 0);
  assert.equal(events.length, 0);
  assert.equal(quota.records.size, 0);
  assert.equal((await agent.runAiCommand("Kolejne polecenie")).ok, true);
  assert.equal(calls, 2);
});

test("successful explanation/no-op consumes one command while an empty result is refunded", async () => {
  const valid = harness(async (_key, snapshot) => ({ ok: true, summary: "Pytania już uwzględniają te informacje. Bez zmian.", changes: [], brief: snapshot }));
  assert.equal((await valid.agent.runAiCommand("Sprawdź pytania")).ok, true);
  assert.equal(valid.quota.records.size, 1); assert.equal(valid.commits.length, 0);
  const empty = harness(async (_key, snapshot) => ({ ok: true, summary: "", changes: [], brief: snapshot }));
  assert.equal((await empty.agent.runAiCommand("Sprawdź pytania")).ok, false);
  assert.equal(empty.quota.records.size, 0);
});

test("different briefs of one account cannot start more than ten provider commands", async () => {
  const quota = quotaHarness();
  const waiting = deferred();
  let calls = 0;
  const agents = Array.from({ length: 12 }, (_, index) => {
    const result = harness(async (_key, snapshot) => { calls++; await waiting.promise; return { ok: true, summary: "Bez zmian.", changes: [], brief: snapshot }; }, { quota });
    result.agent.name = `brief-${index}`;
    return result;
  });
  const requests = agents.map(({ agent }) => agent.runAiCommand("Sprawdź pytania"));
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(calls, 10); assert.equal(quota.records.size, 10);
  waiting.resolve();
  const results = await Promise.all(requests);
  assert.equal(results.filter((result) => result.ok).length, 10);
  assert.equal(results.filter((result) => !result.ok).length, 2);
  assert.equal(quota.records.size, 10);
});

test("an edit while the quota commit RPC is pending rolls back the unit and rejects stale structure", async () => {
  const quota = quotaHarness();
  const committed = deferred();
  const waiting = deferred();
  quota.commitAi = async (reservation) => { quota.records.set(reservation, "used"); committed.resolve(); return waiting.promise; };
  const { agent, commits } = harness(async (_key, snapshot) => success(snapshot), { quota });
  const request = agent.runAiCommand("Zmień pytanie");
  await committed.promise;
  agent.state = structuredClone(agent.state); agent.state.sections[0].fields[0].label = "Ręczna poprawka podczas zapisu limitu";
  waiting.resolve(true);
  assert.equal((await request).ok, false);
  assert.equal(quota.records.size, 0); assert.equal(commits.length, 0);
  assert.equal(agent.state.sections[0].fields[0].label, "Ręczna poprawka podczas zapisu limitu");
});

test("a hanging provider times out, aborts, refunds the command and releases the brief lock", async () => {
  let signal;
  const { agent, quota } = harness((_key, _snapshot, _text, current) => { signal = current; return new Promise(() => {}); }, { timeoutMs: 5 });
  const result = await agent.runAiCommand("Zmień pytanie");
  assert.equal(result.ok, false); assert.match(result.summary, /czas pracy/);
  assert.equal(signal.aborted, true); assert.equal(quota.records.size, 0); assert.equal(agent.aiRunning, false);
});

test("invalid/blank commands and a disabled model do not reserve account quota", async () => {
  const { agent, quota } = harness(async () => { throw new Error("provider must not be called"); });
  assert.equal((await agent.runAiCommand("   ")).ok, false);
  assert.equal((await agent.runAiCommand(null)).ok, false);
  agent.env.GEMINI_API_KEY = "";
  assert.equal((await agent.runAiCommand("Zmień pytanie")).ok, false);
  assert.equal(quota.records.size, 0);
});
