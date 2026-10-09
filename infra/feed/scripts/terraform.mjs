import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const local = parse(readFileSync(resolve(root, ".env")));
const secrets = JSON.parse(readFileSync(resolve(root, "infra/feed/.secrets/runtime.json"), "utf8"));
const env = { ...process.env, AWS_ACCESS_KEY_ID: local.AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: local.AWS_SECRET_ACCESS_KEY,
 AWS_EC2_METADATA_DISABLED: "true", YC_SERVICE_ACCOUNT_KEY_FILE: local.YC_SERVICE_ACCOUNT_KEY_FILE || resolve(root,"infra/gallery/.secrets/gallery-dev-provisioner-key.json") };
for (const [key, value] of Object.entries(secrets)) env[`TF_VAR_${key}`] = value;
for (const key of ["provisioner_ymq_access_key", "provisioner_ymq_secret_key"]) {
 if (!local[`TF_VAR_${key}`]) throw new Error("QUEUE_PROVISIONER_CONFIG_MISSING");
 env[`TF_VAR_${key}`] = local[`TF_VAR_${key}`];
}
const args = process.argv.slice(2);
if (!args.length) throw new Error("TERRAFORM_COMMAND_REQUIRED");
if (args[0] === "apply" && !args.includes("feed.tfplan")) throw new Error("REVIEWED_SAVED_PLAN_REQUIRED");
const child = spawnSync("terraform", ["-chdir=infra/feed", ...args], { cwd: root, env, encoding: "utf8", maxBuffer: 8*1024*1024 });
// Raw provider errors, plans and state can contain credentials. Persist nothing; emit categories only.
if (args[0] === "show" && args.includes("-json")) {
 if (child.status !== 0) { console.error("FEED_PLAN_READ_FAILED"); process.exit(1); }
 const plan = JSON.parse(child.stdout);
 const changes = (plan.resource_changes ?? []).filter(x => x.change.actions.some(a => a !== "no-op"));
 console.log(JSON.stringify({ complete: plan.complete, errored: plan.errored, changes: changes.map(x => ({ address: x.address, actions: x.change.actions })) },null,2));
} else {
 console.log(`FEED_TERRAFORM_${args[0].toUpperCase()}: ${child.status === 0 ? "PASS" : "FAIL"}`);
 if (child.status !== 0) {
  const output = (child.stdout ?? "") + (child.stderr ?? "");
  const categories = [/AccessDenied|PermissionDenied|permission denied/i.test(output) && "PERMISSION_DENIED", /credentials|authentication|Unauthenticated/i.test(output) && "CREDENTIALS", /Unsupported|Invalid|Missing required|Reference to undeclared/i.test(output) && "CONFIGURATION", /Could not resolve|timeout|no such host|connection/i.test(output) && "NETWORK"].filter(Boolean);
  console.log(JSON.stringify({ categories }));
 }
}
process.exit(child.status ?? 1);
