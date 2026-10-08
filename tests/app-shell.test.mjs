import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
const me = {
  email: "qa@example.test",
  usage: { briefs: { used: 1, limit: 3 }, ai: { used: 2, limit: 10, resetsAt: Date.UTC(2026, 9, 31, 23) } },
};

// Execute the production component and its real load effect. Persistent hooks
// model subsequent renders; account APIs and browser timers remain controlled.
function shell(responses, primed = null) {
  const sourceText = readFileSync(new URL("../src/client/AppShell.tsx", import.meta.url), "utf8");
  const source = ts.createSourceFile("AppShell.tsx", sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "AppShell");
  assert.ok(declaration);
  const compiled = ts.transpileModule(declaration.getText(source).replace(/^export\s+/, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    fileName: "AppShell.tsx",
  }).outputText;
  const hooks = [];
  const effects = [];
  let slot = 0;
  const calls = { me: 0, routes: [] };
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const memo = (calculate, deps) => {
    const index = slot++;
    if (!hooks[index] || !sameDeps(hooks[index].deps, deps)) hooks[index] = { deps, value: calculate() };
    return hooks[index].value;
  };
  const bindings = {
    exports: {}, ApiError,
    useState: (initial) => {
      const index = slot++;
      if (!hooks[index]) hooks[index] = { value: typeof initial === "function" ? initial() : initial };
      return [hooks[index].value, (next) => { hooks[index].value = typeof next === "function" ? next(hooks[index].value) : next; }];
    },
    useRef: (initial) => {
      const index = slot++;
      return hooks[index] ??= { current: initial };
    },
    useMemo: memo,
    useCallback: (callback, deps) => memo(() => callback, deps),
    useEffect: (effect, deps) => {
      const index = slot++;
      if (!hooks[index] || !sameDeps(hooks[index].deps, deps)) {
        const previous = hooks[index];
        const next = hooks[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); next.cleanup = effect(); });
      }
    },
    getMe: () => { const response = responses[calls.me++]; assert.ok(response, "unexpected account request"); return response(); },
    takePrimedMe: () => primed,
    primeMe: (next) => { primed = next; },
    getAccountUsage: async () => me.usage,
    listBriefs: async () => [],
    listSavedTemplates: async () => [],
    navigate: (to, options) => calls.routes.push({ to, options }),
    AppContext: { Provider: "AppProvider" }, DhTile: "DhTile", Rail: "Rail", Sidebar: "Sidebar",
    document: { visibilityState: "visible" },
    window: { addEventListener() {}, removeEventListener() {} },
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
  };
  const AppShell = new Function(...Object.keys(bindings), "require", `${compiled}\nreturn AppShell;`)(...Object.values(bindings), require);
  return {
    calls,
    render: () => { slot = 0; return AppShell({ activeId: null, children: "Briefy konta" }); },
    commitEffects: () => { while (effects.length) effects.shift()(); },
  };
}

function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const textOf = (tree) => typeof tree === "string" || typeof tree === "number" ? String(tree) : Array.isArray(tree) ? tree.map(textOf).join("") : tree?.props ? textOf(tree.props.children) : "";

test("initial network failure shows an account error and retry; retry loads the matching account", async () => {
  let resolveRetry;
  const retry = new Promise((resolve) => { resolveRetry = resolve; });
  const h = shell([
    () => Promise.reject(new ApiError("Nie można połączyć się z BriefFlow. Sprawdź połączenie i spróbuj ponownie.", 0)),
    () => retry,
  ]);
  const initial = h.render();
  assert.equal(initial.props["aria-busy"], true);
  assert.match(textOf(initial), /Wczytuję konto/);
  h.commitEffects();
  await settle();
  const failed = h.render();
  assert.equal(failed.props["aria-busy"], false);
  assert.match(textOf(failed), /Nie udało się wczytać konta/);
  assert.match(nodes(failed).find((node) => node.props?.role === "alert").props.children, /Sprawdź połączenie/);
  const retryButton = nodes(failed).find((node) => node.type === "button" && textOf(node) === "Spróbuj ponownie");
  assert.ok(retryButton);
  retryButton.props.onClick();
  const loading = h.render();
  assert.equal(h.calls.me, 2);
  assert.equal(loading.props["aria-busy"], true);
  assert.match(textOf(loading), /Wczytuję konto/);
  assert.equal(nodes(loading).some((node) => node.props?.role === "alert"), false);
  assert.equal(nodes(loading).some((node) => node.type === "button"), false);
  resolveRetry(me);
  await settle();
  const loaded = h.render();
  assert.equal(loaded.type, "AppProvider");
  assert.equal(loaded.props.value.me, me);
  assert.equal(loaded.props.value.usage, me.usage);
  assert.match(textOf(loaded), /Briefy konta/);
  assert.equal(nodes(loaded).some((node) => node.props?.className === "toast"), false);
  assert.deepEqual(h.calls.routes, []);
});

test("an unauthenticated account response redirects to login without suggesting a network retry", async () => {
  const h = shell([() => Promise.reject(new ApiError("Nie jesteś zalogowany.", 401))]);
  h.render(); h.commitEffects();
  await settle();
  assert.deepEqual(h.calls.routes, [{ to: "/", options: { replace: true } }]);
  assert.equal(nodes(h.render()).some((node) => node.props?.role === "alert"), false);
});

test("a failed background account check preserves an already loaded account and shows its error", async () => {
  const h = shell([() => Promise.reject(new ApiError("Serwer nie odpowiedział na czas. Spróbuj ponownie.", 0))], me);
  assert.equal(h.render().props.value.me, me);
  h.commitEffects(); await settle();
  const current = h.render();
  assert.equal(current.type, "AppProvider");
  assert.equal(current.props.value.me, me);
  assert.match(textOf(current), /Briefy konta/);
  const toast = nodes(current).find((node) => node.props?.className === "toast");
  assert.match(textOf(toast), /Serwer nie odpowiedział na czas/);
  assert.deepEqual(h.calls.routes, []);
});
