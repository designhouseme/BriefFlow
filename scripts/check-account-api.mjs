// Reversible integration checks against vite dev. Every fixture belongs to synthetic accounts.
// Run: node scripts/check-account-api.mjs [http://localhost:5173]
import assert from "node:assert/strict";

const base = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const origin = new URL(base).origin;
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) throw new Error("These checks only run against a local development server.");
const run = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const logo = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGNU9a9jYGBgYgADAAspAPbEZzy/AAAAAElFTkSuQmCC", "base64");
const fixtures = { briefs: [], templates: [] };

async function request(path, { method = "GET", cookie, data, body, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(method !== "GET" ? { origin } : {}), ...(data !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: data !== undefined ? JSON.stringify(data) : body,
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  let json;
  if (response.headers.get("content-type")?.includes("application/json")) json = JSON.parse(new TextDecoder().decode(bytes));
  return { status: response.status, headers: response.headers, json, bytes };
}

async function login(prefix) {
  const email = `${prefix}-${run}@example.test`;
  assert.equal((await request("/api/auth/start", { method: "POST", data: { email }, headers: { origin: "https://other.example" } })).status, 400);
  assert.equal((await request("/api/auth/start", { method: "POST", data: { email }, headers: { origin: "" } })).status, 400);
  const starts = await Promise.all([request("/api/auth/start", { method: "POST", data: { email } }), request("/api/auth/start", { method: "POST", data: { email } })]);
  assert.deepEqual(starts.map((result) => result.status).sort(), [200, 429], "concurrent code requests cannot bypass resend limit");
  const started = starts.find((result) => result.status === 200);
  assert.equal(started.status, 200);
  assert.equal(typeof started.json.devCode, "string", "Run these checks only with the local vite dev build (production must not return devCode).");
  assert.equal((await request("/api/auth/start", { method: "POST", data: { email } })).status, 429);
  assert.equal((await request("/api/auth/verify", { method: "POST", data: { email, code: started.json.devCode }, headers: { origin: "https://other.example" } })).status, 400);
  const verifications = await Promise.all([request("/api/auth/verify", { method: "POST", data: { email, code: started.json.devCode } }), request("/api/auth/verify", { method: "POST", data: { email, code: started.json.devCode } })]);
  assert.deepEqual(verifications.map((result) => result.status).sort(), [200, 401], "concurrent verification cannot redeem one code twice");
  const verified = verifications.find((result) => result.status === 200);
  assert.equal(verified.status, 200);
  const cookie = verified.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  assert.equal((await request("/api/auth/verify", { method: "POST", data: { email, code: started.json.devCode } })).status, 401, "login code cannot be replayed");
  assert.equal((await request("/api/auth/logout", { method: "POST", cookie, data: {}, headers: { origin: "https://other.example" } })).status, 400);
  const me = await request("/api/me", { cookie });
  assert.equal(me.json.email, email);
  return cookie;
}

async function socket(brief) {
  const url = new URL(`/agents/brief-agent/${brief.id}`, base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("k", brief.clientToken);
  const ws = new WebSocket(url);
  const pending = new Map();
  let state;
  let stateResolve;
  let stateReject;
  const stateReady = new Promise((resolve, reject) => { stateResolve = resolve; stateReject = reject; });
  const timer = setTimeout(() => stateReject(new Error("Timed out waiting for brief state")), 15_000);
  ws.addEventListener("error", () => stateReject(new Error("Brief WebSocket failed")));
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "cf_agent_state") { state = message.state; clearTimeout(timer); stateResolve(state); }
    if (message.type === "rpc" && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id); clearTimeout(timer); pending.delete(message.id);
      if (message.success === false || message.error) reject(new Error(message.error ?? "RPC failed")); else resolve(message.result);
    }
  });
  await stateReady;
  return { get state() { return state; }, close() { ws.close(); }, async call(method, args) {
    const id = crypto.randomUUID();
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC ${method} timed out`)); }, 15_000);
      pending.set(id, { resolve, reject, timer });
    });
    ws.send(JSON.stringify({ type: "rpc", id, method, args }));
    return promise;
  } };
}

const owner = await login("backend-owner");
const stranger = await login("backend-stranger");
const lockedEmail = `backend-attempt-limit-${run}@example.test`;
const lockCode = await request("/api/auth/start", { method: "POST", data: { email: lockedEmail } });
assert.equal(lockCode.status, 200);
const wrongCode = lockCode.json.devCode === "000000" ? "111111" : "000000";
for (let i = 0; i < 5; i++) assert.equal((await request("/api/auth/verify", { method: "POST", data: { email: lockedEmail, code: wrongCode } })).status, 401);
const locked = await request("/api/auth/verify", { method: "POST", data: { email: lockedEmail, code: lockCode.json.devCode } });
assert.equal(locked.status, 401); assert.match(locked.json.error, /Za dużo prób/);
let originalSocket;
let clonedSocket;
let quotaSocket;
try {
  const created = await request("/api/briefs", { method: "POST", cookie: owner, data: { templateId: "www", title: "Backend verification", clientName: "Private fixture" } });
  assert.equal(created.status, 201); fixtures.briefs.push(created.json.id);
  const listed = await request("/api/briefs", { cookie: owner });
  const original = listed.json.find((item) => item.id === created.json.id); assert.ok(original);
  originalSocket = await socket(original);
  await assert.rejects(originalSocket.call("templateSnapshot", ["not-an-owner"]), "Worker-only snapshot RPC cannot be called over a client WebSocket");
  await assert.rejects(originalSocket.call("ownerKeyForToken", [original.clientToken]), "Worker-only owner metadata cannot be called over a client WebSocket");
  await originalSocket.call("setAnswer", ["f_nazwa", { status: "answered", value: "This answer must not become template data" }]);

  const concurrent = await Promise.all(Array.from({ length: 6 }, (_, index) => request("/api/briefs", { method: "POST", cookie: owner, data: { templateId: "www", title: `Quota fixture ${index}` } })));
  const accepted = concurrent.filter((result) => result.status === 201);
  assert.equal(accepted.length, 2, "original plus exactly two concurrently created briefs fits three active slots");
  assert.equal(concurrent.filter((result) => result.status === 429).length, 4);
  for (const result of accepted) fixtures.briefs.push(result.json.id);
  let usage = await request("/api/account/usage", { cookie: owner });
  assert.equal(usage.json.briefs.used, 3); assert.equal(usage.json.briefs.limit, 3);
  assert.equal(usage.json.ai.used, 0); assert.equal(usage.json.ai.limit, 10); assert.ok(usage.json.ai.resetsAt > Date.now());
  assert.deepEqual((await request("/api/me", { cookie: owner })).json.usage, usage.json);
  const quotaBrief = (await request("/api/briefs", { cookie: owner })).json.find((item) => item.id === accepted[0].json.id);
  quotaSocket = await socket(quotaBrief);
  await quotaSocket.call("complete", []);
  const completedAt = quotaSocket.state.completedAt; assert.ok(completedAt);
  usage = await request("/api/account/usage", { cookie: owner }); assert.equal(usage.json.briefs.used, 2);
  assert.ok((await request("/api/briefs", { cookie: owner })).json.some((item) => item.id === quotaBrief.id && item.completedAt), "completion retains the brief in history");
  await quotaSocket.call("setAnswer", ["f_nazwa", { status: "answered", value: "Editing completed history must not reopen it" }]);
  assert.equal(quotaSocket.state.completedAt, completedAt);
  assert.equal((await request("/api/account/usage", { cookie: owner })).json.briefs.used, 2);

  assert.equal((await request(`/api/briefs/${original.id}/access`, { cookie: stranger })).status, 404);
  assert.equal((await request(`/api/briefs/${original.id}`, { method: "DELETE", cookie: stranger })).status, 404);
  assert.equal((await request("/api/account/templates", { method: "POST", cookie: stranger, data: { briefId: original.id, title: "Not mine" } })).status, 404);

  assert.equal((await request("/api/account/logo", { method: "PUT", cookie: owner, body: logo, headers: { "content-type": "image/png", origin: "https://other.example" } })).status, 403);
  assert.equal((await request("/api/account/logo", { method: "PUT", cookie: owner, body: "<svg/>", headers: { "content-type": "image/svg+xml" } })).status, 400);
  assert.equal((await request("/api/account/logo", { method: "PUT", cookie: owner, body: logo, headers: { "content-type": "image/jpeg" } })).status, 400);
  assert.equal((await request("/api/account/logo", { method: "PUT", cookie: owner, body: new Uint8Array(512 * 1024 + 1), headers: { "content-type": "image/png" } })).status, 413);
  const uploaded = await request("/api/account/logo", { method: "PUT", cookie: owner, body: logo, headers: { "content-type": "image/png" } });
  assert.equal(uploaded.status, 200); assert.ok(uploaded.json.logoUrl);
  const ownImage = await request(uploaded.json.logoUrl, { cookie: owner });
  assert.equal(ownImage.status, 200); assert.deepEqual(Buffer.from(ownImage.bytes), logo);
  assert.equal(ownImage.headers.get("cache-control"), "private, no-store"); assert.equal(ownImage.headers.get("x-content-type-options"), "nosniff");
  const access = await request(`/api/briefs/${original.id}/access?k=${original.clientToken}`);
  assert.equal(access.status, 200); assert.equal(access.json.role, "client"); assert.ok(access.json.logoUrl);
  assert.equal((await request(access.json.logoUrl)).status, 200);
  assert.equal((await request(`/api/briefs/${original.id}/logo?k=wrong`)).status, 404);
  assert.equal((await request(`/api/briefs/${original.id}/logo`, { cookie: stranger })).status, 404);

  const saved = await request("/api/account/templates", { method: "POST", cookie: owner, data: { briefId: original.id, title: "Reusable fixture", description: "Question structure only" } });
  assert.equal(saved.status, 201); fixtures.templates.push(saved.json.id);
  assert.equal(saved.json.sections, undefined);
  assert.equal((await request("/api/account/templates", { cookie: owner })).json[0].id, saved.json.id);
  assert.deepEqual((await request("/api/account/templates", { cookie: stranger })).json, []);
  assert.equal((await request("/api/briefs", { method: "POST", cookie: stranger, data: { templateId: saved.json.id } })).status, 400);
  assert.equal((await request(`/api/account/templates/${saved.json.id}`, { method: "DELETE", cookie: stranger })).status, 404);
  assert.equal((await request("/api/account/templates", { method: "POST", cookie: owner, data: { briefId: original.id, title: "Bad origin" }, headers: { origin: "https://other.example" } })).status, 403);

  const copy = await request("/api/briefs", { method: "POST", cookie: owner, data: { templateId: saved.json.id } });
  assert.equal(copy.status, 201); fixtures.briefs.push(copy.json.id);
  const copiedSummary = (await request("/api/briefs", { cookie: owner })).json.find((item) => item.id === copy.json.id);
  clonedSocket = await socket(copiedSummary);
  const cloned = clonedSocket.state;
  assert.equal(cloned.title, "Reusable fixture"); assert.equal(cloned.clientName, ""); assert.deepEqual(cloned.answers, {}); assert.equal(cloned.completedAt, undefined); assert.equal(cloned.canUndo, false);
  const originals = new Set(originalSocket.state.sections.flatMap((section) => [section.id, ...section.fields.map((field) => field.id)]));
  const fields = cloned.sections.flatMap((section) => section.fields);
  for (const section of cloned.sections) assert.ok(!originals.has(section.id));
  for (const field of fields) assert.ok(!originals.has(field.id));
  const fieldMap = new Map(fields.map((field) => [field.id, field]));
  for (const condition of [...cloned.sections.map((section) => section.showIf), ...fields.map((field) => field.showIf)].filter(Boolean)) {
    const source = fieldMap.get(condition.fieldId); assert.ok(source);
    if (source.type !== "yes_no") assert.ok(source.options.some((option) => option.id === condition.equals));
  }
  // Enforce the account storage limit under live Durable Object RPC, then clean every fixture.
  for (let i = 1; i < 50; i++) {
    const result = await request("/api/account/templates", { method: "POST", cookie: owner, data: { briefId: original.id, title: `Limit fixture ${i}` } });
    assert.equal(result.status, 201); fixtures.templates.push(result.json.id);
  }
  const limited = await request("/api/account/templates", { method: "POST", cookie: owner, data: { briefId: original.id, title: "Over limit" } });
  assert.equal(limited.status, 400); assert.match(limited.json.error, /50/);
  assert.equal((await request("/api/account/logo", { method: "DELETE", cookie: owner, headers: { origin: "https://other.example" } })).status, 403);
  assert.equal((await request("/api/account/logo", { method: "DELETE", cookie: owner })).status, 200);
  assert.equal((await request(`/api/briefs/${original.id}/access?k=${original.clientToken}`)).json.logoUrl, undefined);
  assert.equal((await request(access.json.logoUrl)).status, 404);
  console.log("Account API checks passed: auth Origin/replay/attempt limits, isolated ownership, active-brief concurrency caps/completion/history, usage contract, logo security/validation, private RPC protection, template snapshots/cloning/limits, logo refresh.");
} finally {
  originalSocket?.close(); clonedSocket?.close(); quotaSocket?.close();
  for (const id of fixtures.templates) await request(`/api/account/templates/${id}`, { method: "DELETE", cookie: owner });
  for (const id of fixtures.briefs) await request(`/api/briefs/${id}`, { method: "DELETE", cookie: owner });
  assert.equal((await request("/api/account/usage", { cookie: owner })).json.briefs.used, 0);
  await request("/api/account/logo", { method: "DELETE", cookie: owner });
  await request("/api/auth/logout", { method: "POST", cookie: owner, data: {} });
  await request("/api/auth/logout", { method: "POST", cookie: stranger, data: {} });
  console.log("Synthetic brief/template/logo fixtures removed.");
}
