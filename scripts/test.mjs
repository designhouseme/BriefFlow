import { mkdtemp, readFile, readdir, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const output = await mkdtemp(join(tmpdir(), "briefflow-tests-"));
const compiled = new Set();
async function findTests(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await findTests(path));
    else if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.mjs")) found.push(path);
  }
  return found;
}
async function compile(path) {
  if (compiled.has(path)) return;
  compiled.add(path);
  const source = await readFile(path, "utf8");
  const destination = join(output, relative(root, path).replace(/\.tsx?$/, ".js"));
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: path,
    transformers: { before: [(context) => (file) => {
      const visit = (node) => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && /\.tsx?$/.test(node.moduleSpecifier.text)) {
          return context.factory.updateImportDeclaration(node, node.modifiers, node.importClause, context.factory.createStringLiteral(node.moduleSpecifier.text.replace(/\.tsx?$/, ".js")), node.attributes);
        }
        return ts.visitEachChild(node, visit, context);
      };
      return ts.visitNode(file, visit);
    }] },
  });
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, result.outputText);
  for (const imported of ts.preProcessFile(source, true, true).importedFiles) {
    if (!imported.fileName.startsWith(".")) continue;
    const base = resolve(dirname(path), imported.fileName);
    let dependency;
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`]) {
      try { await readFile(candidate); dependency = candidate; break; } catch { /* Try the next TS path. */ }
    }
    if (!dependency) throw new Error(`Missing test dependency: ${base}`);
    await compile(dependency);
  }
}
try {
  const tests = [...await findTests(join(root, "src")), ...await findTests(join(root, "tests"))];
  const targets = [];
  for (const path of tests.sort()) {
    if (path.endsWith(".ts")) {
      await compile(path);
      targets.push(join(output, relative(root, path).replace(/\.ts$/, ".js")));
    } else targets.push(path);
  }
  const result = spawnSync(process.execPath, ["--test", ...targets], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { await rm(output, { recursive: true, force: true }); }
