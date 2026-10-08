import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
class ApiError extends Error {
  constructor(message, status, data = {}) { super(message); this.status = status; this.data = data; }
}
const event = () => ({ preventDefault() {} });
const settle = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

// Run the real form handlers and JSX with persistent React state/refs and a
// controlled API. No mail transport, account credentials or browser requests.
function auth({ step = "code", code = "", send, verify } = {}) {
  const sourceText = readFileSync(new URL("../src/client/AuthForm.tsx", import.meta.url), "utf8");
  const source = ts.createSourceFile("AuthForm.tsx", sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "AuthForm");
  assert.ok(declaration);
  const componentText = declaration.getText(source).replace(/^export\s+/, "");
  const compiled = ts.transpileModule(componentText, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    fileName: "AuthForm.tsx",
  }).outputText;
  const state = [step, "qa@example.test", code, "", "", false, 0];
  const refs = [];
  let stateSlot = 0;
  let refSlot = 0;
  const calls = { start: [], verify: [], done: [], focus: 0 };
  const bindings = {
    exports: {}, ApiError,
    useId: () => "auth-test",
    useEffect: () => {},
    useState: (initial) => {
      const index = stateSlot++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (next) => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
    },
    useRef: (initial) => {
      const index = refSlot++;
      return refs[index] ??= { current: initial };
    },
    ...Object.fromEntries([...new Set(componentText.match(/\bIcon[A-Za-z0-9_]+\b/g))].map((icon) => [icon, "svg"])),
    startLogin: (email) => { calls.start.push(email); return send?.() ?? Promise.resolve({ ok: true }); },
    verifyLogin: (email, value) => { calls.verify.push({ email, code: value }); return verify?.() ?? Promise.resolve({ email }); },
  };
  const AuthForm = new Function(...Object.keys(bindings), "require", `${compiled}\nreturn AuthForm;`)(...Object.values(bindings), require);
  const render = () => {
    stateSlot = 0; refSlot = 0;
    const tree = AuthForm({ onDone: (email) => calls.done.push(email) });
    const codeInput = nodes(tree).find((node) => node.props?.className === "auth-code");
    if (codeInput) codeInput.props.ref.current = { focus: () => calls.focus++ };
    return tree;
  };
  return { calls, state, render };
}

function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const codeInput = (tree) => nodes(tree).find((node) => node.props?.className === "auth-code");
const sendButton = (tree) => nodes(tree).find((node) => node.type === "button" && node.props.className === "btn-send");
const textOf = (tree) => typeof tree === "string" || typeof tree === "number" ? String(tree) : Array.isArray(tree) ? tree.map(textOf).join("") : tree?.props ? textOf(tree.props.children) : "";

for (const pasted of ["123456", "123 456", "123\n456", " \r\n123 \t456 \n"]) {
  test(`OTP paste ${JSON.stringify(pasted)} normalizes all six digits before verifying`, async () => {
    const h = auth();
    const input = codeInput(h.render());
    // Native maxLength applies before onChange; model that boundary to catch
    // the original spaced-code regression as well as the handler behavior.
    const nativeValue = input.props.maxLength === undefined ? pasted : pasted.slice(0, input.props.maxLength);
    input.props.onChange({ target: { value: nativeValue } });
    await settle();
    assert.equal(h.state[2], "123456");
    assert.deepEqual(h.calls.verify, [{ email: "qa@example.test", code: "123456" }]);
    assert.deepEqual(h.calls.done, ["qa@example.test"]);
  });
}

test("incomplete input never verifies, and normalization keeps only six digits", async () => {
  const h = auth();
  codeInput(h.render()).props.onChange({ target: { value: "12 345" } });
  assert.equal(h.state[2], "12345");
  assert.equal(h.calls.verify.length, 0);
  assert.equal(sendButton(h.render()).props.disabled, true);
  codeInput(h.render()).props.onChange({ target: { value: "1234567" } });
  await settle();
  assert.equal(h.calls.verify[0].code, "123456");
});

