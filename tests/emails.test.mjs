import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

// The real server module is evaluated with a mocked fetch and Vite's DEV flag.
// No test sends a message to an external provider or reads configured secrets.
const source = readFileSync(new URL("../src/server/emails.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source.replaceAll("import.meta.env.DEV", "__DEV"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const fakeKey = "re_synthetic_test_key_not_a_real_secret";
const mail = { to: "client@example.test", subject: "Test briefu", html: "<p>Test</p>", text: "Test" };

function transport(fetch, { dev = false, abortSignal = AbortSignal } = {}) {
  const exports = {};
  new Function("exports", "fetch", "__DEV", "AbortSignal", compiled)(exports, fetch, dev, abortSignal);
  return exports.sendMail;
}

test("login mail code copies as one six-digit word, including a leading zero", () => {
  const exports = {};
  new Function("exports", "fetch", "__DEV", "AbortSignal", compiled)(exports, () => assert.fail("template generation sends no mail"), false, AbortSignal);
  const login = exports.loginCodeMail({ to: "owner@example.test", code: "012345", origin: "https://brief.example.test" });
  const copyable = login.html.match(/<code\b[^>]*>([^<]+)<\/code>/);
  assert.ok(copyable, "the visible code is one text node");
  assert.equal(copyable[1], "012345");
  assert.equal(login.subject.split(" ")[0], "012345");
  assert.ok(login.text.split("\n").includes("012345"), "plain-text mail has a code-only line");
  assert.ok(!login.html.includes("012 345"));
});

function environment(extra = {}) {
  const cloudflare = [];
  const env = {
    EMAIL_FROM: "sender@example.test",
    EMAIL: { send: async (message) => { cloudflare.push(message); } },
    ...extra,
  };
  return { env, cloudflare };
}

const accepted = () => Response.json({ id: "5d14cd21-0c5c-4e6f-b729-52b850348afa" });
function assertPrivate(error) {
  assert.ok(error instanceof Error);
  for (const privateText of [fakeKey, mail.to, mail.html, mail.text, "private response body"]) {
    assert.ok(!error.message.includes(privateText), `error does not expose ${privateText}`);
  }
  assert.equal(error.cause, undefined);
  return true;
}

test("DEV with Mailpit never calls Resend or Cloudflare even when a Resend key exists", async () => {
  const calls = [];
  const sendMail = transport(async (url, init) => {
    calls.push({ url, init });
    return Response.json({ ID: "local-only" });
  }, { dev: true });
  const { env, cloudflare } = environment({ MAILPIT_URL: "http://127.0.0.1:8025/", RESEND_API_KEY: fakeKey });
  await sendMail(env, mail);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8025/api/v1/send");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    From: { Email: env.EMAIL_FROM, Name: "Design House" }, To: [{ Email: mail.to }],
    Subject: mail.subject, HTML: mail.html, Text: mail.text,
  });
  assert.equal(calls[0].init.headers.authorization, undefined);
  assert.equal(cloudflare.length, 0);
});

test("Mailpit failure stays local and redacts sensitive errors without a real-email fallback", async () => {
  const calls = [];
  const sendMail = transport(async (url) => {
    calls.push(url);
    throw new Error(`connection details ${fakeKey} ${mail.to} private response body`);
  }, { dev: true });
  const { env, cloudflare } = environment({ MAILPIT_URL: "http://127.0.0.1:8025", RESEND_API_KEY: fakeKey });
  await assert.rejects(sendMail(env, mail), (error) => {
    assert.match(error.message, /^Mailpit:/);
    return assertPrivate(error);
  });
  assert.deepEqual(calls, ["http://127.0.0.1:8025/api/v1/send"]);
  assert.equal(cloudflare.length, 0);
});

test("Resend receives authenticated HTTPS JSON and idempotency in the header only", async () => {
  let call;
  const timeouts = [];
  const sendMail = transport(async (url, init) => { call = { url, init }; return accepted(); }, {
    abortSignal: { timeout: (duration) => { timeouts.push(duration); return new AbortController().signal; } },
  });
  const { env, cloudflare } = environment({ RESEND_API_KEY: fakeKey, MAILPIT_URL: "http://127.0.0.1:8025" });
  const result = await sendMail(env, { ...mail, idempotencyKey: "brief-sent/test-brief/1" });
  assert.equal(result, undefined);
  assert.equal(call.url, "https://api.resend.com/emails");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.headers.authorization, `Bearer ${fakeKey}`);
  assert.equal(call.init.headers["content-type"], "application/json");
  assert.equal(call.init.headers["Idempotency-Key"], "brief-sent/test-brief/1");
  assert.deepEqual(JSON.parse(call.init.body), {
    from: `Design House <${env.EMAIL_FROM}>`, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text,
  });
  assert.ok(!call.init.body.includes(fakeKey));
  assert.ok(!call.init.body.includes("idempotencyKey"));
  assert.ok(call.init.signal instanceof AbortSignal);
  assert.deepEqual(timeouts, [15_000]);
  assert.equal(cloudflare.length, 0);
});

