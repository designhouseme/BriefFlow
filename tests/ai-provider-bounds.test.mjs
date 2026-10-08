import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { boundedAiCommand } from "../src/server/account-quotas.ts";

const source = ts.createSourceFile("ai.ts", readFileSync(new URL("../src/server/ai.ts", import.meta.url), "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const method = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "runCommand");
assert.ok(method);
const implementation = ts.transpileModule(method.getText(source).replace(/^export\s+/, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function harness(provider) {
  let options;
  const requests = [];
  class Client {
    constructor(config) { options = config; }
    models = { generateContent: async (request) => { requests.push(request); return provider(request); } };
  }
  class ApiError extends Error {}
  class OpError extends Error {}
  const run = new Function("GoogleGenAI", "ApiError", "OpError", "FinishReason", "describeBrief", "SYSTEM", "TOOLS", "ThinkingLevel", "MAX_TURNS", "MODEL", "execute", `${implementation}\nreturn runCommand;`)(
    Client, ApiError, OpError, { STOP: "STOP", MAX_TOKENS: "MAX_TOKENS" }, () => "question structure", "system", [], { LOW: "LOW" }, 8, "mock", () => "applied tool change",
  );
  return { run, requests, options: () => options };
}
const brief = { id: "brief", title: "Test", sections: [], answers: {} };
const response = (parts) => ({ candidates: [{ finishReason: "STOP", content: { parts } }] });

test("actual provider calls carry cancellation and enforce one SDK attempt with a 30 second timeout", async () => {
  const { run, requests, options } = harness(async () => response([{ text: "Pytania są poprawne. Bez zmian." }]));
  const controller = new AbortController();
  const result = await run("fake-test-key", brief, "Sprawdź", controller.signal);
  assert.equal(result.ok, true); assert.equal(requests.length, 1);
  assert.equal(requests[0].config.abortSignal, controller.signal);
  assert.deepEqual(options().httpOptions, { timeout: 30_000, retryOptions: { attempts: 1 } });
});

test("empty model content is a failure, while a pre-aborted command sends no provider request", async () => {
  const empty = harness(async () => response([{}]));
  assert.equal((await empty.run("fake-test-key", brief, "Sprawdź")).ok, false);
  const aborted = harness(async () => { throw new Error("provider must not be called"); });
  const controller = new AbortController(); controller.abort();
  assert.equal((await aborted.run("fake-test-key", brief, "Sprawdź", controller.signal)).ok, false);
  assert.equal(aborted.requests.length, 0);
});

test("a late provider response after the whole-command timeout cannot start another model turn", async () => {
  let resolve;
  const waiting = new Promise((done) => { resolve = done; });
  const { run, requests } = harness(() => waiting);
  let execution;
  await assert.rejects(boundedAiCommand((signal) => { execution = run("fake-test-key", brief, "Sprawdź", signal); return execution; }, 5), /AI_TIMEOUT/);
  resolve(response([{ functionCall: { name: "add_field", args: {} } }]));
  const late = await execution;
  assert.equal(late.ok, false); assert.equal(requests.length, 1);
});
