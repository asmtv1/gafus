import {test} from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {createHash} from "node:crypto";
import {verifyDeliveryProbes} from "./delivery-probes.mjs";
test("CDN byte readback and unsigned request after cache warm-up",async()=>{
 const bytes=Buffer.from("private restored image"),entry={scope:"gallery",key:"albums/a/thumb.webp",size:bytes.length,
  sha256:createHash("sha256").update(bytes).digest("hex"),meta:{ContentType:"image/webp"}};
 let leak=false,wrong=false,requests=[];
 const server=createServer((req,res)=>{
  requests.push(req.url);
  if(!req.url.includes("?token=qa")&&!leak){res.writeHead(403);res.end();return;}
  res.writeHead(200,{"content-type":"image/webp"});res.end(wrong?Buffer.from("incorrect"):bytes);
 });
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 try {
  const origin="http://127.0.0.1:"+server.address().port;
  const config={sources:{gallery:{endpoint:"https://source.invalid"}},archive:{endpoint:"https://archive.invalid"},otaOrigin:"https://ota.invalid/bucket"};
  const plan={origin,probes:[{scope:entry.scope,key:entry.key,visibility:"private",url:origin+"/"+entry.key+"?token=qa"}]};
  assert.deepEqual(await verifyDeliveryProbes(plan,config,[entry],true),{status:"ISOLATED_CDN_SAMPLES_VERIFIED",verifiedObjects:1,privateScopes:["gallery"]});
  assert.deepEqual(requests,["/"+entry.key+"?token=qa","/"+entry.key]);
  leak=true;
  await assert.rejects(verifyDeliveryProbes(plan,config,[entry],true),/DELIVERY_PROBE_PRIVATE_CACHE_LEAK/);
  leak=false;wrong=true;
  await assert.rejects(verifyDeliveryProbes(plan,config,[entry],true),/DELIVERY_PROBE_DIGEST_MISMATCH/);
  await assert.rejects(verifyDeliveryProbes({...plan,origin:"https://cdn.gafus.ru"},config,[entry]),/DELIVERY_PROBE_ORIGIN_NOT_ISOLATED/);
  await assert.rejects(verifyDeliveryProbes({...plan,probes:[{...plan.probes[0],url:"https://cdn.gafus.ru/"+entry.key+"?token=qa"}]},config,[entry],true),/DELIVERY_PROBE_URL_NOT_ISOLATED/);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
