import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectInstallerImports } from "./check-api-composition-installs.mjs";

const app = "apps/api/src/app.ts";
const remaining = "./modules/app-feature-flags/composition/install-core-flags.js";
const retired = "./modules/auth/composition/install-credential-registration.js";

test("all retired installers are blocked even at the app composition root", () => {
  assert.deepEqual(inspectInstallerImports(app, `import '${remaining}';`).violations.length, 1);
  assert.equal(inspectInstallerImports(app, `import '${retired}';`).violations.length, 1);
});

test("rejects installers reintroduced through router imports, dynamic imports and re-exports", () => {
  const file = "apps/api/src/routes/courses.ts";
  const target = "../modules/courses/composition/install-catalog-read.js";
  for (const source of [`import '${target}';`, `await import('${target}');`, `require('${target}');`, `export * from '${target}';`]) {
    assert.equal(inspectInstallerImports(file, source).violations.length, 1, source);
  }
  assert.equal(inspectInstallerImports(file, `// import '${target}';`).violations.length, 0);
});
