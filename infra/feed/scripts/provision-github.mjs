import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parse } from "dotenv";
const config = parse(readFileSync(".env"));
const env = { ...process.env, AWS_ACCESS_KEY_ID: config.AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: config.AWS_SECRET_ACCESS_KEY, AWS_EC2_METADATA_DISABLED: "true" };
function run(command, args, input, environment = process.env) {
 const result = spawnSync(command, args, { input, env: environment, encoding: "utf8", maxBuffer: 4*1024*1024, timeout: 30_000 });
 if (result.status !== 0) throw new Error(`FEED_${command.toUpperCase()}_FAILED`);
 return result.stdout;
}
const existing = new Set(JSON.parse(run("gh", ["secret","list","--env","production","--json","name"])).map(x=>x.name));
const recordsPath = "infra/feed/.secrets/github-provisioned.json";
const provisioned = existsSync(recordsPath) ? JSON.parse(readFileSync(recordsPath)) : [];
const output = name => run("terraform",["-chdir=infra/feed","output","-raw",name],undefined,env).trim();
const key = output("build_service_account_key");
const parsedKey = JSON.parse(key);
if (!parsedKey.id || !parsedKey.service_account_id || !parsedKey.private_key?.includes("PRIVATE KEY")) throw new Error("BUILD_KEY_INVALID");
const id = output("web_lockbox_secret_id");
const entries = JSON.parse(run("yc",["lockbox","payload","get","--id",id,"--format","json"])).entries;
const allowed = ["FEED_S3_ACCESS_KEY_ID","FEED_S3_SECRET_ACCESS_KEY","FEED_CDN_SECRET","FEED_INTERNAL_HMAC_SECRET"];
const values = Object.fromEntries(entries.filter(x=>allowed.includes(x.key)).map(x=>[x.key,x.text_value]));
if (Object.keys(values).length !== 4 || allowed.some(name=>typeof values[name] !== "string" || !values[name].trim() || /[\r\n]/.test(values[name]))) throw new Error("FEED_PAYLOAD_INVALID");
const desired = { FEED_YC_SERVICE_ACCOUNT_KEY: key, ...values };
for(const name of Object.keys(desired)) if(existing.has(name) && !provisioned.includes(name)) throw new Error(`NO_OVERWRITE_${name}`);
for(const [name,value] of Object.entries(desired)) {
 if(existing.has(name)) { console.log(`${name}: ALREADY_PROVISIONED`);continue; }
 run("gh",["secret","set",name,"--env","production"],value);
 provisioned.push(name);writeFileSync(recordsPath,JSON.stringify(provisioned),{mode:0o600});console.log(`${name}: CREATED`);
}
