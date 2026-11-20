import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

// Source-only, no Docker and no credentials: mirrors the packages that the
// real Linux runtime export verifier insists must survive `pnpm deploy --prod`.
const runtimeVerifierPath = 'ci-cd/docker/check-runtime-package-exports.mjs';
const runtimeVerifierText = readFileSync(runtimeVerifierPath, 'utf8');
const runtimeVerifier = ts.createSourceFile(
  runtimeVerifierPath, runtimeVerifierText, ts.ScriptTarget.Latest, true,
  ts.ScriptKind.JS,
);

function verifierArray(name) {
  for (const statement of runtimeVerifier.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== name) continue;
      assert(ts.isArrayLiteralExpression(decl.initializer), `CHECKER_ARRAY_INVALID:${name}`);
      const values = decl.initializer.elements.map(item => {
        assert(ts.isStringLiteral(item), `CHECKER_ARRAY_NOT_LITERAL:${name}`);
        return item.text;
      });
      assert(values.length > 0 || name === 'workerOnly', `CHECKER_ARRAY_EMPTY:${name}`);
      return values;
    }
  }
  throw Error(`CHECKER_ARRAY_MISSING:${name}`);
}

const requiredByRuntime = {
  api: [...verifierArray('legacyPackages'), ...verifierArray('newPackages'), ...verifierArray('apiOnly')],
  worker: [...verifierArray('legacyPackages'), ...verifierArray('newPackages'), ...verifierArray('workerOnly')],
};

function workspace() {
  const projects = new Map();
  for (const root of ['apps', 'packages']) {
    for (const dir of readdirSync(root, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const path = join(root, dir.name, 'package.json');
      if (!existsSync(path)) continue;
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      assert(manifest.name && !projects.has(manifest.name), `INVALID_WORKSPACE:${path}`);
      projects.set(manifest.name, { ...manifest, dir: join(root, dir.name) });
    }
  }
  assert(projects.size > 40, 'WORKSPACE_INVENTORY_INCOMPLETE');
  return projects;
}

function reachability(projects, entry) {
  const found = new Set();
  const pending = [entry];
  while (pending.length) {
    const name = pending.pop();
    if (found.has(name)) continue;
    assert(projects.has(name), `UNDECLARED_WORKSPACE:${name}`);
    found.add(name);
    for (const [dep, version] of Object.entries(projects.get(name).dependencies ?? {})) {
      if (String(version).startsWith('workspace:')) pending.push(dep);
    }
  }
  return found;
}

function allRuntimeSourceFiles(dir) {
  const result = [];
  if (!existsSync(dir)) return result;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'test' || entry.name === 'tests' || entry.name === 'fixtures') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...allRuntimeSourceFiles(path));
    else if (entry.isFile() && /\.(?:[cm]?js|tsx?)$/.test(entry.name) &&
             !/(?:^|\.)test\.|(?:^|\.)spec\.|\.d\.ts$/.test(entry.name)) result.push(path);
  }
  return result;
}

function declaredRuntimeImports(project) {
  const imported = new Map();
  for (const path of allRuntimeSourceFiles(join(project.dir, 'src'))) {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node) {
      let specifier = null;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)) specifier = node.moduleSpecifier.text;
      else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) &&
               node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression))
        specifier = node.moduleReference.expression.text;
      else if (ts.isCallExpression(node) && node.arguments.length > 0 &&
               ts.isStringLiteral(node.arguments[0]) &&
               (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                (ts.isIdentifier(node.expression) && node.expression.text === 'require')))
        specifier = node.arguments[0].text;
      const name = specifier?.match(/^(@gafus\/[^/]+)/)?.[1];
      if (name && name !== project.name && !imported.has(name)) imported.set(name, relative(project.dir, path));
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return imported;
}

