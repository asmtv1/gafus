/** Real HTTP recovery scenario. No mocks, prod calls, external credentials, or
 * secrets in receipts. Only the private A2 launcher can supply fixture data. */
import assert from "node:assert/strict";
import { createHash, randomUUID, verify } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const dir = process.env.A2_OBS_WORK_DIR ?? "";
const secret = process.env.A2_OBS_KEY ?? "";
const phase = process.argv[2];
assert.equal(process.env.GAFUS_A2_OBS_ISOLATED, "1");
assert.match(dir, /^\/tmp\/gafus-a2-obs-real-multi\.[a-zA-Z0-9]+$/);
assert.ok(secret.length >= 32);
assert.ok(["seed", "verify"].includes(phase));
const base = "http://127.0.0.1:56244";
const actorHeaders = { "X-Client-Platform": "ios", "X-Client-Version": "1.7.6",
  "X-Client-Build": "900001", "X-Client-Ota-Revision": "1" };
async function call(path, method="GET", token, body, extra={}) {
  return fetch(base+path,{method,redirect:"error",signal:AbortSignal.timeout(10000),
    headers:{...actorHeaders,...(token?{Authorization:"Bearer "+token}:{}),
      ...(body!==undefined?{"Content-Type":"application/json"}:{}),...extra},
    ...(body!==undefined?{body:JSON.stringify(body)}:{})});
}
async function json(res,status) {
  assert.equal(res.status,status,"unexpected HTTP status");
  return await res.json();
}
const file=join(dir,"restore-user-fixture.json");
const fixture=phase==="seed"
  ? await json(await call("/__a2_restore_seed","POST",secret),200)
  : JSON.parse(await readFile(file,"utf8"));
if(phase==="seed") await writeFile(file,JSON.stringify(fixture),{flag:"wx",mode:0o600});
async function login(username) {
  const result=await json(await call("/api/v1/auth/login","POST",undefined,{username,password:fixture.password}),200);
  assert.equal(result.success,true);assert.equal(typeof result.data.accessToken,"string");
  return result.data.accessToken;
}
const owner=await login(fixture.ownerName);
const outsider=await login(fixture.outsiderName);
const me=await json(await call("/api/v1/auth/me","GET",owner),200);
assert.equal(me.data.id,fixture.ownerId);
const other=await json(await call("/api/v1/auth/me","GET",outsider),200);
assert.equal(other.data.id,fixture.outsiderId);
const day="/api/v1/training/day?courseType="+encodeURIComponent(fixture.courseType)+"&dayOnCourseId="+encodeURIComponent(fixture.dayId)+"&createIfMissing=false";
assert.equal((await call(day,"GET",owner)).status,200,"owner private course");
assert.equal((await call(day,"GET",outsider)).status,403,"outsider private course");
const walk={clientId:fixture.walkId,startedAt:"2026-11-05T09:00:00.000Z",finishedAt:"2026-11-05T10:00:00.000Z",
  durationSeconds:1800,steps:2500,estimatedMeters:2000,timerMode:"stopwatch",incompleteSteps:false};
if(phase==="seed"){
  const sync=await json(await call("/api/v1/walks/sync?response=ack","PUT",owner,{walks:[walk]}),200);
  assert.ok(sync.data.accepted.includes(walk.clientId));
}
const walks=await json(await call("/api/v1/walks","GET",owner),200);
assert.equal(walks.data.find(row=>row.clientId===fixture.walkId)?.steps,2500);
const foreign=await json(await call("/api/v1/walks","GET",outsider),200);
assert.ok(!foreign.data.some(row=>row.clientId===fixture.walkId));
const media=await json(await call("/__a2_restore_media","GET",secret),200);
assert.equal(media.sha256,fixture.mediaSha256);assert.equal(media.ownerId,fixture.ownerId);
const manifest=await call("/ota/manifest","GET",undefined,undefined,{
  "expo-protocol-version":"1","expo-platform":"ios","expo-runtime-version":"1.7.6","expo-channel-name":"preview",
  "x-gafus-native-fingerprint":fixture.fingerprint,
  "expo-expect-signature":'sig, keyid="'+fixture.keyId+'", alg="rsa-v1_5-sha256"',
  accept:"application/expo+json, application/json, multipart/mixed",
});
assert.equal(manifest.status,200);
const body=Buffer.from(await manifest.arrayBuffer());
const signature=manifest.headers.get("expo-signature")?.match(/^sig="([A-Za-z0-9+/=]+)", keyid="a2-restore-test", alg="rsa-v1_5-sha256"$/)?.[1];
assert.ok(signature);assert.ok(verify("RSA-SHA256",body,fixture.publicPem,Buffer.from(signature,"base64")));
const parsed=JSON.parse(body.toString("utf8"));
assert.equal(parsed.id,fixture.previousUpdateId);
assert.match(fixture.otaOrigin,/^https:\/\/ota-restore\.invalid\/(?:source-ota|gafus-qa-source-[a-f0-9]{12}-ota)$/);
assert.equal(parsed.launchAsset.url,fixture.otaOrigin+"/ota/preview/gafus/1.7.6/ios/assets/previous.bundle");
const asset=await call("/__a2_restore_asset/previous.bundle","GET",secret);
assert.equal(asset.status,200);
const digest=createHash("sha256").update(Buffer.from(await asset.arrayBuffer())).digest("hex");
assert.equal(digest,fixture.previousAssetSha256);
assert.equal(Buffer.from(digest,"hex").toString("base64url"),parsed.launchAsset.hash);
const activeAsset=await call("/__a2_restore_asset/active.bundle","GET",secret);
assert.equal(activeAsset.status,200);
assert.equal(createHash("sha256").update(Buffer.from(await activeAsset.arrayBuffer())).digest("hex"),fixture.activeAssetSha256);
// Same real Chat2 action before backup and after restore, with fresh server
// request/operation IDs. A group with no recipients avoids external push.
const clientMessageId=randomUUID();
const sent=await call("/api/v1/chats/"+fixture.roomId+"/messages","POST",owner,{clientMessageId,text:"isolated recovery "+phase});
const message=await json(sent,201);
assert.equal(message.success,true);
const operationId=sent.headers.get("x-operation-id"), traceId=sent.headers.get("x-trace-id");
assert.match(operationId??"",/^[a-f0-9-]{36}$/);assert.match(traceId??"",/^[a-f0-9]{32}$/);
const history=await json(await call("/api/v1/chats/"+fixture.roomId+"/messages","GET",owner),200);
assert.ok(history.data.some(row=>row.id===message.data.id));
if(phase==="verify"){
  const previous=JSON.parse(await readFile(join(dir,"restore-user-seed.json"),"utf8"));
  assert.ok(history.data.some(row=>row.id===previous.messageId),"pre-backup chat message missing");
}
const receipt={phase,checks:{auth:true,privateCourse:true,walk:true,mediaBytes:true,previousSignedOta:true,chatHistory:true},
  operationId,traceId,messageId:message.data.id};
await writeFile(join(dir,"restore-user-"+phase+".json"),JSON.stringify(receipt),{flag:"wx",mode:0o600});
console.log("A2_USER_SCENARIO_"+phase.toUpperCase()+"_PASS");