test("automatic verification and an immediate form submit send only one request", async () => {
  const pending = deferred();
  const h = auth({ code: "123456", verify: () => pending.promise });
  const beforeReactRerenders = h.render();
  codeInput(beforeReactRerenders).props.onChange({ target: { value: "123 456" } });
  beforeReactRerenders.props.onSubmit(event());
  codeInput(beforeReactRerenders).props.onChange({ target: { value: "123456" } });
  assert.equal(h.calls.verify.length, 1);
  assert.equal(sendButton(h.render()).props.disabled, true);
  assert.equal(codeInput(h.render()).props.disabled, true);
  pending.resolve({ email: "qa@example.test" });
  await settle();
  beforeReactRerenders.props.onSubmit(event());
  assert.equal(h.calls.verify.length, 1);
  assert.equal(h.calls.done.length, 1);
});

for (const failure of [new ApiError("Brak połączenia. Spróbuj ponownie.", 0), new ApiError("Spróbuj za chwilę.", 503), new ApiError("Spróbuj za chwilę.", 429), new TypeError("Błąd połączenia.")]) {
  test(`recoverable ${failure.name}/${failure.status ?? "transport"} failure preserves the code and allows manual retry`, async () => {
    let attempts = 0;
    const h = auth({ verify: () => ++attempts === 1 ? Promise.reject(failure) : Promise.resolve({ email: "qa@example.test" }) });
    codeInput(h.render()).props.onChange({ target: { value: "123 456" } });
    await settle();
    const retryForm = h.render();
    assert.equal(h.state[2], "123456");
    assert.equal(sendButton(retryForm).props.disabled, false);
    assert.equal(codeInput(retryForm).props.disabled, false);
    assert.equal(h.calls.done.length, 0);
    assert.match(textOf(retryForm), new RegExp(failure.message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    retryForm.props.onSubmit(event());
    await settle();
    assert.equal(h.calls.verify.length, 2);
    assert.equal(h.calls.verify[1].code, "123456");
    assert.equal(h.calls.done.length, 1);
  });
}

for (const status of [400, 401]) {
  test(`confirmed invalid OTP ${status} clears input and releases the submit guard`, async () => {
    let attempts = 0;
    const h = auth({ verify: () => ++attempts === 1 ? Promise.reject(new ApiError("To nie ten kod.", status)) : Promise.resolve({ email: "qa@example.test" }) });
    codeInput(h.render()).props.onChange({ target: { value: "123456" } });
    await settle();
    assert.equal(h.state[2], "");
    assert.equal(h.calls.focus, 1);
    codeInput(h.render()).props.onChange({ target: { value: "654321" } });
    await settle();
    assert.equal(h.calls.verify.length, 2);
    assert.equal(h.calls.verify[1].code, "654321");
    assert.equal(h.calls.done.length, 1);
  });
}

test("sending a code has a synchronous duplicate-submit guard and a retry after failure", async () => {
  const pending = deferred();
  let attempts = 0;
  const h = auth({ step: "email", send: () => ++attempts === 1 ? pending.promise : Promise.resolve({ ok: true }) });
  const beforeReactRerenders = h.render();
  const first = beforeReactRerenders.props.onSubmit(event());
  await beforeReactRerenders.props.onSubmit(event());
  assert.equal(h.calls.start.length, 1);
  pending.reject(new ApiError("Brak połączenia.", 0));
  await first;
  assert.equal(h.state[1], "qa@example.test");
  assert.equal(sendButton(h.render()).props.disabled, false);
  await h.render().props.onSubmit(event());
  assert.equal(h.calls.start.length, 2);
  assert.equal(h.state[0], "code");
  assert.equal(h.state[6], 30);
  const resend = nodes(h.render()).find((node) => node.type === "button" && textOf(node).startsWith("Wyślij ponownie"));
  assert.equal(resend.props.disabled, true);
  await resend.props.onClick();
  assert.equal(h.calls.start.length, 2);
});

test("a rate limit after a failed send keeps the email step honest and allows explicit entry of an earlier code", async () => {
  let attempts = 0;
  const h = auth({ step: "email", send: () => Promise.reject(++attempts === 1
    ? new ApiError("Nie można połączyć się z BriefFlow.", 0)
    : new ApiError("Następny kod możesz zamówić za 23 s.", 429, { retryAfter: 23 })) });
  await h.render().props.onSubmit(event());
  assert.equal(h.state[0], "email");
  await h.render().props.onSubmit(event());
  const limited = h.render();
  assert.equal(h.state[0], "email");
  assert.equal(codeInput(limited), undefined);
  assert.match(textOf(limited), /Następny kod możesz zamówić za 23 s/);
  assert.doesNotMatch(textOf(limited), /Wpisz kod wysłany|Kod już wysłany/);
  assert.match(textOf(sendButton(limited)), /Wyślij kod za 23 s/);
  assert.equal(sendButton(limited).props.disabled, true);
  await limited.props.onSubmit(event());
  assert.equal(h.calls.start.length, 2, "the email handler enforces the visible cooldown");
  const enter = nodes(limited).find((node) => node.type === "button" && textOf(node) === "Mam kod z maila");
  assert.ok(enter);
  enter.props.onClick();
  assert.equal(h.state[0], "code");
  assert.ok(codeInput(h.render()));
  assert.equal(h.calls.start.length, 2);
  assert.equal(h.calls.verify.length, 0);
});

test("a new address resets the failed-send cooldown while case and surrounding spaces do not bypass it", async () => {
  let attempts = 0;
  const h = auth({ step: "email", send: () => ++attempts === 1
    ? Promise.reject(new ApiError("Następny kod możesz zamówić za 23 s.", 429, { retryAfter: 23 }))
    : Promise.resolve({ ok: true }) });
  await h.render().props.onSubmit(event());
  nodes(h.render()).find((node) => node.type === "input").props.onChange({ target: { value: " QA@EXAMPLE.TEST " } });
  await h.render().props.onSubmit(event());
  assert.equal(h.state[6], 23);
  assert.equal(h.calls.start.length, 1);
  nodes(h.render()).find((node) => node.type === "input").props.onChange({ target: { value: "other@example.test" } });
  const changed = h.render();
  assert.equal(h.state[6], 0);
  assert.equal(sendButton(changed).props.disabled, false);
  assert.equal(nodes(changed).some((node) => node.props?.role === "alert"), false);
  assert.equal(nodes(changed).some((node) => node.type === "button" && textOf(node) === "Mam kod z maila"), false);
  await changed.props.onSubmit(event());
  assert.deepEqual(h.calls.start, ["qa@example.test", "other@example.test"]);
  assert.equal(h.state[0], "code");
});

test("a confirmed delivery failure remains a visible email error with an immediately available retry", async () => {
  const h = auth({ step: "email", send: () => Promise.reject(new ApiError("Nie udało się wysłać maila. Spróbuj za chwilę.", 502)) });
  await h.render().props.onSubmit(event());
  const failed = h.render();
  assert.equal(h.state[0], "email");
  assert.match(textOf(failed), /Nie udało się wysłać maila/);
  assert.equal(sendButton(failed).props.disabled, false);
  assert.equal(codeInput(failed), undefined);
  assert.equal(nodes(failed).some((node) => node.type === "button" && textOf(node) === "Mam kod z maila"), false);
});

for (const retryAfter of [undefined, -1, "invalid", Infinity]) {
  test(`malformed retryAfter ${String(retryAfter)} cannot silently enter the code step or lock the form`, async () => {
    const h = auth({ step: "email", send: () => Promise.reject(new ApiError("Spróbuj ponownie za chwilę.", 429, { retryAfter })) });
    await h.render().props.onSubmit(event());
    const failed = h.render();
    assert.equal(h.state[0], "email");
    assert.equal(h.state[6], 0);
    assert.equal(sendButton(failed).props.disabled, false);
    assert.match(textOf(failed), /Spróbuj ponownie za chwilę/);
  });
}

test("a resend rate limit preserves an earlier code and displays the server error", async () => {
  const h = auth({ code: "123456", send: () => Promise.reject(new ApiError("Następny kod możesz zamówić za 23 s.", 429, { retryAfter: 23 })) });
  const resend = nodes(h.render()).find((node) => node.type === "button" && textOf(node) === "Wyślij ponownie");
  await resend.props.onClick();
  const limited = h.render();
  assert.equal(h.state[0], "code");
  assert.equal(h.state[2], "123456");
  assert.match(textOf(limited), /Następny kod możesz zamówić za 23 s/);
  assert.match(textOf(limited), /Wyślij ponownie za 23 s/);
  assert.equal(sendButton(limited).props.disabled, false, "entering an earlier code is still possible");
  assert.equal(h.calls.verify.length, 0);
});
