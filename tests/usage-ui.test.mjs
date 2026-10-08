import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const monthlyUsage = (active = 0, aiUsed = 0) => ({
  briefs: { used: active, limit: 3 },
  ai: { used: aiUsed, limit: 10, resetsAt: Date.UTC(2026, 9, 31, 23) },
  smartBriefs: { used: 0, limit: 3 },
});

// Exercise the production components' form handlers and JSX gates. Browser-only
// effects are skipped; state, account API and brief RPC are controlled per case.
function component(name, filename, bindings, initialState = []) {
  const text = readFileSync(new URL(filename, import.meta.url), "utf8");
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `${name} production component exists`);
  const componentText = declaration.getText(source).replace(/^export\s+/, "");
  const compiled = ts.transpileModule(componentText, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    fileName: "component.tsx",
  }).outputText;
  const state = [...initialState];
  let slot = 0;
  const dependencies = {
    exports: {},
    useState: (initial) => {
      const index = slot++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (next) => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
    },
    useEffect: () => {},
    useCallback: (callback) => callback,
    useMemo: (calculate) => calculate(),
    useRef: (current) => ({ current }),
    ...Object.fromEntries([...new Set(componentText.match(/\bIcon[A-Za-z0-9_]+\b/g))].map((icon) => [icon, "svg"])),
    ...bindings,
  };
  const renderComponent = new Function(...Object.keys(dependencies), "require", `${compiled}\nreturn ${name};`)(...Object.values(dependencies), require);
  return { state, render: (props) => { slot = 0; return renderComponent(props); } };
}

function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const textOf = (tree) => typeof tree === "string" || typeof tree === "number" ? String(tree) : Array.isArray(tree) ? tree.map(textOf).join("") : tree?.props ? textOf(tree.props.children) : "";
const submitEvent = () => ({ preventDefault() {} });

function home(appPatch = {}) {
  const calls = { create: [], usage: 0, notifications: [], routes: [] };
  const app = {
    me: { email: "qa@example.test" }, briefs: [], templates: [], templatesLoaded: true, templatesError: "",
    usage: monthlyUsage(), usageError: "", refresh: () => {}, refreshTemplates: () => {},
    notify: (message) => calls.notifications.push(message),
    refreshUsage: async () => { calls.usage++; },
    ...appPatch,
  };
  const view = component("Home", "../src/client/Home.tsx", {
    useApp: () => app,
    TEMPLATE_LIST: [{ id: "www", title: "Strona WWW" }, { id: "empty", title: "Pusty brief" }],
    templateSize: () => ({ count: 10, minutes: 2 }),
    MainHead: "header", ShaderOrb: "span", SmartBriefCreator: "SmartBriefCreator", firstName: () => "Qa", briefName: (b) => b.title,
    pct: () => 0, when: () => "dziś", onLinkClick: () => {}, deleteTemplate: async () => {},
    createBrief: async (input) => { calls.create.push(input); return { id: "created-test" }; },
    navigate: (url) => calls.routes.push(url),
  });
  return { app, calls, render: (search = "") => view.render({ search }) };
}

test("at three active briefs the Home button and form handler both block creation", async () => {
  const h = home({ usage: monthlyUsage(3) });
  const tree = h.render();
  const elements = nodes(tree);
  assert.equal(elements.find((node) => node.type === "button" && node.props.className === "btn-send").props.disabled, true);
  assert.match(textOf(tree), /Masz 3 aktywne briefy/);
  assert.match(textOf(tree), /Zakończ jeden/);
  assert.match(textOf(tree), /Zakończone briefy zostają dostępne/);
  await elements.find((node) => node.type === "form").props.onSubmit(submitEvent());
  assert.deepEqual(h.calls.create, []);
});

test("unknown usage blocks initial form dispatch and offers retry after a loading error", async () => {
  const h = home({ usage: null });
  let tree = h.render();
  assert.match(textOf(tree), /Sprawdzam limit aktywnych briefów/);
  await nodes(tree).find((node) => node.type === "form").props.onSubmit(submitEvent());
  assert.deepEqual(h.calls.create, []);
  h.app.usageError = "Nie udało się wczytać limitu.";
  tree = h.render();
  assert.match(textOf(tree), /Spróbuj ponownie/);
  assert.equal(nodes(tree).find((node) => node.type === "button" && node.props.className === "btn-send").props.disabled, true);
});

test("an available active slot allows creation with the chosen custom template", async () => {
  const h = home({ usage: monthlyUsage(2), templates: [{ id: "custom_saved", title: "Własny zestaw" }] });
  const tree = h.render("?szablon=custom_saved");
  assert.equal(nodes(tree).find((node) => node.type === "button" && node.props.className === "btn-send").props.disabled, false);
  await nodes(tree).find((node) => node.type === "form").props.onSubmit(submitEvent());
  assert.deepEqual(h.calls.create, [{ templateId: "custom_saved", clientName: "", title: "" }]);
  assert.deepEqual(h.calls.routes, ["/app/b/created-test?new=1"]);
});

