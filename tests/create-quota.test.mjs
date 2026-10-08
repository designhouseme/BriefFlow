import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { AccountQuotas } from "../src/server/account-quotas.ts";

const source = ts.createSourceFile("index.ts", readFileSync(new URL("../src/server/index.ts", import.meta.url), "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const declarations = ["boundedBytes", "smallJson", "createBrief"].map((name) => {
  const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `${name} exists`);
  return declaration.getText(source);
});
const implementation = ts.transpileModule(declarations.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

function harness({ failInit = false, failCommit = false, full = false } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE briefs (id TEXT PRIMARY KEY, completed_at INTEGER)");
  const sql = { exec(query, ...bindings) { const rows = db.prepare(query).all(...bindings); return { toArray: () => rows }; } };
  const quotas = new AccountQuotas(sql);
  if (full) for (let i = 0; i < 3; i++) db.prepare("INSERT INTO briefs (id) VALUES (?)").run(`active-${i}`);
  let agentCalls = 0;
  let initCalls = 0;
  let destroyed = false;
  const account = {
    template: async () => null,
    reserveBrief: async (id) => quotas.reserveBrief(id),
    async commitBrief(reservation, summary) {
      if (failCommit) throw new Error("simulated account storage failure");
      return quotas.commitBrief(summary.id, reservation, () => db.prepare("INSERT INTO briefs (id) VALUES (?)").run(summary.id));
    },
    cancelBriefReservation: async (id, reservation) => quotas.cancelBrief(id, reservation),
    removeBrief: async (id) => { db.prepare("DELETE FROM briefs WHERE id = ?").run(id); },
  };
  const agent = {
    async initBrief() {
      initCalls++;
      if (failInit) throw new Error("simulated Durable Object initialization failure");
      return { agency: "agency", client: "client", summary: { id: "Abcdef123456" } };
    },
    async destroyBrief() { destroyed = true; },
  };
  const createBrief = new Function("sameOrigin", "forbidden", "TEMPLATE_ID", "TEMPLATE_LIST", "newBriefId", "briefAgent", "json", `${implementation}\nreturn createBrief;`)(
    () => true,
    () => new Response("Forbidden", { status: 403 }),
    /^custom_[A-Za-z0-9]{16}$/,
    [{ id: "www" }],
    () => "Abcdef123456",
    async () => { agentCalls++; return agent; },
    (data, status = 200) => Response.json(data, { status }),
  );
  const request = () => new Request("http://localhost/api/briefs", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ templateId: "www" }) });
  return { db, quotas, run: () => createBrief(request(), {}, { key: "owner", account }), state: () => ({ agentCalls, initCalls, destroyed }) };
}

test("full account rejects creation before allocating a new Durable Object", async () => {
  const { run, db, quotas, state } = harness({ full: true });
  try {
    const response = await run(); assert.equal(response.status, 429);
    assert.equal((await response.json()).usage.briefs.used, 3);
    assert.equal(state().agentCalls, 0); assert.equal(state().initCalls, 0);
    assert.equal(quotas.usage().briefs.used, 3);
  } finally { db.close(); }
});

for (const failure of ["failInit", "failCommit"]) test(`${failure} cleans the reservation, account row and partial Durable Object`, async () => {
  const { run, db, quotas, state } = harness({ [failure]: true });
  try {
    const response = await run(); assert.equal(response.status, 503);
    assert.equal(quotas.usage().briefs.used, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM briefs").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM brief_reservations").get().count, 0);
    assert.equal(state().destroyed, true);
  } finally { db.close(); }
});

test("successful creation transfers a reserved slot into one active brief", async () => {
  const { run, db, quotas, state } = harness();
  try {
    const response = await run(); assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { id: "Abcdef123456" });
    assert.equal(quotas.usage().briefs.used, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM brief_reservations").get().count, 0);
    assert.equal(state().destroyed, false);
  } finally { db.close(); }
});