test("Resend omits idempotency header when caller has no stable key", async () => {
  const sendMail = transport(async (_url, init) => {
    assert.equal(init.headers["Idempotency-Key"], undefined);
    return accepted();
  });
  await sendMail(environment({ RESEND_API_KEY: fakeKey }).env, mail);
});

test("Resend HTTP failure reports status without reading or leaking provider messages", async () => {
  let readBody = false;
  const sendMail = transport(async () => ({
    ok: false, status: 422,
    json: async () => { readBody = true; return { message: `${fakeKey} ${mail.to} private response body` }; },
  }));
  const { env, cloudflare } = environment({ RESEND_API_KEY: fakeKey });
  await assert.rejects(sendMail(env, mail), (error) => {
    assert.match(error.message, /Resend:.*HTTP 422/);
    return assertPrivate(error);
  });
  assert.equal(readBody, false);
  assert.equal(cloudflare.length, 0);
});

test("Resend confirms a nonempty response id and rejects missing, wrong-type or malformed JSON", async () => {
  for (const body of [{}, { id: null }, { id: 123 }, { id: "   " }, null, []]) {
    const sendMail = transport(async () => Response.json(body));
    await assert.rejects(sendMail(environment({ RESEND_API_KEY: fakeKey }).env, mail), /Resend: brak potwierdzenia wysyłki/);
  }
  const sendMail = transport(async () => ({ ok: true, status: 200, json: async () => { throw new Error(`invalid JSON ${mail.to} ${fakeKey}`); } }));
  await assert.rejects(sendMail(environment({ RESEND_API_KEY: fakeKey }).env, mail), (error) => {
    assert.match(error.message, /niepoprawne potwierdzenie/);
    return assertPrivate(error);
  });
});

test("Resend network errors discard request details and provider exceptions", async () => {
  const sendMail = transport(async () => { throw new Error(`network request ${fakeKey} ${mail.to} ${mail.html} private response body`); });
  await assert.rejects(sendMail(environment({ RESEND_API_KEY: fakeKey }).env, mail), (error) => {
    assert.match(error.message, /^Resend: nie udało się połączyć/);
    return assertPrivate(error);
  });
});

test("Resend aborts after its configured timeout and exposes only a safe timeout message", async () => {
  const sendMail = transport(async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new Error(`request aborted ${fakeKey} ${mail.to}`)), { once: true });
  }), {
    abortSignal: { timeout: (duration) => {
      assert.equal(duration, 15_000);
      const controller = new AbortController();
      queueMicrotask(() => controller.abort());
      return controller.signal;
    } },
  });
  await assert.rejects(sendMail(environment({ RESEND_API_KEY: fakeKey }).env, mail), (error) => {
    assert.match(error.message, /Resend: przekroczono czas wysyłki/);
    return assertPrivate(error);
  });
});

test("without a Resend key production falls back to Cloudflare and ignores local Mailpit", async () => {
  const sendMail = transport(async () => assert.fail("no HTTP transport is needed"));
  const { env, cloudflare } = environment({ MAILPIT_URL: "http://127.0.0.1:8025" });
  await sendMail(env, mail);
  assert.deepEqual(cloudflare, [{ to: mail.to, from: { email: env.EMAIL_FROM, name: "Design House" }, subject: mail.subject, html: mail.html, text: mail.text }]);
});

test("Cloudflare failures also hide recipient and message data from outer logs", async () => {
  const sendMail = transport(async () => assert.fail("no HTTP transport is needed"));
  const { env } = environment({ EMAIL: { send: async () => { throw new Error(`provider details ${mail.to} ${mail.html}`); } } });
  await assert.rejects(sendMail(env, mail), (error) => {
    assert.match(error.message, /^Cloudflare Email Service:/);
    return assertPrivate(error);
  });
});

test("the Resend secret is referenced only on the server, never in client sources", () => {
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) inspect(path);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) assert.ok(!readFileSync(path, "utf8").includes("RESEND_API_KEY"), `${entry.name} does not reference the mail secret`);
    }
  }
  inspect(new URL("../src/client/", import.meta.url));
});