test("a custom template stays unsubmitable until asynchronous templates resolve", async () => {
  const h = home({ templatesLoaded: false });
  let tree = h.render("?szablon=custom_saved");
  await nodes(tree).find((node) => node.type === "form").props.onSubmit(submitEvent());
  assert.deepEqual(h.calls.create, []);
  h.app.templatesLoaded = true;
  h.app.templates = [{ id: "custom_saved", title: "Własny zestaw" }];
  tree = h.render("?szablon=custom_saved");
  await nodes(tree).find((node) => node.type === "form").props.onSubmit(submitEvent());
  assert.equal(h.calls.create[0].templateId, "custom_saved");
});

function ai(used, provider) {
  const calls = { ai: 0, undo: 0, usage: 0 };
  const app = { usage: monthlyUsage(0, used), usageError: "", refreshUsage: async () => { calls.usage++; } };
  const view = component("AiDock", "../src/client/BriefPage.tsx", {
    useApp: () => app, usageResetDate: () => "1 listopada",
  }, ["Dodaj pytanie"]);
  const props = {
    brief: { id: "test-brief", canUndo: false }, aiEnabled: true, run: (action) => action(),
    stub: { runAiCommand: async () => { calls.ai++; return provider(); }, undo: async () => { calls.undo++; } },
  };
  return { calls, props, state: view.state, render: () => view.render(props) };
}

test("zero AI remaining blocks both the button and direct form dispatch", async () => {
  const h = ai(10, () => assert.fail("quota-exhausted UI cannot invoke the model"));
  const tree = h.render();
  assert.equal(nodes(tree).find((node) => node.type === "button" && node.props.className === "btn-send").props.disabled, true);
  assert.match(textOf(tree), /AI: 0 z 10 dostępnych poleceń/);
  assert.match(textOf(tree), /Odnowienie 1 listopada/);
  await tree.props.onSubmit(submitEvent());
  assert.equal(h.calls.ai, 0);
});

test("a successful AI command refreshes usage and displays the server result", async () => {
  const outcome = { ok: true, summary: "Dodano pytanie.", changes: ["Nowe pytanie"] };
  const h = ai(9, async () => outcome);
  await h.render().props.onSubmit(submitEvent());
  assert.equal(h.calls.ai, 1);
  assert.equal(h.calls.usage, 1);
  assert.equal(h.state[0], "");
  assert.equal(h.state[1], false);
  assert.match(textOf(h.render()), /Dodano pytanie/);
});

test("a server quota rejection stays visible, retains the prompt and refreshes usage", async () => {
  const h = ai(9, async () => ({ ok: false, summary: "Miesięczny limit AI wykorzystany.", changes: [] }));
  await h.render().props.onSubmit(submitEvent());
  assert.equal(h.calls.usage, 1);
  assert.equal(h.state[0], "Dodaj pytanie");
  assert.match(textOf(h.render()), /Miesięczny limit AI wykorzystany/);
});

test("a thrown AI error resets busy, displays its message and refreshes usage", async () => {
  const h = ai(0, async () => { throw new Error("AI nie odpowiedziało. Spróbuj ponownie."); });
  await h.render().props.onSubmit(submitEvent());
  assert.equal(h.calls.usage, 1);
  assert.equal(h.state[1], false);
  assert.match(textOf(h.render()), /AI nie odpowiedziało/);
});

test("undo remains available after exhausting AI and refreshes current usage", async () => {
  const h = ai(10, () => assert.fail("undo does not invoke the model"));
  h.props.brief.canUndo = true;
  const undo = nodes(h.render()).find((node) => node.type === "button" && node.props["aria-label"] === "Cofnij ostatnią zmianę pytań");
  assert.equal(undo.props.disabled, false);
  await undo.props.onClick();
  assert.equal(h.calls.undo, 1);
  assert.equal(h.calls.ai, 0);
  assert.equal(h.calls.usage, 1);
});

function agency(completedAt) {
  const calls = { complete: 0, refresh: 0, notifications: [], confirmation: [] };
  let approved = false;
  const brief = { id: "agency-test", title: "Test", clientName: "", completedAt, sections: [], answers: {}, canUndo: false };
  const view = component("ConnectedAgency", "../src/client/BriefPage.tsx", {
    useApp: () => ({ me: {}, patchBrief() {}, refresh: () => calls.refresh++, refreshUsage: async () => {}, notify: (message) => calls.notifications.push(message) }),
    useBriefAgent: () => ({ state: brief, stub: { complete: async () => { calls.complete++; } } }),
    briefStatus: () => ({ label: completedAt ? "Zakończony" : "Szkic", tone: "" }),
    briefName: (b) => b.title, redFlags: () => [],
    confirm: (message) => { calls.confirmation.push(message); return approved; },
    ...Object.fromEntries(["MainHead", "MetaEditor", "Menu", "SaveTemplatePopover", "SharePopover", "Overview", "Checks", "SectionNav", "SectionBlock", "AddSection", "AiDock", "NewBriefNote"].map((name) => [name, name])),
  });
  return { calls, approve: () => { approved = true; }, render: () => view.render({ id: brief.id, aiEnabled: true, isNew: false }) };
}

