import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import ts from "typescript";

const accountsSource = ts.createSourceFile("accounts.ts", readFileSync(new URL("../src/server/accounts.ts", import.meta.url), "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const accountClass = accountsSource.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === "AccountStore");
assert.ok(accountClass);
const methods = ["email", "requestCode", "cancelCodeRequest", "verifyCode", "sessionEmail"].map((name) => {
  const method = accountClass.members.find((node) => ts.isMethodDeclaration(node) && node.name.getText(accountsSource) === name);
  assert.ok(method, `actual ${name} method exists`); return method.getText(accountsSource);
});
const declarations = accountsSource.statements.filter((node) =>
  (ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => ["CODE_TTL", "CODE_ATTEMPTS", "RESEND_AFTER", "CODES_PER_HOUR", "SESSION_TTL", "ALPHABET"].includes(declaration.name.getText(accountsSource)))) ||
  (ts.isFunctionDeclaration(node) && ["sha256", "sameString", "randomString"].includes(node.name?.text)),
).map((node) => node.getText(accountsSource).replace(/^export\s+/, ""));
const accountImplementation = ts.transpileModule(`${declarations.join("\n")}\nclass StoreUnderTest { ${methods.join("\n")} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const schemas = [];
function findSchemas(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "exec") {
    const query = node.arguments[0];
    if (query && ts.isStringLiteralLike(query) && /^CREATE TABLE IF NOT EXISTS (profile|codes|sessions)\b/.test(query.text)) schemas.push(query.text);
  }
  ts.forEachChild(node, findSchemas);
}
findSchemas(accountClass);
assert.equal(schemas.length, 3, "use the actual account authentication schema");
const authImplementation = ts.transpileModule(readFileSync(new URL("../src/server/auth.ts", import.meta.url), "utf8").replaceAll("import.meta.env.DEV", "__DEV"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const email = "delivery-fixture@example.test";
const origin = "https://brief.example.test";

function harness(provider = async () => {}, dev = false) {
  let now = Date.UTC(2026, 9, 8, 12);
  let random = 100000;
  const db = new DatabaseSync(":memory:");
  for (const schema of schemas) db.exec(schema);
  const sql = { exec(query, ...parameters) { const rows = db.prepare(query).all(...parameters); return { toArray: () => rows }; } };
  const controlledCrypto = { subtle: crypto.subtle, getRandomValues(values) { values.fill(++random); return values; } };
  class ControlledDate extends Date { static now() { return now; } }
  const Store = new Function("Date", "crypto", `${accountImplementation}\nreturn StoreUnderTest;`)(ControlledDate, controlledCrypto);
  const store = new Store(); store.sql = sql;
  const logs = [];
  const api = {};
  new Function("exports", "require", "__DEV", "console", authImplementation)(api, (module) => {
    if (module === "./accounts") return { accountKey: async () => "fixture-account-key", accountStub: () => store, SESSION_TTL: 30 * 24 * 3600_000 };
    if (module === "./emails") return { loginCodeMail: (input) => input, sendMail: provider };
    throw new Error(`Unexpected auth dependency ${module}`);
  }, dev, { log: (...args) => logs.push(args), error: (...args) => logs.push(args) });
  return {
    store, db, logs,
    advance(ms) { now += ms; },
    start() {
      return api.startLogin(new Request(`${origin}/api/auth/start`, {
        method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email }),
      }), {});
    },
  };
}

test("failed production delivery invalidates its code, returns 502 and allows an immediate retry", async () => {
  const sent = [];
  const h = harness(async (_env, mail) => {
    sent.push(mail);
    if (sent.length === 1) throw new Error("Resend: wysyłka nie powiodła się (HTTP 403).");
  });
  try {
    const failed = await h.start();
    assert.equal(failed.status, 502);
    const failure = await failed.json();
    assert.equal(failure.devCode, undefined); assert.equal(failure.requestId, undefined);
    assert.equal(h.db.prepare("SELECT COUNT(*) AS count FROM codes").get().count, 0);
    assert.equal((await h.store.verifyCode(sent[0].code)).ok, false, "failed delivery leaves no usable code");
    const retry = await h.start(); assert.equal(retry.status, 200);
    assert.deepEqual(await retry.json(), { ok: true });
    assert.equal(sent.length, 2);
    assert.equal((await h.store.requestCode(email)).ok, false, "successful delivery retains its resend protection");
    assert.equal((await h.store.verifyCode(sent[1].code)).ok, true);
  } finally { h.db.close(); }
});

test("repeated failed deliveries do not consume the five-per-hour successful-send allowance", async () => {
  let fail = true;
  let calls = 0;
  const h = harness(async () => { calls++; if (fail) throw new Error("Provider unavailable"); });
  try {
    for (let i = 0; i < 7; i++) assert.equal((await h.start()).status, 502);
    assert.equal(h.db.prepare("SELECT COUNT(*) AS count FROM codes").get().count, 0);
    fail = false;
    assert.equal((await h.start()).status, 200);
    assert.equal(calls, 8);
  } finally { h.db.close(); }
});

test("a delayed failure rolls back only its exact request and preserves a newer delivered code", async () => {
  let rejectFirst;
  let started;
  const firstStarted = new Promise((resolve) => { started = resolve; });
  const messages = [];
  const h = harness(async (_env, mail) => {
    messages.push(mail);
    if (messages.length === 1) { started(); return new Promise((_resolve, reject) => { rejectFirst = reject; }); }
  });
  try {
    const olderRequest = h.start();
    await firstStarted;
    h.advance(30_001);
    assert.equal((await h.start()).status, 200);
    const latestId = h.db.prepare("SELECT id FROM codes ORDER BY id DESC LIMIT 1").get().id;
    rejectFirst(new Error("Timed out older delivery"));
    assert.equal((await olderRequest).status, 502);
    assert.deepEqual(h.db.prepare("SELECT id, used FROM codes").all().map((row) => ({ ...row })), [{ id: latestId, used: 0 }]);
    assert.equal((await h.store.verifyCode(messages[0].code)).ok, false);
    assert.equal((await h.store.verifyCode(messages[1].code)).ok, true);
    assert.equal((await h.store.requestCode(email)).ok, false, "the newer request still owns the resend throttle");
  } finally { h.db.close(); }
});

test("rollback is idempotent and does not revive an older superseded code", async () => {
  const h = harness();
  try {
    const previous = await h.store.requestCode(email); assert.equal(previous.ok, true);
    h.advance(30_001);
    const failed = await h.store.requestCode(email); assert.equal(failed.ok, true);
    h.store.cancelCodeRequest(failed.requestId); h.store.cancelCodeRequest(failed.requestId);
    assert.equal((await h.store.verifyCode(previous.code)).ok, false);
    assert.equal((await h.store.verifyCode(failed.code)).ok, false);
    assert.deepEqual(h.db.prepare("SELECT id, used FROM codes").all().map((row) => ({ ...row })), [{ id: previous.requestId, used: 1 }]);
    const retry = await h.store.requestCode(email); assert.equal(retry.ok, true);
    h.store.cancelCodeRequest(failed.requestId);
    assert.equal((await h.store.verifyCode(retry.code)).ok, true);
  } finally { h.db.close(); }
});

test("concurrent requests still issue one code, including after a failed request is cancelled", async () => {
  const h = harness();
  try {
    const first = await Promise.all(Array.from({ length: 20 }, () => h.store.requestCode(email)));
    assert.equal(first.filter((result) => result.ok).length, 1);
    const cancelled = first.find((result) => result.ok);
    h.store.cancelCodeRequest(cancelled.requestId);
    const second = await Promise.all(Array.from({ length: 20 }, () => h.store.requestCode(email)));
    assert.equal(second.filter((result) => result.ok).length, 1);
    const accepted = second.find((result) => result.ok);
    h.store.cancelCodeRequest(cancelled.requestId);
    assert.equal((await h.store.verifyCode(accepted.code)).ok, true);
  } finally { h.db.close(); }
});

test("successful deliveries retain the five-per-hour limit even after an unrelated rollback", async () => {
  const h = harness();
  try {
    for (let i = 0; i < 5; i++) {
      assert.equal((await h.start()).status, 200);
      h.advance(30_001);
    }
    h.store.cancelCodeRequest(99999);
    const limited = await h.start(); assert.equal(limited.status, 429);
    const limit = await limited.json();
    assert.match(limit.error, /^Następny kod możesz zamówić za \d+ s\.$/);
    assert.equal(typeof limit.retryAfter, "number");
    assert.equal(h.db.prepare("SELECT COUNT(*) AS count FROM codes").get().count, 5);
  } finally { h.db.close(); }
});

test("DEV delivery failure deliberately keeps the usable dev code and resend protection", async () => {
  const h = harness(async () => { throw new Error("Mailpit unavailable"); }, true);
  try {
    const response = await h.start(); assert.equal(response.status, 200);
    const result = await response.json(); assert.match(result.devCode, /^\d{6}$/);
    assert.equal(result.requestId, undefined, "the internal rollback id is not public");
    assert.equal((await h.store.requestCode(email)).ok, false);
    assert.equal((await h.store.verifyCode(result.devCode)).ok, true);
  } finally { h.db.close(); }
});