function missingFor(projects, mode) {
  const name = mode === 'api' ? '@gafus/api' : '@gafus/worker';
  const project = projects.get(name);
  assert(project, `SOURCE_PACKAGE_MISSING:${name}`);
  const reach = reachability(projects, name);
  const packaged = requiredByRuntime[mode].filter(required => !reach.has(required));
  const undeclared = [...declaredRuntimeImports(project)].filter(([dependency]) =>
    projects.has(dependency) && !Object.hasOwn(project.dependencies ?? {}, dependency));
  return { packaged, undeclared };
}

test('Linux API and Worker images can reach every mandatory compiled runtime package', () => {
  const projects = workspace();
  for (const mode of ['api', 'worker']) {
    const { packaged, undeclared } = missingFor(projects, mode);
    assert.deepEqual(packaged, [], `${mode}:PNPM_DEPLOY_WILL_OMIT:${packaged.join(',')}`);
    assert.deepEqual(undeclared, [], `${mode}:MISSING_DIRECT_RUNTIME_DEP:${undeclared.map(([dep, file]) => dep + ':' + file).join(',')}`);
  }
});

test('missing direct API import fails before slow Docker build', () => {
  const projects = workspace();
  const original = projects.get('@gafus/api');
  projects.set('@gafus/api', {
    ...original,
    dependencies: Object.fromEntries(Object.entries(original.dependencies).filter(([dep]) =>
      dep !== '@gafus/identity-write-server')),
  });
  const { undeclared } = missingFor(projects, 'api');
  assert(undeclared.some(([dep]) => dep === '@gafus/identity-write-server'));
});

test('missing mandatory Worker legacy package fails before slow Docker build', () => {
  const projects = workspace();
  const original = projects.get('@gafus/worker');
  projects.set('@gafus/worker', {
    ...original,
    dependencies: Object.fromEntries(Object.entries(original.dependencies).filter(([dep]) =>
      dep !== '@gafus/achievements-server')),
  });
  const { packaged } = missingFor(projects, 'worker');
  assert(packaged.includes('@gafus/achievements-server'));
});


test('runtime image coverage counts match every current package export and preserve baseline 9/48', () => {
  const projects = workspace();
  const legacy = verifierArray('legacyPackages');
  assert.equal(legacy.length, 9);
  const explicit = new Set();
  const registeredVariables = new Map();
  for (const match of runtimeVerifierText.matchAll(/const (\w+) = ['"](@gafus\/[^'"]+)['"]/g))
    registeredVariables.set(match[1], match[2]);
  for (const match of runtimeVerifierText.matchAll(/(?:if|else if) \(specifier === (\w+)\)/g)) {
    const spec = registeredVariables.get(match[1]);
    if (spec) explicit.add(spec);
  }
  let historicalCount = 0;
  for (const name of legacy) {
    const manifest = projects.get(name);
    assert(manifest, `LEGACY_PACKAGE_NOT_FOUND:${name}`);
    for (const key of Object.keys(manifest.exports)) {
      const spec = key === '.' ? name : `${name}/${key.slice(2)}`;
      if (!explicit.has(spec)) historicalCount++;
    }
  }
  assert.equal(historicalCount, 48, 'LEGACY_9_48_CHANGED_OR_NEW_EXPORT_NOT_REGISTERED');
  assert.match(runtimeVerifierText, /legacyExportsChecked !== 48/, 'LEGACY_EXPORT_GUARD_REMOVED');
  assert.match(runtimeVerifierText, /if \(!trainingReminderApplicationExportChecked\)/,
    'NEW_REMINDER_APPLICATION_EXPORT_NOT_ENFORCED');
  for (const mode of ['api', 'worker']) {
    const actualCount = requiredByRuntime[mode].reduce((total, name) =>
      total + Object.keys(projects.get(name).exports ?? {}).length, 0);
    const expected = mode === 'worker' ? 224 : 234;
    assert.equal(actualCount, expected, `RUNTIME_EXPORT_COVERAGE_DRIFT:${mode}`);
    assert(runtimeVerifierText.includes(`exportsChecked !== ${expected}`),
      `DOCKER_RUNTIME_EXPORT_COUNT_STALE:${mode}`);
  }
});
