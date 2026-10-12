#!/usr/bin/env node
/**
 * Minimal, fail-closed GAFUS Voximplant provisioner.
 *
 * Check without credentials:
 *   node infra/voximplant/provision.mjs --environment staging --init
 * With a Voximplant Admin/Owner service-account credentials.json:
 *   node infra/voximplant/provision.mjs --environment staging --plan --credentials /secure/path/credentials.json
 *   node infra/voximplant/provision.mjs --environment staging --apply --credentials /secure/path/credentials.json
 *
 * Keeps secrets and generated User manager private key OUTSIDE the repository.
 */
import { createPrivateKey, createSign, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, mkdir, writeFile, rename, chmod, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ARGS = process.argv.slice(2);
const getArg = (name) => {
  const i = ARGS.indexOf(name);
  return i >= 0 ? ARGS[i + 1] : null;
};
const mode = ["--init", "--plan", "--apply"].filter((flag) => ARGS.includes(flag));
if (mode.length !== 1) throw new Error("Specify exactly one of --init, --plan, --apply");
const environment = getArg("--environment");
if (!["staging", "production"].includes(environment)) throw new Error("Use --environment staging or production");
const appName = environment === "staging" ? "gafus-staging" : "gafus-production";
const scriptPath = fileURLToPath(new URL("./gafus-consultation-conference.js", import.meta.url));
const stateDir = join(homedir(), "Library", "Application Support", "GAFUS", "voximplant");
const statePath = join(stateDir, environment + "-secrets.json");
const runtimeKeyPath = join(stateDir, environment + "-user-manager-key.json");
const envPath = join(stateDir, environment + ".env");
const scenarioName = environment === "staging" ? "gafus_consultation_video" : "gafus_prod_video";
const ruleName = "gafus_consultation_video";
const rulePattern = "^gafus_[a-f0-9]{30}$";
const secretName = "GAFUS_VOX_ADMISSION_SECRET";
const fail = (s) => { throw new Error(s); };
const digest = (s) => createHash("sha256").update(s).digest("hex");

async function saveSecretFile(path, obj) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = path + "." + process.pid + ".tmp";
  await writeFile(tmp, typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  await chmod(tmp, 0o600);
  await rename(tmp, path);
}
async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (e) { if (e.code === "ENOENT") return null; throw e; }
}
function constantMatch(a, b) {
  const aa = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function b64url(v) { return Buffer.from(v).toString("base64url"); }
function signedToken(creds) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: creds.key_id }));
  const payload = b64url(JSON.stringify({ iss: Number(creds.account_id), iat: now, exp: now + 600 }));
  const input = header + "." + payload;
  const signer = createSign("RSA-SHA256");
  signer.update(input);
  return input + "." + signer.sign(createPrivateKey(creds.private_key)).toString("base64url");
}
async function createApi(creds) {
  const token = signedToken(creds);
  return async function api(method, params = {}) {
    const url = new URL("https://api.voximplant.com/platform_api/" + method);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) fail(method + " HTTP " + response.status);
    const data = await response.json();
    if (data.error) fail(method + " failed: " + String(data.error.msg || data.error.message || data.error.code || "provider denied"));
    return data;
  };
}
async function allPages(api, method, params = {}) {
  const rows = [];
  for (let offset = 0; offset <= 10000; offset += 100) {
    const data = await api(method, { ...params, count: 100, offset });
    if (!Array.isArray(data.result)) fail(method + " returned no result list; verify API permissions");
    rows.push(...data.result);
    if (data.result.length < 100 || rows.length >= (Number(data.total_count) || Infinity)) return rows;
  }
  fail(method + " pagination limit reached");
}
async function ensureSecrets() {
  let state = await readJson(statePath);
  if (!state) {
    state = {
      environment,
      created_at: new Date().toISOString(),
      admission_secret: randomBytes(48).toString("hex"),
      credential_secret: randomBytes(48).toString("hex"),
    };
    await saveSecretFile(statePath, state);
    console.log("Created protected local " + environment + " secrets (values hidden).");
  }
  if (state.environment !== environment || !state.admission_secret || !state.credential_secret
    || state.admission_secret.length < 32 || state.credential_secret.length < 32) fail("Local secret state invalid");
  const file = await stat(statePath);
  if ((file.mode & 0o077) !== 0) fail("Local secret state permissions too broad: " + statePath);
  return state;
}
function formatEnv(creds, runtime, application) {
  const full = application.application_name;
  const parts = full.split(".");
  if (parts.length < 4 || parts[parts.length - 2] !== "voximplant" || parts.at(-1) !== "com") fail("Unexpected application account domain");
  const accountName = parts.slice(1, -2).join(".");
  if (!accountName || parts[0] !== appName) fail("Vox application name mismatch");
  const safe = (s) => JSON.stringify(String(s).replace(/\r/g, "").replace(/\n/g, "\\n"));
  return [
    "# Server-only Vox configuration (" + environment + "). DO NOT COMMIT/SHARE.",
    "VOXIMPLANT_ACCOUNT_ID=" + creds.account_id,
    "VOXIMPLANT_APPLICATION_ID=" + application.application_id,
    "VOXIMPLANT_ACCOUNT_NAME=" + accountName,
    "VOXIMPLANT_APPLICATION_NAME=" + appName,
    "VOXIMPLANT_KEY_ID=" + runtime.key_id,
    "VOXIMPLANT_PRIVATE_KEY=" + safe(runtime.private_key),
    "VOXIMPLANT_CREDENTIAL_SECRET=" + state.credential_secret,
    "VOXIMPLANT_ADMISSION_SECRET=" + state.admission_secret,
    "",
  ].join("\n");
}
let state;
async function main() {
  const scenarioScript = await readFile(scriptPath, "utf8");
  if (!scenarioScript.includes('VoxEngine.getSecretValue("' + secretName + '")')) fail("Scenario references unexpected secret");
  if (!scenarioScript.includes(rulePattern)) fail("Scenario pattern mismatch");
  if (scenarioScript.length >= 128000) fail("Scenario too large");
  const scenarioDigest = digest(scenarioScript);
  state = await ensureSecrets();
  console.log("Environment: " + environment + "; scenario SHA256: " + scenarioDigest.slice(0, 16));
  console.log("Routing: " + rulePattern + " (video_conference=true); max participants=2");
  if (mode[0] === "--init") {
    console.log("Local secret check OK. Voximplant remote settings NOT changed.");
    console.log("Credentials required for cloud provisioning; keep Vox Admin credentials.json outside git.");
    return;
  }
  const credentialsFile = getArg("--credentials");
  if (!credentialsFile) fail("Missing --credentials path to Voximplant Admin/Owner service-account credentials.json");
  const creds = await readJson(resolve(credentialsFile));
  if (!creds || !Number.isSafeInteger(Number(creds.account_id)) || Number(creds.account_id) <= 0
    || !creds.key_id || !creds.private_key) fail("Invalid Voximplant service-account credentials.json");
  const api = await createApi(creds);
  // Read all before mutating. Do not confuse a substring match with the exact GAFUS app.
  const applications = await allPages(api, "GetApplications");
  const matches = applications.filter((a) => a.application_name?.split(".")[0] === appName);
  if (matches.length > 1) fail("Ambiguous existing applications");
  const oldApp = matches[0] || null;
  console.log("Provider authenticated; application " + appName + ": " + (oldApp ? "exists" : "absent"));
  if (mode[0] === "--plan") {
    if (oldApp) {
      const appId = oldApp.application_id;
      const [scenarios, rules, secrets] = await Promise.all([
        allPages(api, "GetScenarios", { application_id: appId }),
        allPages(api, "GetRules", { application_id: appId, with_scenarios: "true" }),
        allPages(api, "GetSecrets", { application_id: appId }),
      ]);
      console.log("Scenario: " + (scenarios.some((s) => s.scenario_name === scenarioName) ? "exists" : "absent"));
      console.log("Routing rule: " + (rules.some((r) => r.rule_name === ruleName) ? "exists" : "absent"));
      console.log("Secret: " + (secrets.some((s) => s.secret_name === secretName) ? "exists" : "absent"));
    }
    console.log("READ-ONLY PLAN complete. No Vox cloud writes.");
    return;
  }
  // Only GAFUS-namespaced resources may be created; never delete or overwrite unrelated resources.
  let app = oldApp;
  if (!app) {
    const created = await api("AddApplication", { application_name: appName, secure_record_storage: "true" });
    if (created.result !== 1 || !created.application_id) fail("AddApplication did not confirm creation");
    app = { application_id: created.application_id, application_name: created.application_name };
    console.log("Application created: " + app.application_id);
  }
  const appId = app.application_id;
  const scenarios = await allPages(api, "GetScenarios", { application_id: appId });
  let scenario = scenarios.find((s) => s.scenario_name === scenarioName);
  if (!scenario) {
    const created = await api("AddScenario", { scenario_name: scenarioName, scenario_script: scenarioScript, application_id: appId });
    if (created.result !== 1 || !created.scenario_id) fail("AddScenario did not confirm creation");
    scenario = { scenario_id: created.scenario_id, scenario_name: scenarioName };
    console.log("Scenario uploaded: " + scenario.scenario_id);
  }
  const details = await api("GetScenarios", { scenario_id: scenario.scenario_id, with_script: "true", application_id: appId });
  const loaded = details?.result?.find((s) => Number(s.scenario_id) === Number(scenario.scenario_id));
  if (!loaded || typeof loaded.scenario_script !== "string" || !constantMatch(loaded.scenario_script, scenarioScript)) {
    fail("Scenario source cannot be verified exactly; abort without routing it");
  }
  console.log("Scenario source verified.");
  const secrets = await allPages(api, "GetSecrets", { application_id: appId });
  const savedSecret = secrets.find((s) => s.secret_name === secretName);
  const getSecretString = (reply) => {
    const obj = Array.isArray(reply.result) ? reply.result[0] : reply.result;
    return obj?.secret_value;
  };

  if (savedSecret) {
    const secretInfo = await api("GetSecretValue", { application_id: appId, secret_name: secretName });
    const value = getSecretString(secretInfo);

    if (typeof value !== "string" || !constantMatch(value, state.admission_secret)) fail("Existing admission secret does not match local protected state");
  } else {
    const added = await api("AddSecret", { application_id: appId, secret_name: secretName, secret_value: state.admission_secret,
      description: "GAFUS " + environment + " admission HMAC; server-only" });
    if (!added.result) fail("AddSecret failed");
    console.log("Provider admission secret created.");
    const verify = await api("GetSecretValue", { application_id: appId, secret_name: secretName });
    const value = getSecretString(verify);
    if (typeof value !== "string" || !constantMatch(value, state.admission_secret)) fail("Provider admission secret verification failed");
  }
  console.log("Admission secret verified, exact match.");
  let runtime = await readJson(runtimeKeyPath);
  if (!runtime) {
    const availableRoles = await api("GetRoles");
    if (!availableRoles.result?.some((r) => r.role_name === "UserManager")) fail("UserManager role not present");
    const response = await api("CreateKey", { key_name: "gafus-" + environment + "-user-manager", role_name: "UserManager",
      description: "GAFUS " + environment + " GetUsers / AddUser only" });
    runtime = response.result;
    if (!runtime || !runtime.key_id || !runtime.private_key || Number(runtime.account_id) !== Number(creds.account_id)) {
      fail("CreateKey returned unexpected User manager key");
    }
    await saveSecretFile(runtimeKeyPath, runtime);
    console.log("Restricted User manager key created and stored outside git.");
  }
  const runtimeInfo = await stat(runtimeKeyPath);
  if ((runtimeInfo.mode & 0o077) !== 0) fail("User manager key file permissions too broad");
  const runtimeApi = await createApi(runtime);
  const usersCheck = await runtimeApi("GetUsers", { application_id: appId, count: 1 });
  if (!Array.isArray(usersCheck.result)) fail("Restricted User manager key cannot read app users");
  console.log("Restricted User manager access verified (GetUsers).");
  const rules = await allPages(api, "GetRules", { application_id: appId, with_scenarios: "true" });
  let rule = rules.find((r) => r.rule_name === ruleName);
  if (!rule) {
    const created = await api("AddRule", { application_id: appId, rule_name: ruleName, rule_pattern: rulePattern,
      video_conference: "true", scenario_id: scenario.scenario_id });
    if (created.result !== 1 || !created.rule_id) fail("AddRule did not confirm creation");
    console.log("Video routing rule created: " + created.rule_id);
    rule = { rule_id: created.rule_id };
  }
  const verifiedRule = (await allPages(api, "GetRules", { application_id: appId, with_scenarios: "true" }))
    .find((r) => Number(r.rule_id) === Number(rule.rule_id));
  if (!verifiedRule || ![rulePattern, rulePattern.slice(1, -1)].includes(verifiedRule.rule_pattern) || verifiedRule.video_conference !== true
    || !verifiedRule.scenarios?.some((s) => Number(s.scenario_id) === Number(scenario.scenario_id))) {
    fail("Provider video rule does not match scenario/pattern/video flags");
  }
  console.log("Routing/video scenario linkage verified.");
  const envText = formatEnv(creds, runtime, app);
  const priorEnv = await readFile(envPath, "utf8").catch((e) => { if (e.code === "ENOENT") return null; throw e; });
  if (priorEnv && !constantMatch(priorEnv, envText)) fail("Existing server .env differs: refusing to overwrite " + envPath);
  if (!priorEnv) await saveSecretFile(envPath, envText);
  console.log("READY: application=" + appId + " scenario=" + scenario.scenario_id + " rule=" + verifiedRule.rule_id);
  console.log("Backend server-only env file: " + envPath + " (private, contents NOT printed)");
  console.log("Cloud resources configured. Two-user media E2E and backend env deployment are STILL required.");
}
main().catch((e) => { console.error("BLOCKED: " + e.message); process.exitCode = 1; });
