import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("Vox staging full provisioning uses scoped HTTPS methods and protects secrets", () => {
  const dir = mkdtempSync(join(tmpdir(), "gafus-vox-provision-test-"));
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const credentials = join(dir, "admin-credentials.json");
  writeFileSync(credentials, JSON.stringify({
    account_id: 123456, key_id: "fake-admin-key",
    private_key: rsa.privateKey.export({ type: "pkcs8", format: "pem" }),
  }), { mode: 0o600 });
  const run = (args) => spawnSync(process.execPath, args, { encoding: "utf8", env: { ...process.env, HOME: dir }, timeout: 20000 });
  const script = fileURLToPath(new URL("./provision.mjs", import.meta.url));
  const mock = fileURLToPath(new URL("./provision.mock.mjs", import.meta.url));
  const apply = run(["--import", mock, script, "--environment", "staging", "--apply", "--credentials", credentials]);
  assert.equal(apply.status, 0, "apply failed: " + apply.stderr + "\n" + apply.stdout);
  assert.match(apply.stdout, /READY: application=17 scenario=24 rule=33/);
  const privateDir = join(dir, "Library", "Application Support", "GAFUS", "voximplant");
  for (const file of ["staging-secrets.json", "staging-user-manager-key.json", "staging.env"]) {
    assert.equal(statSync(join(privateDir, file)).mode & 0o077, 0);
  }
  const serverEnv = readFileSync(join(privateDir, "staging.env"), "utf8");
  assert.match(serverEnv, /VOXIMPLANT_ACCOUNT_ID=123456/);
  assert.match(serverEnv, /VOXIMPLANT_APPLICATION_ID=17/);
  assert.match(serverEnv, /VOXIMPLANT_ACCOUNT_NAME=fake/);
  assert.match(serverEnv, /VOXIMPLANT_APPLICATION_NAME=gafus-staging/);
  assert.match(serverEnv, /VOXIMPLANT_PRIVATE_KEY=/);
  assert.match(serverEnv, /VOXIMPLANT_ADMISSION_SECRET=/);
  const state = readFileSync(join(privateDir, "staging-secrets.json"), "utf8");
  const init = run([script, "--environment", "staging", "--init"]);
  assert.equal(init.status, 0, init.stderr);
  assert.equal(readFileSync(join(privateDir, "staging-secrets.json"), "utf8"), state);
  assert.ok(!apply.stdout.includes(JSON.parse(state).admission_secret), "no secret may be printed");
});
