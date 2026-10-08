// Run against a separately built Worker in local Wrangler mode, never the deployed service.
// Run: node scripts/check-production-auth.mjs [http://localhost:5174]
import assert from "node:assert/strict";
const base = (process.argv[2] ?? "http://localhost:5174").replace(/\/$/, "");
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) throw new Error("Production auth checks require a local Worker with local email simulation.");
const origin = new URL(base).origin;
async function request(path, { method = "GET", data, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(method !== "GET" ? { origin } : {}), ...(data !== undefined ? { "content-type": "application/json" } : {}), ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
  let json;
  if (response.headers.get("content-type")?.includes("application/json")) json = await response.json(); else await response.text();
  return { status: response.status, json };
}
for (const path of ["/api/me", "/api/briefs", "/api/account/logo", "/api/account/templates", "/api/briefs/Abcdef123456/access", "/api/briefs/Abcdef123456/logo"]) {
  assert.equal((await request(path)).status, 401, `unauthenticated ${path}`);
}
assert.equal((await request("/api/dev/emails", { method: "POST", data: {} })).status, 404);
assert.equal((await request("/api/briefs/Abcdef123456/access?k=wrong")).status, 404);
assert.equal((await request("/api/briefs/Abcdef123456/logo?k=wrong")).status, 404);
assert.equal((await request("/api/templates")).status, 200);
assert.equal((await request("/api/auth/start", { method: "POST", data: { email: "nobody@example.test" }, headers: { origin: "https://other.example" } })).status, 400);
const email = `production-auth-check-${Date.now()}@example.test`;
const started = await request("/api/auth/start", { method: "POST", data: { email } });
assert.equal(started.status, 200, "local email simulation should accept a login email");
assert.equal(started.json.devCode, undefined, "production must never return the login code");
assert.equal((await request("/api/auth/start", { method: "POST", data: { email } })).status, 429);
assert.equal((await request("/api/auth/verify", { method: "POST", data: { email, code: "invalid" } })).status, 400);
console.log("Production Worker auth checks passed: unauthenticated data blocked, no dev login or mail endpoint, local login email succeeds without exposing code, resend throttling.");
