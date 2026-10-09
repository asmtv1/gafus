#!/usr/bin/env node
/**
 * Terraform CLI for the isolated GAFUS photo gallery.
 *
 * Reads ONLY the S3 backend credentials from the repository-root .env.
 * Never prints, persists, or forwards them as CLI arguments.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const envFile = resolve(repoRoot, ".env");
const defaultProviderKeyFile = resolve(repoRoot, "infra/gallery/.secrets/gallery-dev-provisioner-key.json");

let localEnv;
try {
  localEnv = parse(readFileSync(envFile));
} catch {
  console.error("Missing root .env. Create it locally (never commit it).");
  process.exit(1);
}

const required = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"];
const missing = required.filter((key) => !localEnv[key]?.trim());
if (missing.length > 0) {
  console.error(`Missing Terraform backend environment keys in root .env: ${missing.join(", ")}`);
  process.exit(1);
}

const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = localEnv;
const terraformVarNames = [
  "TF_VAR_internal_hmac_secret",
  "TF_VAR_origin_secret",
  "TF_VAR_cdn_secret",
  "TF_VAR_provisioner_ymq_access_key",
  "TF_VAR_provisioner_ymq_secret_key",
];
const terraformVars = Object.fromEntries(
  terraformVarNames.filter((name) => localEnv[name]).map((name) => [name, localEnv[name]]),
);
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node infra/gallery/scripts/terraform.mjs <terraform arguments>");
  process.exit(2);
}

if (args[0] === "apply") {
  if (!args.includes("gallery-dev.tfplan")) {
    console.error("Refusing apply without the reviewed gallery-dev.tfplan file.");
    process.exit(2);
  }
  const review = spawnSync(process.execPath, [resolve(scriptDir, "plan-summary.mjs")], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 90_000,
    maxBuffer: 1024 * 1024,
  });
  if (review.stdout) process.stdout.write(review.stdout);
  if (review.status !== 0) {
    console.error("Refusing apply: the saved Terraform plan is incomplete, errored, or unsafe.");
    process.exit(2);
  }
}

const child = spawnSync("terraform", ["-chdir=infra/gallery", ...args], {
  cwd: repoRoot,
  env: {
    ...process.env,
    ...terraformVars,
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_EC2_METADATA_DISABLED: "true",
    ...(localEnv.YC_SERVICE_ACCOUNT_KEY_FILE
      ? { YC_SERVICE_ACCOUNT_KEY_FILE: localEnv.YC_SERVICE_ACCOUNT_KEY_FILE }
      : existsSync(defaultProviderKeyFile)
        ? { YC_SERVICE_ACCOUNT_KEY_FILE: defaultProviderKeyFile }
        : {}),
  },
  encoding: "utf8",
  maxBuffer: 4 * 1024 * 1024,
});

function redact(value) {
  let safe = value ?? "";
  for (const secret of [AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, ...Object.values(terraformVars)]) {
    if (secret && secret.length >= 12) safe = safe.replaceAll(secret, "[REDACTED]");
  }
  return safe;
}
if (child.stdout) process.stdout.write(redact(child.stdout));
if (child.stderr) process.stderr.write(redact(child.stderr));
if (child.error) console.error("Terraform execution failed:", child.error.code ?? "unknown");
process.exit(child.status ?? 1);
