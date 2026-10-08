import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

// Load the actual client module with mocked fetch and a controlled request deadline.
const source = readFileSync(new URL("../src/client/api.ts", import.meta.url), "utf8");
const implementation = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function harness(fetchImpl) {
  const calls = [];
  const timers = new Map();
  let serial = 0;
  const api = {};
  new Function("exports", "fetch", "setTimeout", "clearTimeout", implementation)(
    api,
    async (url, init) => { calls.push({ url, init }); return fetchImpl(url, init); },
    (callback, ms) => { assert.equal(ms, 20_000); const id = ++serial; timers.set(id, callback); return id; },
    (id) => timers.delete(id),
  );
  return { api, calls, timers, expire() { const [callback] = timers.values(); assert.ok(callback); callback(); } };
}

const json = (data, status = 200) => Response.json(data, { status });

test("network errors become safe Polish status-zero errors without retrying POST", async () => {
  const { api, calls, timers } = harness(async () => { throw new TypeError("Failed to fetch: secret-recipient-and-otp"); });
  await assert.rejects(api.startLogin("fixture@example.test"), (error) => {
    assert.ok(error instanceof api.ApiError); assert.equal(error.status, 0);
    assert.match(error.message, /Sprawdź połączenie.*spróbuj ponownie/);
    assert.ok(!error.message.includes("secret")); assert.ok(!error.message.includes("Failed to fetch"));
    assert.deepEqual(error.data, {}); return true;
  });
  assert.equal(calls.length, 1); assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.credentials, "same-origin"); assert.equal(timers.size, 0);
});

test("HTTP error status, message and retry metadata remain intact", async () => {
  const { api, calls } = harness(async () => json({ error: "Kod już wysłany.", retryAfter: 23 }, 429));
  await assert.rejects(api.startLogin("fixture@example.test"), (error) => {
    assert.equal(error.status, 429); assert.equal(error.message, "Kod już wysłany.");
    assert.equal(error.data.retryAfter, 23); return true;
  });
  assert.equal(calls.length, 1);
  const invalid = harness(async () => json({ error: "To nie ten kod." }, 401));
  await assert.rejects(invalid.api.verifyLogin("fixture@example.test", "123456"), (error) => error.status === 401 && error.message === "To nie ten kod.");
  assert.equal(invalid.calls.length, 1, "rejected OTP does not trigger session recovery");
});

test("a request deadline aborts a hanging fetch and reports a retryable timeout", async () => {
  const { api, calls, timers, expire } = harness(() => new Promise(() => {}));
  const waiting = api.getMe();
  expire();
  await assert.rejects(waiting, (error) => error.status === 0 && /na czas.*Spróbuj ponownie/.test(error.message));
  assert.equal(calls[0].init.signal.aborted, true); assert.equal(timers.size, 0);
});

test("the deadline also bounds reading the response body", async () => {
  const { api, calls, expire } = harness(async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }));
  const waiting = api.getMe();
  await Promise.resolve();
  expire();
  await assert.rejects(waiting, (error) => error.status === 0 && /na czas/.test(error.message));
  assert.equal(calls[0].init.signal.aborted, true);
});

test("verification recovers a lost response only for the matching confirmed session", async () => {
  const { api, calls } = harness(async (url) => {
    if (url === "/api/auth/verify") throw new TypeError("Lost response");
    assert.equal(url, "/api/me"); return json({ email: "fixture@example.test" });
  });
  assert.deepEqual(await api.verifyLogin(" Fixture@Example.Test ", "123456"), { email: "fixture@example.test" });
  assert.deepEqual(calls.map(({ url }) => url), ["/api/auth/verify", "/api/me"]);
  assert.equal(calls.filter(({ init }) => init.method === "POST").length, 1, "a redeemed OTP is never submitted again automatically");
});

test("an unrelated session or failed session check preserves the original transport error", async () => {
  for (const recovery of [() => json({ email: "another@example.test" }), () => json({ error: "Not signed in" }, 401), () => { throw new Error("private recovery details"); }]) {
    const { api, calls } = harness(async (url) => {
      if (url === "/api/auth/verify") throw new Error("private verify details");
      return recovery();
    });
    await assert.rejects(api.verifyLogin("fixture@example.test", "123456"), (error) => {
      assert.equal(error.status, 0); assert.match(error.message, /Sprawdź połączenie/);
      assert.ok(!error.message.includes("private")); return true;
    });
    assert.equal(calls.length, 2);
  }
});

test("a broken success body is a transport error while a broken HTTP error body keeps its status", async () => {
  const broken = harness(async () => ({ ok: true, status: 200, json: async () => { throw new TypeError("Body connection lost"); } }));
  await assert.rejects(broken.api.getMe(), (error) => error.status === 0);
  const serverError = harness(async () => ({ ok: false, status: 502, json: async () => { throw new TypeError("Body connection lost"); } }));
  await assert.rejects(serverError.api.getMe(), (error) => error.status === 502);
});
