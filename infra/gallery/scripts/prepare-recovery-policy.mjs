#!/usr/bin/env node
/**
 * Recovery aid for the isolated DEV photo bucket.
 *
 * Reads sensitive Terraform state in memory without printing it. Emits only
 * a local git-ignored bucket policy file with the DEV provisioner's access.
 * Does not modify cloud resources or active Yandex CLI settings.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const folderId = "b1gjbsvfnd1fl68k43g6";
const bucketName = "gafus-gallery-dev-photos-b1gjbsvfnd1fl68k43g6";
const provisionerId = "ajea07ae9l6d8anjknc0";
const output = resolve(root, "infra/gallery/.secrets/gallery-dev-photo-policy-recovery.json");

let localEnv;
try {
  localEnv = parse(readFileSync(resolve(root, ".env")));
  if (!localEnv.AWS_ACCESS_KEY_ID || !localEnv.AWS_SECRET_ACCESS_KEY) {
    throw Error("Missing backend credentials");
  }
} catch {
  console.error("Cannot read Terraform state backend credentials.");
  process.exit(1);
}

const r = spawnSync("terraform", ["-chdir=infra/gallery", "state", "pull"], {
  cwd: root,
  env: {
    ...process.env,
    AWS_ACCESS_KEY_ID: localEnv.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: localEnv.AWS_SECRET_ACCESS_KEY,
    AWS_EC2_METADATA_DISABLED: "true",
  },
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
  timeout: 90_000,
});
if (r.status !== 0 || r.error) {
  console.error("Could not retrieve the remote Terraform state.");
  process.exit(1);
}
let state;
try {
  state = JSON.parse(r.stdout);
} catch {
  console.error("Remote state was not valid JSON.");
  process.exit(1);
}
const matches = (state.resources ?? []).filter((resource) =>
  resource.mode === "managed" &&
  resource.type === "yandex_storage_bucket" &&
  resource.name === "gallery"
);
if (matches.length !== 1 || matches[0].instances?.length !== 1) {
  console.error("Exactly one tracked gallery photo bucket is required.");
  process.exit(1);
}
const attrs = matches[0].instances[0].attributes;
if (attrs.bucket !== bucketName || attrs.folder_id !== folderId) {
  console.error("Unexpected bucket or cloud folder. Refusing.");
  process.exit(1);
}
if (typeof attrs.policy !== "string" || !attrs.policy) {
  console.error("No bucket policy in state; inspect the actual cloud policy.");
  process.exit(1);
}
let policy;
try {
  policy = JSON.parse(attrs.policy);
} catch {
  console.error("Cannot parse state bucket policy.");
  process.exit(1);
}
if (policy.Version !== "2012-10-17" || !Array.isArray(policy.Statement) ||
    !policy.Statement.some((s) => s.Sid === "TlsOnly" && s.Effect === "Deny")) {
  console.error("Bucket policy differs from the expected DEV configuration.");
  process.exit(1);
}
// Never copy an unexpected or public Allow rule into the repaired policy.
const expectedSids = new Set([
  "TlsOnly", "RegisteredSources", "CoreHead", "WorkerObjects", "FinalOrigin",
  "TerraformProvisioner",
]);
if (policy.Statement.some((s) => !expectedSids.has(s.Sid) ||
    (s.Effect === "Allow" && (s.Principal === "*" || !s.Principal?.CanonicalUser)) ||
    (s.Sid === "TlsOnly" && (s.Effect !== "Deny" || s.Principal !== "*")))) {
  console.error("Unexpected/public policy statement. Refusing.");
  process.exit(1);
}
const arn = `arn:aws:s3:::${bucketName}`;
const statement = {
  Sid: "TerraformProvisioner",
  Effect: "Allow",
  Principal: { CanonicalUser: provisionerId },
  Action: ["s3:*"],
  Resource: [arn, `${arn}/*`],
};
const existing = policy.Statement.find((s) => s.Sid === statement.Sid);
if (existing && JSON.stringify(existing) !== JSON.stringify(statement)) {
  console.error("Conflicting TerraformProvisioner policy statement.");
  process.exit(1);
}
if (!existing) policy.Statement.push(statement);
if (existsSync(output)) {
  console.error("Recovery policy already exists. Refusing to overwrite.");
  process.exit(1);
}
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
writeFileSync(output, JSON.stringify(policy, null, 2) + "\n", { mode: 0o600, flag: "wx" });
chmodSync(output, 0o600);
console.log("Verified DEV folder and existing photo bucket against Terraform state.");
console.log("Prepared: infra/gallery/.secrets/gallery-dev-photo-policy-recovery.json");
console.log("Only the DEV provisioner gains private administrative S3 access.");
console.log("No cloud changes made; no secrets or Terraform state printed.");
