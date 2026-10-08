import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import ts from "typescript";
import { AccountQuotas, boundedAiCommand } from "../src/server/account-quotas.ts";

const source = ts.createSourceFile("index.ts", readFileSync(new URL("../src/server/index.ts", import.meta.url), "utf8"), ts.ScriptTarget.ES2022, true);
const declarations = ["boundedBytes", "smallJson", "createSmartBrief"].map((name) => source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(source));
const implementation = ts.transpileModule(declarations.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
class SmartBriefError extends Error {}

function harness({ provider = "success", commit = "success", full = false, lifetimeFull = false } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE briefs (id TEXT PRIMARY KEY, completed_at INTEGER)");
  const sql = { exec(query, ...bindings) { const rows = db.prepare(query).all(...bindings); return { toArray: () => rows }; } };
  const quotas = new AccountQuotas(sql);
  for (let i = 0; i < 3 && (full || lifetimeFull); i++) {
    const id = `old-${i}`;
    const slot = quotas.reserveBrief(id, lifetimeFull);
    quotas.commitBrief(id, slot.reservation, () => db.prepare("INSERT INTO briefs (id) VALUES (?)").run(id));
    if (lifetimeFull) db.prepare("DELETE FROM briefs WHERE id = ?").run(id);
  }
  const calls = { provider: 0, agent: 0, destroy: 0, init: null };
  const account = {
    reserveBrief: async (id, smart) => quotas.reserveBrief(id, smart),
    async commitBrief(reservation, summary) {
      if (commit === "fail") throw new Error("private-storage-details");
      const result = quotas.commitBrief(summary.id, reservation, () => db.prepare("INSERT INTO briefs (id) VALUES (?)").run(summary.id));
      if (commit === "lost-response") throw new Error("RPC response lost after commit");
      return result;
    },
    cancelBriefReservation: async (id, reservation) => quotas.cancelBrief(id, reservation),
    removeBrief: async (id) => db.prepare("DELETE FROM briefs WHERE id = ?").run(id),
  };
  const agent = {
    async initBrief(input) { calls.init = input; return { agency: "agency", client: "client", summary: { id: "TestSmart1234" } }; },
    async destroyBrief() { calls.destroy++; },
  };
  const dependencies = {
    SmartBriefError,
    sameOrigin: (request) => request.headers.get("origin") === new URL(request.url).origin,
    forbidden: async () => Response.json({ error: "Forbidden" }, { status: 403 }),
    json: (data, status = 200) => Response.json(data, { status }),
    validateSmartBriefSource: (value) => { if (typeof value !== "string" || value.length < 80 || value.length > 50_000) throw new SmartBriefError("Zły rozmiar źródła"); return value; },
    newBriefId: () => "TestSmart1234",
    boundedAiCommand: (start) => boundedAiCommand(start, 15),
    generateSmartBrief: async (_key, material, input) => {
      calls.provider++;
      if (provider === "timeout") return new Promise(() => {});
      if (provider === "fail") throw new SmartBriefError("AI nie ukończyło briefu, limit nie został zużyty.");
      if (provider === "network") throw new TypeError("private-provider-details");
      return { id: input.id, title: "Studio", clientName: input.clientName, smartBrief: { sourceCharacters: material.length }, sections: [], answers: {} };
    },
    briefAgent: async () => { calls.agent++; return agent; },
  };
  const create = new Function(...Object.keys(dependencies), `${implementation}\nreturn createSmartBrief;`)(...Object.values(dependencies));
  const request = ({ body = { source: "Zażółć gęślą jaźń i opis projektu. ".repeat(100), clientName: "Test" }, origin = "http://localhost", key = "test-key", contentType = "application/json" } = {}) => create(new Request("http://localhost/api/smartbriefs", { method: "POST", headers: { "content-type": contentType, origin }, body: JSON.stringify(body) }), { GEMINI_API_KEY: key }, { key: "owner", account });
  return { request, db, quotas, calls };
}

test("SmartBrief creation accepts a transcript beyond the ordinary JSON body limit and saves extracted data", async () => {
  const h = harness();
  try {
    const response = await h.request({ body: { source: "Tekst projektu. ".repeat(1500), clientName: "Studio" } });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).id, "TestSmart1234");
    assert.equal(h.quotas.usage().smartBriefs.used, 1);
    assert.equal(h.quotas.usage().briefs.used, 1);
    assert.equal(h.quotas.usage().ai.used, 0);
    assert.equal(h.calls.init.smartBrief.clientName, "Studio");
    assert.ok(!JSON.stringify(h.calls.init).includes("Tekst projektu."));
  } finally { h.db.close(); }
});

test("both active and lifetime limits reject before model calls or agent allocation", async () => {
  for (const config of [{ full: true }, { lifetimeFull: true }]) {
    const h = harness(config);
    try {
      const response = await h.request();
      assert.equal(response.status, 429);
      assert.equal(h.calls.provider, 0); assert.equal(h.calls.agent, 0);
      assert.match((await response.json()).error, config.full ? /aktywne briefy/ : /3 SmartBriefy/);
    } finally { h.db.close(); }
  }
});

test("bad origin, disabled AI, invalid content and short/oversized source never reserve quota", async () => {
  for (const config of [{ origin: "http://other.test" }, { key: "" }, { contentType: "text/plain" }, { body: { source: "short" } }, { body: { source: "x".repeat(50_001) } }, { body: { source: "x".repeat(100), clientName: 123 } }]) {
    const h = harness();
    try {
      assert.ok((await h.request(config)).status >= 400);
      assert.equal(h.calls.provider, 0);
      assert.equal(h.quotas.usage().briefs.used, 0); assert.equal(h.quotas.usage().smartBriefs.used, 0);
    } finally { h.db.close(); }
  }
});

test("provider failures, timeouts and storage failures refund both limits including a lost commit response", async () => {
  for (const config of [{ provider: "fail" }, { provider: "timeout" }, { provider: "network" }, { commit: "fail" }, { commit: "lost-response" }]) {
    const h = harness(config);
    try {
      const response = await h.request();
      assert.equal(response.status, 503);
      const error = (await response.json()).error;
      assert.match(error, /limit nie został zużyty/);
      assert.ok(!error.includes("private"));
      assert.equal(h.quotas.usage().smartBriefs.used, 0); assert.equal(h.quotas.usage().briefs.used, 0); assert.equal(h.quotas.usage().ai.used, 0);
      assert.equal(h.calls.destroy, config.commit ? 1 : 0);
    } finally { h.db.close(); }
  }
});