test("ending an active brief requires confirmation and refreshes free slots", async () => {
  const h = agency();
  const menu = nodes(h.render()).find((node) => node.type === "MainHead").props.actions.props.children.find((node) => node.type === "Menu");
  const finish = menu.props.items.find((item) => item.label === "Zakończ brief");
  await finish.onSelect();
  assert.equal(h.calls.complete, 0);
  assert.match(h.calls.confirmation[0], /Zachowasz pytania i odpowiedzi/);
  h.approve();
  await finish.onSelect();
  assert.equal(h.calls.complete, 1);
  assert.equal(h.calls.refresh, 1);
  assert.match(h.calls.notifications[0], /Zwolniono miejsce/);
});

test("completed briefs have no action that finishes them again", () => {
  const h = agency(Date.now());
  const menu = nodes(h.render()).find((node) => node.type === "MainHead").props.actions.props.children.find((node) => node.type === "Menu");
  assert.equal(menu.props.items.some((item) => item.label === "Zakończ brief"), false);
});

function smart(appPatch = {}, provider = async () => ({ id: "smart-test" }), material = "Opis testowego projektu. ".repeat(8)) {
  const calls = { create: [], usage: 0, routes: [], busy: [] };
  const app = { me: { aiEnabled: true }, usage: monthlyUsage(), usageError: "", refresh() {}, refreshUsage: async () => { calls.usage++; }, ...appPatch };
  const view = component("SmartBriefCreator", "../src/client/SmartBrief.tsx", {
    useApp: () => app, SMARTBRIEF_MIN_CHARACTERS: 80, SMARTBRIEF_MAX_CHARACTERS: 50_000,
    createSmartBrief: async (input) => { calls.create.push(input); return provider(); },
    navigate: (url) => calls.routes.push(url),
  }, [material, "Studio testowe"]);
  return { app, calls, state: view.state, render: () => view.render({ onBusy: (busy) => calls.busy.push(busy) }) };
}

test("SmartBrief is reachable from Home and switches creation mode", () => {
  const h = home();
  const trigger = nodes(h.render()).find((node) => node.type === "button" && node.props.className === "smartbrief-entry");
  trigger.props.onClick();
  const tree = h.render();
  assert.ok(nodes(tree).some((node) => node.type === "SmartBriefCreator"));
  assert.ok(!nodes(tree).some((node) => node.type === "form" && node.props.className === "dock"));
});

test("SmartBrief button and form handler enforce source validity, both quotas and AI availability", async () => {
  for (const h of [
    smart({ me: { aiEnabled: false } }),
    smart({ usage: null }),
    smart({ usage: { ...monthlyUsage(), smartBriefs: { used: 3, limit: 3 } } }),
    smart({ usage: monthlyUsage(3) }),
    smart({}, undefined, "Za krótki opis"),
  ]) {
    const tree = h.render();
    assert.equal(nodes(tree).find((node) => node.type === "button" && node.props.className === "btn btn-primary").props.disabled, true);
    await tree.props.onSubmit(submitEvent());
    assert.equal(h.calls.create.length, 0);
  }
});

test("SmartBrief has an independent AI quota and prevents synchronous double submission", async () => {
  let finish;
  const h = smart({ usage: monthlyUsage(0, 10) }, () => new Promise((resolve) => { finish = resolve; }));
  const form = h.render();
  const pending = form.props.onSubmit(submitEvent());
  await form.props.onSubmit(submitEvent());
  assert.equal(h.calls.create.length, 1);
  finish({ id: "smart-test" }); await pending;
  assert.deepEqual(h.calls.routes, ["/app/b/smart-test"]);
  assert.deepEqual(h.calls.busy, [true, false]);
  assert.equal(h.calls.usage, 1);
});

test("failed SmartBrief creation retains source, shows the error and refreshes quota", async () => {
  const h = smart({}, async () => { throw new Error("Analiza nieudana, limit nie został zużyty."); });
  const before = h.state[0];
  await h.render().props.onSubmit(submitEvent());
  assert.equal(h.state[0], before);
  assert.equal(h.state[2], false);
  assert.equal(h.calls.usage, 1);
  assert.match(textOf(h.render()), /Analiza nieudana/);
  assert.deepEqual(h.calls.routes, []);
});
