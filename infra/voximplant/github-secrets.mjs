#!/usr/bin/env node
/**
 * Transfer ONLY environment-scoped GAFUS Voximplant credentials to GitHub
 * Actions Secrets, without leaking plaintext to logs, CLI arguments, or Git.
 * Invoke on the operator's Mac, which holds the protected provisioner output.
 *
 * node infra/voximplant/github-secrets.mjs --environment production --plan
 * node infra/voximplant/github-secrets.mjs --environment production --apply
 */
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createPrivateKey } from "node:crypto";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (key) => args[args.indexOf(key) + 1];
const environment = flag("--environment");
const modes = ["--plan", "--apply"].filter((s) => args.includes(s));
if (!["production", "staging"].includes(environment) || modes.length !== 1) {
  throw new Error("Usage: --environment production|staging --plan|--apply");
}
const names = [
  "VOXIMPLANT_ACCOUNT_ID",
  "VOXIMPLANT_APPLICATION_ID",
  "VOXIMPLANT_ACCOUNT_NAME",
  "VOXIMPLANT_APPLICATION_NAME",
  "VOXIMPLANT_KEY_ID",
  "VOXIMPLANT_PRIVATE_KEY_BASE64",
  "VOXIMPLANT_CREDENTIAL_SECRET",
  "VOXIMPLANT_ADMISSION_SECRET",
];
const folder = join(homedir(), "Library", "Application Support", "GAFUS", "voximplant");
async function privateContents(filename) {
  const file = join(folder, filename);
  const st = await stat(file);
  if ((st.mode & 0o077) !== 0) throw new Error("Insecure permissions on " + filename + " (expected 0600)");
  return readFile(file, "utf8");
}
async function main() {
  const env = Object.fromEntries((await privateContents(environment + ".env"))
    .split("\n").filter((s) => /^VOXIMPLANT_[A-Z_]+=/u.test(s))
    .map((line) => [line.split("=", 1)[0], line.slice(line.indexOf("=") + 1)]));
  const manager = JSON.parse(await privateContents(environment + "-user-manager-key.json"));
  const secrets = JSON.parse(await privateContents(environment + "-secrets.json"));
  if (secrets.environment !== environment) throw new Error("Wrong protected environment secret file");
  const config = {
    VOXIMPLANT_ACCOUNT_ID: env.VOXIMPLANT_ACCOUNT_ID,
    VOXIMPLANT_APPLICATION_ID: env.VOXIMPLANT_APPLICATION_ID,
    VOXIMPLANT_ACCOUNT_NAME: env.VOXIMPLANT_ACCOUNT_NAME,
    VOXIMPLANT_APPLICATION_NAME: env.VOXIMPLANT_APPLICATION_NAME,
    VOXIMPLANT_KEY_ID: manager.key_id,
    VOXIMPLANT_PRIVATE_KEY_BASE64: Buffer.from(manager.private_key, "utf8").toString("base64"),
    VOXIMPLANT_CREDENTIAL_SECRET: secrets.credential_secret,
    VOXIMPLANT_ADMISSION_SECRET: secrets.admission_secret,
  };
  if (env.VOXIMPLANT_KEY_ID !== manager.key_id ||
      Number(env.VOXIMPLANT_ACCOUNT_ID) !== Number(manager.account_id) ||
      env.VOXIMPLANT_CREDENTIAL_SECRET !== secrets.credential_secret ||
      env.VOXIMPLANT_ADMISSION_SECRET !== secrets.admission_secret ||
      env.VOXIMPLANT_APPLICATION_NAME !== (environment === "staging" ? "gafus-staging" : "gafus-production") ||
      !Number.isSafeInteger(Number(env.VOXIMPLANT_APPLICATION_ID)) ||
      !Number.isSafeInteger(Number(env.VOXIMPLANT_ACCOUNT_ID)) ||
      secrets.credential_secret?.length < 32 ||
      secrets.admission_secret?.length < 32) {
    throw new Error("Local Vox secrets mismatch; refusing GitHub update");
  }
  createPrivateKey(manager.private_key); // validates actual PKCS8; never print PEM
  for (const name of names) {
    if (typeof config[name] !== "string" || !config[name].length || /[\n\r]/u.test(config[name])) {
      throw new Error("Invalid single-line GitHub secret " + name);
    }
  }
  console.log("Verified protected " + environment + " credentials. GitHub Environment Secrets:");
  for (const name of names) console.log("- " + name);
  if (modes[0] === "--plan") {
    console.log("PLAN ONLY: no secrets uploaded");
    return;
  }
  // Official GitHub CLI encrypts values with repository/environment public key
  // before POST. -f - reads stdin; plaintext does not enter argv or repository.
  const data = names.map((n) => n + "=" + config[n]).join("\n") + "\n";
  const result = spawnSync("gh", ["secret", "set", "-R", "asmtv1/gafus", "--env", environment, "-f", "-"], {
    input: data, encoding: "utf8", timeout: 60000, maxBuffer: 16384,
  });
  if (result.status !== 0) {
    console.error("GitHub upload NOT CONFIRMED. Cause: " + String(result.error?.message || result.stderr || "gh failed").slice(0, 500));
    process.exitCode = 1;
    return;
  }
  const listed = spawnSync("gh", ["secret", "list", "-R", "asmtv1/gafus", "--env", environment], {
    encoding: "utf8", timeout: 20000, maxBuffer: 32000,
  });
  if (listed.status !== 0) {
    console.error("GitHub upload returned success; read-back listing UNCONFIRMED.");
    process.exitCode = 1;
    return;
  }
  const actual = new Set(listed.stdout.split("\n").map((s) => s.split(/\s+/u)[0]));
  const missing = names.filter((n) => !actual.has(n));
  if (missing.length) {
    console.error("Missing GitHub secret names after upload: " + missing.join(", "));
    process.exitCode = 1;
    return;
  }
  console.log("SUCCESS: all 8 names confirmed in GitHub Actions Environment " + environment + " (plaintext not retrievable).");
}
main().catch((e) => {
  console.error("BLOCKED: " + e.message);
  process.exitCode = 1;
});
