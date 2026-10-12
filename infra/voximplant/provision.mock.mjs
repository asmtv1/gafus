/* Network-isolated fake Vox Management API; load with --import in tests only. */
import { generateKeyPairSync } from "node:crypto";
let application = null, scenario = null, secret = null, rule = null;
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const manager = {
  account_id: 123456,
  key_id: "test-user-manager-key",
  private_key: rsa.privateKey.export({ type: "pkcs8", format: "pem" }),
};
const okay = (result) => new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
globalThis.fetch = async function (input) {
  const url = new URL(input);
  if (url.hostname !== "api.voximplant.com") throw new Error("Unexpected HTTP target");
  const op = url.pathname.split("/").at(-1);
  const p = Object.fromEntries(url.searchParams);
  switch (op) {
    case "GetApplications": return okay({ result: application ? [application] : [], total_count: application ? 1 : 0 });
    case "AddApplication":
      if (p.application_name !== "gafus-staging") throw new Error("unexpected application");
      application = { application_id: 17, application_name: "gafus-staging.fake.voximplant.com" };
      return okay({ result: 1, ...application });
    case "GetScenarios":
      return okay({ result: scenario ? [{ ...scenario, ...(p.with_script === "true" ? { scenario_script: scenario.source } : {}) }] : [] });
    case "AddScenario":
      scenario = { scenario_id: 24, scenario_name: p.scenario_name, source: p.scenario_script };
      return okay({ result: 1, scenario_id: scenario.scenario_id });
    case "GetSecrets": return okay({ result: secret ? [{ secret_id: 30, secret_name: secret.name }] : [] });
    case "GetSecretValue": return okay({ result: { secret_value: secret.value } });
    case "AddSecret":
      if (p.secret_name !== "GAFUS_VOX_ADMISSION_SECRET") throw new Error("unexpected secret name");
      secret = { name: p.secret_name, value: p.secret_value };
      return okay({ result: [{ secret_id: 30 }] });
    case "GetRoles": return okay({ result: [{role_id: 8, role_name:"UserManager"}] });
    case "CreateKey":
      if (p.role_name !== "UserManager") throw new Error("runtime key overprivileged");
      return okay({ result: manager });
    case "GetUsers": return okay({ result: [], total_count: 0 });
    case "GetRules": return okay({ result: rule ? [{ ...rule, scenarios: [{ scenario_id: 24 }] }] : [] });
    case "AddRule":
      if (p.video_conference !== "true" || p.rule_pattern !== "^gafus_[a-f0-9]{30}$" || p.scenario_id !== "24") {
        throw new Error("insecure route");
      }
      rule = { rule_id: 33, rule_pattern: p.rule_pattern.slice(1,-1), rule_name: p.rule_name, video_conference: true };
      return okay({ result: 1, rule_id: 33 });
    default: throw new Error("Unexpected API method " + op);
  }
};
