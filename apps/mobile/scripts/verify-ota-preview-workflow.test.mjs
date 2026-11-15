import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..");
const workflowPath=path.join(repo,".github/workflows/gafus-self-hosted-ota-preview.yml");
const doc=YAML.parseDocument(fs.readFileSync(workflowPath,"utf8"),{uniqueKeys:true});
const steps=doc.toJS().jobs?.["signed-preview"]?.steps||[];
const globalEnv=doc.toJS().jobs?.["signed-preview"]?.env||{};
const step=(name)=>steps.find(x=>x.name?.includes(name));
test("preview workflow is parseable, explicitly triggered and uses isolated environment",()=>{
  assert.equal(doc.errors.length,0);
  const wf=doc.toJS();
  assert.ok(wf.on.workflow_dispatch);
  assert.equal(wf.jobs["signed-preview"].environment,"ota-preview");
  assert.equal(wf.permissions.contents,"read");
  assert.equal(wf.jobs["signed-preview"]["timeout-minutes"],50);
  assert.ok(steps.length>=10);
  assert.equal(wf.jobs["signed-preview"].concurrency,undefined);
});
test("no job-wide private keys, signing keys are confined to signature step",()=>{
  for(const secretName of ["OTA_SIGNING_PRIVATE_KEY_PEM","OTA_S3_ACCESS_KEY","OTA_S3_SECRET_KEY",
    "MOBILE_OTA_CI_CALLBACK_TOKEN","TRACER_SOURCEMAP_TOKEN_MOBILE"])
    assert.equal(Object.hasOwn(globalEnv,secretName),false,`job-wide key ${secretName}`);
  const signer=step("Prepare signed immutable manifest");
  assert.ok(signer?.env?.OTA_SIGNING_PRIVATE_KEY_PEM);
  assert.match(signer.run,/trap 'rm -f/);
  assert.match(signer.run,/chmod 600/);
  assert.match(signer.run,/umask 077/);
  assert.equal(steps.filter(x=>x.env?.OTA_SIGNING_PRIVATE_KEY_PEM).length,1);
});
test("full chain is ordered and publishing is an explicit separate admin action",()=>{
  const names=steps.map(x=>x.name);
  const expected=["Resolve approved native trust","Compare native source fingerprint",
    "Run architecture","Create an ephemeral","Prepare signed immutable",
    "Upload immutable assets","Prepare and verify SDK57 private maps",
    "Upload SDK57 maps to immutable private S3","Register verified signed preview"];
  const indices=expected.map(x=>names.findIndex(n=>n.includes(x)));
  assert.ok(indices.every(n=>n>=0));
  assert.deepEqual(indices,[...indices].sort((a,b)=>a-b));
  assert.doesNotMatch(steps.map(x=>x.run||"").join("\n"),/eas update|\/(?:deployments\/[^ ]+\/publish)/i);
  assert.match(step("Register verified signed preview")?.name||"",/never auto-publish/);
});
test("preview OTA CI pins the verified native binary to source-controlled signing trust and preview origin",()=>{
  const resolver=step("Resolve approved native trust");
  assert.match(resolver.run,/verify-ota-preview-native-trust\.mjs/);
  assert.ok(resolver?.env?.MOBILE_OTA_API_ORIGIN);
  assert.match(resolver.run,/verify-ota-preview-native-trust\.mjs[\s\S]*cp /);
  assert.ok(fs.existsSync(path.join(repo,
    "apps/mobile/ota-public-certificates/gafus-preview-20261114.cert.txt")));
});
test("every referenced repository JS entrypoint exists before attempting CI",()=>{
  const scripts=steps.map(x=>x.run||"").join("\n");
  const referenced=[...scripts.matchAll(/\bnode\s+(apps\/mobile\/scripts\/[A-Za-z0-9_.-]+|packages\/cdn-upload\/scripts\/[A-Za-z0-9_.-]+)/g)];
  assert.ok(referenced.length>=5);
  for(const match of referenced) assert.ok(fs.existsSync(path.join(repo,match[1])),match[1]);
});
test("frozen lockfile includes new OTA server dependency and matching toolchain",()=>{
  const lock=YAML.parse(fs.readFileSync(path.join(repo,"pnpm-lock.yaml"),"utf8"));
  const api=lock.importers["apps/api"];
  const server=lock.importers["packages/mobile-ota-server"];
  assert.equal(api.dependencies["@gafus/mobile-ota-server"].specifier,"workspace:*");
  const pkg=JSON.parse(fs.readFileSync(path.join(repo,"packages/mobile-ota-server/package.json"),"utf8"));
  for(const [name,version] of Object.entries(pkg.dependencies))
    assert.equal(server.dependencies[name].specifier,version);
  const rootPackage=JSON.parse(fs.readFileSync(path.join(repo,"package.json"),"utf8"));
  for(const [name,version] of Object.entries(pkg.devDependencies)) {
    // pnpm 10 applies the root security override while normalizing importer
    // specifiers. Compare against the effective pin for Vitest, without
    // weakening checks for any other dependency.
    const override=name==="vitest" && version==="^4.0.17"
      ? rootPackage.pnpm?.overrides?.["vitest@<4.1.0"] : null;
    assert.equal(server.devDependencies[name].specifier,override||version);
  }
  assert.match(step("Install pinned pnpm")?.run||"",/pnpm install --frozen-lockfile/);
});
test("preview bundle must use private preview API and source-map naming",()=>{
  assert.ok(globalEnv.EXPO_PUBLIC_API_BASE_URL);
  assert.ok(globalEnv.EXPO_PUBLIC_CHAT2_API_ORIGIN);
  assert.equal(globalEnv.EXPO_PUBLIC_TELEMETRY_ENABLED,"true");
  assert.equal(Object.hasOwn(globalEnv,"EXPO_PUBLIC_TRACER_APP_TOKEN_JS"),false);
  assert.match(step("Create an ephemeral")?.run||"",/self-hosted-ota-public-env\.mjs/);
  const symbols=step("Upload SDK57 maps to immutable private S3");
  assert.equal(symbols?.env?.SYMBOLS_UPLOAD_EXECUTE,"1");
  assert.match(symbols?.run||"",/private-symbol-delivery-evidence\.json/);
  assert.match(symbols?.run||"",/GAFUS_OTA_SYMBOLS_REF=symbols-s3:/);
});

test("preview assets use Cloud.ru public S3 directly, with no CDN and no public write keys",()=>{
  assert.equal(globalEnv.OTA_PUBLIC_ASSET_ORIGIN,"${{ vars.OTA_PUBLIC_ASSET_ORIGIN }}");
  assert.equal(Object.hasOwn(globalEnv,"OTA_CDN_ORIGIN"),false);
  const signer=step("Prepare signed immutable");
  const uploader=step("Upload immutable assets");
  assert.match(signer?.run||"",/--asset-base "\$OTA_ASSET_BASE"/);
  assert.match(uploader?.name||"",/public S3 readback/);
  assert.match(uploader?.run||"",/OTA_PUBLIC_ASSET_ORIGIN/);
  assert.equal(Object.hasOwn(globalEnv,"OTA_S3_SECRET_KEY"),false);
  assert.ok(uploader?.env?.OTA_S3_SECRET_KEY);
  assert.equal(globalEnv.OTA_S3_TENANT_ID,"${{ vars.OTA_S3_TENANT_ID }}");
  assert.match(uploader.run,/OTA_S3_ACCESS_KEY="\$OTA_S3_TENANT_ID:\$OTA_S3_ACCESS_KEY"/);
  assert.match(uploader.run,/Cloud\.ru S3 tenant ID does not match/);
});

test("preflight verifies required OTA configuration before installing dependencies, without exposing secret bytes",()=>{
  const names=steps.map(s=>s.name);
  const preflight=step("Fail fast if the preview signing");
  assert.ok(preflight);
  assert.ok(names.indexOf(preflight.name)<names.indexOf(step("Install pinned pnpm").name));
  for(const key of ["OTA_S3_ACCESS_KEY","OTA_S3_SECRET_KEY","OTA_SIGNING_PRIVATE_KEY_PEM",
    "MOBILE_OTA_CI_CALLBACK_TOKEN","SYMBOLS_S3_BUCKET",
    "SYMBOLS_S3_ENDPOINT","SYMBOLS_S3_ACCESS_KEY","SYMBOLS_S3_SECRET_KEY"]) {
    assert.match(preflight.env[`HAS_${key}`], /secrets\./);
    assert.equal(Object.hasOwn(preflight.env,key),false);
  }
  assert.match(preflight.run,/Missing required Actions secret/);
  assert.match(preflight.run,/Missing required Actions variable/);
  assert.match(preflight.run,/global\.s3\.cloud\.ru\/gafus-ota-updates/);
});

test("production deployment activates signed OTA only behind configured credentials and verified native releases",()=>{
  const deploy=fs.readFileSync(path.join(repo,'.github/workflows/production-deploy-reusable.yml'),'utf8');
  assert.match(deploy,/MOBILE_OTA_ASSET_ORIGIN=https:\/\/global\.s3\.cloud\.ru\/gafus-ota-updates/);
  assert.match(deploy,/MOBILE_OTA_CI_CALLBACK_TOKEN=\$\{\{ secrets\.MOBILE_OTA_CI_CALLBACK_TOKEN \}\}/);
  assert.match(deploy,/MOBILE_OTA_DELIVERY_ENV=production/);
  assert.match(deploy,/MOBILE_OTA_PRODUCTION_MANIFEST_ENABLED/);
  assert.match(deploy,/MOBILE_OTA_INSTALLATION_HASH_KEY=\$\{\{ secrets\.MOBILE_OTA_INSTALLATION_HASH_KEY \}\}/);
  const compose=YAML.parseDocument(fs.readFileSync(path.join(repo,'ci-cd/docker/docker-compose.prod.yml'),'utf8'),{uniqueKeys:true});
  assert.equal(compose.errors.length,0);
  const api=compose.toJS().services.api.environment;
  const defaults=new Map(api.filter(x=>x.startsWith('MOBILE_OTA_')).map(x=>x.split(/=(.*)/s).slice(0,2)));
  assert.equal(defaults.get('MOBILE_OTA_ASSET_ORIGIN'),'${MOBILE_OTA_ASSET_ORIGIN:-https://global.s3.cloud.ru/gafus-ota-updates}');
  for(const name of ['MOBILE_OTA_CI_CALLBACK_TOKEN','MOBILE_OTA_INSTALLATION_HASH_KEY'])
    assert.equal(defaults.get(name),`\${${name}:-}`);
  assert.equal(defaults.get('MOBILE_OTA_DELIVERY_ENV'),'${MOBILE_OTA_DELIVERY_ENV:-production}');
});
