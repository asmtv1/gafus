#!/usr/bin/env node
/**
 * Inspects a local Terraform plan and prints only a safe, reviewed summary.
 * Never writes the JSON representation or prints resource/variable values.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "terraform",
  ["-chdir=infra/gallery", "show", "-json", "gallery-dev.tfplan"],
  { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 90_000 },
);
if (result.error || result.status !== 0) {
  console.error("Could not inspect gallery-dev.tfplan locally. Terraform exit code:", result.status ?? "unknown");
  process.exit(1);
}
let plan;
try {
  plan = JSON.parse(result.stdout);
} catch {
  console.error("Terraform returned invalid plan JSON.");
  process.exit(1);
}

const expectedVariables = {
  cloud_id: "b1g15oiet3lkhtjgb7qt",
  folder_id: "b1gjbsvfnd1fl68k43g6",
  provisioner_service_account_id: "ajea07ae9l6d8anjknc0",
  environment: "dev",
  bucket: "gafus-gallery-dev-photos-b1gjbsvfnd1fl68k43g6",
  internal_base_url: "https://api.gafus.ru",
  cdn_hostname: "gallery-dev.gafus.ru",
  cdn_certificate_id: "fpq5s28ctr9c9n3n1pbu",
  enabled: true,
};
let safe = true;
console.log("GAFUS Gallery DEV — Terraform plan review");
const complete = plan.complete === true;
const applyable = plan.applyable === true;
const errored = plan.errored === true;
console.log("Plan complete:", complete);
console.log("Plan applyable:", applyable);
console.log("Plan errored:", errored);
if (!complete || !applyable || errored) safe = false;
for (const [name, expected] of Object.entries(expectedVariables)) {
  const match = plan.variables?.[name]?.value === expected;
  if (!match) safe = false;
  console.log(`Target ${name}: ${match ? "OK" : "MISMATCH"}`);
}
const origins = plan.variables?.web_origins?.value;
const expectedOrigins = ["https://gafus.ru", "https://www.gafus.ru"];
const originMatches = Array.isArray(origins) &&
  JSON.stringify([...origins].sort()) === JSON.stringify(expectedOrigins.sort());
console.log(`CORS origins: ${originMatches ? "OK" : "MISMATCH"}`);
if (!originMatches) safe = false;

const allowedTypes = new Set([
  "yandex_iam_service_account",
  "yandex_iam_service_account_static_access_key",
  "yandex_resourcemanager_folder_iam_member",
  "yandex_storage_bucket",
  "yandex_storage_bucket_iam_binding",
  "yandex_storage_object",
  "yandex_message_queue",
  "yandex_lockbox_secret",
  "yandex_lockbox_secret_version",
  "yandex_lockbox_secret_iam_binding",
  "yandex_function",
  "yandex_function_scaling_policy",
  "yandex_function_iam_binding",
  "yandex_function_trigger",
  "yandex_api_gateway",
  "yandex_cdn_origin_group",
  "yandex_cdn_resource",
]);
const resourceChanges = plan.resource_changes ?? [];
const deployCdn = plan.variables?.deploy_cdn?.value;
const cdnChanges = resourceChanges.filter((change) => change.type === "yandex_cdn_resource");
const cdnStageMatches = typeof deployCdn === "boolean" && (deployCdn || cdnChanges.length === 0);
if (!cdnStageMatches) safe = false;
console.log("CDN deployment stage:", deployCdn === true ? "stage-2" : deployCdn === false ? "stage-1" : "UNKNOWN");
console.log("CDN stage consistency:", cdnStageMatches ? "OK" : "MISMATCH");
const counts = { create: 0, update: 0, delete: 0, replace: 0, no_op: 0, other: 0 };
const unexpected = [];
const otherFolders = [];
const pendingUpdates = [];
const expectedCors = {
  allowed_headers: ["content-type"],
  allowed_methods: ["POST"],
  allowed_origins: ["https://gafus.ru", "https://www.gafus.ru"],
  expose_headers: ["ETag"],
  max_age_seconds: 600,
};
function exactlyExpectedCors(value) {
  if (!Array.isArray(value) || value.length !== 1 ||
      value[0] === null || typeof value[0] !== "object") return false;
  // The provider can include an empty optional rule ID. Ignore only that.
  const { id, ...rule } = value[0];
  if (id !== undefined && id !== null && id !== "") return false;
  const actualKeys = Object.keys(rule).sort();
  const expectedKeys = Object.keys(expectedCors).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) return false;
  return expectedKeys.every((key) =>
    JSON.stringify(rule[key]) === JSON.stringify(expectedCors[key])
  );
}
for (const change of resourceChanges) {
  if (change.change?.actions?.join(",") !== "update") continue;
  const before = change.change.before ?? {};
  const after = change.change.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .sort();
  // Print only field names, never values from state or plan.
  const beforeCors = before.cors_rule;
  const noPreviousCors = beforeCors == null ||
    (Array.isArray(beforeCors) && beforeCors.length === 0);
  const allowed = change.address === "yandex_storage_bucket.gallery" &&
    keys.length === 1 && keys[0] === "cors_rule" &&
    noPreviousCors && exactlyExpectedCors(after.cors_rule);
  pendingUpdates.push({ address: change.address, attributeNames: keys, allowed });
}
for (const change of resourceChanges) {
  const actions = change.change?.actions ?? [];
  const operation = actions.length === 1 ? actions[0] : actions.join("+");
  if (actions.includes("delete") && actions.includes("create")) counts.replace++;
  else if (operation === "create") counts.create++;
  else if (operation === "update") counts.update++;
  else if (operation === "delete") counts.delete++;
  else if (operation === "no-op") counts.no_op++;
  else counts.other++;
  if (!allowedTypes.has(change.type)) unexpected.push(change.address);
  const folder = change.change?.after?.folder_id;
  if (typeof folder === "string" && folder !== expectedVariables.folder_id) {
    otherFolders.push(change.address);
  }
}
console.log("Total resource changes:", resourceChanges.length);
console.log("Actions:", JSON.stringify(counts));
for (const update of pendingUpdates) {
  console.log("Update to review:", update.address);
  console.log("Changed attribute names:", update.attributeNames.join(", ") || "(none)");
  console.log("Exactly expected private gallery CORS update:", update.allowed ? "YES" : "NO");
}
console.log("Unexpected resource types:", unexpected.length);
console.log("Different explicit folder IDs:", otherFolders.length);
if (unexpected.length) console.log("Unexpected addresses:", unexpected.join(", "));
if (otherFolders.length) console.log("Non-dev addresses:", otherFolders.join(", "));
const reviewedCORSOnly = deployCdn === false &&
  counts.update === 1 && pendingUpdates.length === 1 &&
  pendingUpdates[0].allowed;
// Stage 3 activation is limited to toggling GALLERY_ENABLED on the exact four
// existing DEV functions. Every other environment variable must be identical.
const functionNames = ["dispatch", "maintenance", "origin", "process"];
const functionAddresses = new Set(
  functionNames.map((name) => `yandex_function.gallery["${name}"]`)
);
const approvedFunctionToggles = resourceChanges.filter((change) => {
  if (change.change?.actions?.join(",") !== "update" ||
      !functionAddresses.has(change.address)) return false;
  const before = change.change.before ?? {};
  const after = change.change.after ?? {};
  if (!before.environment || !after.environment ||
      before.environment.GALLERY_ENABLED !== "false" ||
      after.environment.GALLERY_ENABLED !== "true") return false;
  const removeToggle = (env) =>
    Object.fromEntries(Object.entries(env)
      .filter(([key]) => key !== "GALLERY_ENABLED")
      .sort(([left], [right]) => left.localeCompare(right)));
  const { environment: oldEnv, ...oldOther } = before;
  const { environment: newEnv, ...newOther } = after;
  return JSON.stringify(removeToggle(oldEnv)) ===
           JSON.stringify(removeToggle(newEnv)) &&
         JSON.stringify(oldOther) === JSON.stringify(newOther);
});
const stage3OnlyActivation = deployCdn === true &&
  plan.variables?.enabled?.value === true &&
  counts.create === 0 && counts.update === 4 &&
  counts.delete === 0 && counts.replace === 0 && counts.other === 0 &&
  approvedFunctionToggles.length === 4 &&
  pendingUpdates.length === 4;
console.log("Stage-3 exact four function flag toggles:",
  stage3OnlyActivation ? "YES" : "NO");

// Stage 4: enable only temporary operational logs on dispatch/process/maintenance.
// The private image origin must stay unlogged. Stage 5 rolls the same three
// flags back off. Neither stage can change code, secrets, IAM or other resources.
const diagnosticNames = ["dispatch", "maintenance", "process"];
const diagnosticAddresses = new Set(
  diagnosticNames.map((name) => `yandex_function.gallery["${name}"]`)
);
const diagnosticFlag = plan.variables?.diagnostic_logging?.value;
const expectedBefore = diagnosticFlag === true;
const expectedAfter = diagnosticFlag === false;
function loggingOptions(value, expectedDisabled) {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const option = value[0];
  if (!option || typeof option !== "object" ||
      option.disabled !== expectedDisabled) return null;
  const { disabled, ...remaining } = option;
  // A custom destination or filter must never be slipped in with the flag.
  return remaining;
}
const loggingUpdates = resourceChanges.filter((change) => {
  if (change.change?.actions?.join(",") !== "update" ||
      !diagnosticAddresses.has(change.address)) return false;
  const before = change.change.before ?? {};
  const after = change.change.after ?? {};
  if (before.environment?.GALLERY_ENABLED !== "true" ||
      after.environment?.GALLERY_ENABLED !== "true") return false;
  const oldOptions = loggingOptions(before.log_options, expectedBefore);
  const newOptions = loggingOptions(after.log_options, expectedAfter);
  if (!oldOptions || !newOptions ||
      JSON.stringify(oldOptions) !== JSON.stringify(newOptions)) return false;
  const { log_options: _oldLogging, ...oldOther } = before;
  const { log_options: _newLogging, ...newOther } = after;
  return JSON.stringify(oldOther) === JSON.stringify(newOther);
});
const origin = resourceChanges.find((change) =>
  change.address === 'yandex_function.gallery["origin"]');
const originRemainsUnlogged = origin?.change?.actions?.join(",") === "no-op" &&
  origin.change.before?.environment?.GALLERY_ENABLED === "true" &&
  origin.change.after?.environment?.GALLERY_ENABLED === "true" &&
  loggingOptions(origin.change.before?.log_options, true) !== null &&
  loggingOptions(origin.change.after?.log_options, true) !== null;
const onlyDiagnosticLogging = deployCdn === true &&
  plan.variables?.enabled?.value === true &&
  typeof diagnosticFlag === "boolean" &&
  counts.create === 0 && counts.update === 3 &&
  counts.delete === 0 && counts.replace === 0 && counts.other === 0 &&
  pendingUpdates.length === 3 &&
  loggingUpdates.length === 3 &&
  originRemainsUnlogged;
console.log("Stage-4/5 only three diagnostic logging flags:",
  onlyDiagnosticLogging ? "YES" : "NO");
console.log("Private origin logging remains disabled:",
  originRemainsUnlogged ? "YES" : "NO");
if (counts.create || counts.delete || counts.replace || counts.other ||
    unexpected.length || otherFolders.length || !resourceChanges.length ||
    !(stage3OnlyActivation || onlyDiagnosticLogging)) safe = false;
console.log("Preliminary plan safety checks:", safe ? "PASS" : "REVIEW_REQUIRED");
console.log("This does not apply changes or verify cloud IAM, costs, or runtime readiness.");
process.exitCode = safe ? 0 : 2;
