/** Isolated HTTP integration, not a Cloud.ru/S3-provider conformance test.
 * Actual AWS SDK HTTP, presigned multipart POST and Sharp bytes never leave
 * 127.0.0.1:9501; no live Cloud credentials or production buckets are used.
 */
import { createServer, type Server } from "node:http";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { questionsV2SourceKey, questionsV2FinalKeys, type QuestionsV2Job } from "@gafus/feed-cloud";
import { questionsV2PresignedPost, questionsV2Head, questionsV2SignedRead,
  questionsV2Marker, questionsV2Delete } from "@gafus/cdn-upload";
import { processQuestionsV2Photo } from "./questions-v2-processor";
import { createQuestionsV2S3Objects } from "./questions-v2-s3-objects";

const endpoint = "http://127.0.0.1:9501";
const bucket = "gafus-refactor-questions-test";
const keys = new Map<string, { body: Buffer; mime: string }>();
const requests: Record<string,number> = { POST:0,GET:0,PUT:0,HEAD:0,DELETE:0 };
const envNames = ["QUESTIONS_V2_MEDIA_ENABLED", "QUESTIONS_V2_S3_BUCKET",
  "QUESTIONS_V2_S3_ENDPOINT", "QUESTIONS_V2_S3_REGION",
  "QUESTIONS_V2_S3_ACCESS_KEY_ID", "QUESTIONS_V2_S3_SECRET_ACCESS_KEY",
  "QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED", "GAFUS_LOCAL_ISOLATED_API"] as const;
const prior = new Map<string,string|undefined>();
let server:Server;
// Real HMAC validation for AWS SigV4 POST policy, entirely synthetic keys.
// This is still not Cloud.ru S3's authentication or ACL implementation.
function signedPolicyValid(form:FormData,bodyLength:number):boolean{
  const get=(key:string)=>form.get(key)?.toString()??"";
  const policy=get("Policy"),credential=get("X-Amz-Credential"),
    stamp=get("X-Amz-Date"),signature=get("X-Amz-Signature"),
    algorithm=get("X-Amz-Algorithm");
  const scope=credential.split("/");
  if(algorithm!=="AWS4-HMAC-SHA256" || !policy ||
      scope.length!==5 || scope[0]!==process.env.QUESTIONS_V2_S3_ACCESS_KEY_ID ||
      scope[1]!==stamp.slice(0,8) || scope[2]!=="ru-central-1" ||
      scope[3]!=="s3" || scope[4]!=="aws4_request" ||
      !/^\d{8}T\d{6}Z$/.test(stamp) || !/^[0-9a-f]{64}$/.test(signature))return false;
  try {
    const hmac=(key:Buffer|string,value:string)=>createHmac("sha256",key).update(value).digest();
    const date=hmac("AWS4"+process.env.QUESTIONS_V2_S3_SECRET_ACCESS_KEY!,scope[1]!);
    const region=hmac(date,scope[2]!);
    const service=hmac(region,scope[3]!);
    const signing=hmac(service,"aws4_request");
    const digest=hmac(signing,policy);
    if(!timingSafeEqual(digest,Buffer.from(signature,"hex")))return false;
    const parsed=JSON.parse(Buffer.from(policy,"base64").toString("utf8")) as {
      expiration:string;conditions:unknown[];
    };
    if(!Array.isArray(parsed.conditions) || Date.parse(parsed.expiration)<Date.now())return false;
    let lengthAllowed=false;
    const entries=[...form.entries()].filter(([key])=>key!=="file");
    for(const condition of parsed.conditions){
      if(Array.isArray(condition) && condition[0]==="content-length-range"){
        if(bodyLength<condition[1] || bodyLength>condition[2])return false;
        lengthAllowed=true;
      }else if(Array.isArray(condition) && condition[0]==="eq"){
        if(get(String(condition[1]).slice(1))!==condition[2])return false;
      }else if(condition && typeof condition==="object" && !Array.isArray(condition)){
        for(const [key,value] of Object.entries(condition)){
          if(key==="bucket"){
            if(value!==bucket)return false;
          }else if(get(key)!==value)return false;
        }
      }else return false;
    }
    // Accept only signed fields, except AWS-approved metadata and signature itself.
    const signedFields=new Set<string>();
    for(const condition of parsed.conditions){
      if(Array.isArray(condition) && condition[0]==="eq")
        signedFields.add(String(condition[1]).slice(1).toLowerCase());
      else if(condition && typeof condition==="object" && !Array.isArray(condition))
        Object.keys(condition).forEach(field=>signedFields.add(field.toLowerCase()));
    }
    return lengthAllowed && entries.every(([field])=>
      field.toLowerCase()==="x-amz-signature" ||
      field.toLowerCase()==="policy" || signedFields.has(field.toLowerCase()));
  }catch{return false;}
}

const read = async (stream:AsyncIterable<Uint8Array>) => {
  const chunks:Buffer[] = [];let size=0;
  for await (const chunk of stream) {
    size += chunk.byteLength;
    if (size>12*1024*1024) throw Error("LOOPBACK_TOO_LARGE");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

beforeAll(async()=>{
  for (const name of envNames) prior.set(name,process.env[name]);
  Object.assign(process.env,{
    GAFUS_LOCAL_ISOLATED_API:"1",QUESTIONS_V2_MEDIA_ENABLED:"true",
    QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED:"true",
    QUESTIONS_V2_S3_BUCKET:bucket,QUESTIONS_V2_S3_ENDPOINT:endpoint,
    QUESTIONS_V2_S3_REGION:"ru-central-1",
    QUESTIONS_V2_S3_ACCESS_KEY_ID:"isolated-questions-test-key",
    QUESTIONS_V2_S3_SECRET_ACCESS_KEY:"isolated-questions-test-only-not-a-real-secret",
  });
  server=createServer(async(req,res)=>{
    try {
      const url=new URL(req.url??"/",endpoint);
      const method=req.method??"";
      if(req.headers.host!=="127.0.0.1:9501" ||
         !(url.pathname.startsWith("/"+bucket+"/") ||
           (method==="POST" && url.pathname==="/"+bucket))){
        res.writeHead(403).end();return;
      }
      if(!(method in requests)){res.writeHead(405).end();return;}
      requests[method]!++;
      // POST uses actual synthetic SigV4 HMAC policy verification below.
      // Non-POST SDK calls only check signature presence: Cloud ACL/CORS remain untested.
      if(!req.headers.authorization && !url.searchParams.has("X-Amz-Signature") &&
         method!=="POST") {res.writeHead(403).end();return;}
      if(method==="POST"){
        const body=await read(req);
        const form=await new Request(endpoint,{method:"POST",
          headers:{"content-type":String(req.headers["content-type"])},body}).formData();
        const key=form.get("key")?.toString();
        const file=form.get("file");
        const mime=form.get("Content-Type")?.toString();
        if(!key||!(file instanceof Blob)|| !mime || file.type!==mime ||
           !form.get("Policy") && !form.get("policy") ||
           !form.get("X-Amz-Signature") && !form.get("x-amz-signature") ||
           form.get("success_action_status")!=="204" ||
           !signedPolicyValid(form,body.length)){
          res.writeHead(400).end();return;
        }
        keys.set(key,{body:Buffer.from(await file.arrayBuffer()),mime});
        res.writeHead(204).end();return;
      }
      const key=decodeURIComponent(url.pathname.slice(bucket.length+2));
      if(method==="PUT"){
        const body=await read(req);
        const md5=createHash("md5").update(body).digest("base64");
        if(req.headers["if-none-match"]==="*" && keys.has(key)){
          res.writeHead(412).end();return;
        }
        if(req.headers["content-md5"]!==md5){res.writeHead(400).end();return;}
        keys.set(key,{body,mime:String(req.headers["content-type"]??"")});
        res.writeHead(200,{etag:'"'+createHash("md5").update(body).digest("hex")+'"'}).end();return;
      }
      if(method==="DELETE"){
        keys.delete(key);res.writeHead(204).end();return;
      }
      const object=keys.get(key);
      if(!object){res.writeHead(404,{"content-type":"application/xml"})
        .end("<Error><Code>NoSuchKey</Code></Error>");return;}
      const headers={"content-type":object.mime,"content-length":String(object.body.length),
        etag:'"'+createHash("md5").update(object.body).digest("hex")+'"'};
      res.writeHead(200,headers);
      if(method==="GET")res.end(object.body);else res.end();
    }catch {res.writeHead(500).end();}
  });
  // Fail rather than ever contacting a pre-existing service on this port.
  await new Promise<void>((resolve,reject)=>{
    server.once("error",reject);
    server.listen(9501,"127.0.0.1",()=>{server.off("error",reject);resolve();});
  });
},20_000);
afterAll(async()=>{
  if(server?.listening){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  keys.clear();
  for(const name of envNames){const v=prior.get(name);if(v===undefined)delete process.env[name];else process.env[name]=v;}
});

async function uploadAndProcess(index:number){
  const ownerId="actor_loopback_"+index;
  const mediaId=randomUUID();
  const source=await sharp({create:{width:790,height:1180,channels:3,
    background:{r:100+index,g:90,b:145}}}).png().toBuffer();
  const claim:QuestionsV2Job={mediaId,ownerId,sourceMime:"image/png",sourceBytes:source.length,
    sourceKey:questionsV2SourceKey(ownerId,mediaId,"image/png")};
  const signed=await questionsV2PresignedPost(claim.sourceKey,claim.sourceMime,source.length);
  const form=new FormData();
  for(const [k,v] of Object.entries(signed.fields))form.append(k,v);
  form.append("file",new Blob([source],{type:"image/png"}),"photo.png");
  const posted=await fetch(signed.url,{method:"POST",body:form,redirect:"error"});
  expect(posted.status).toBe(204);
  expect(await questionsV2Head(claim.sourceKey)).toMatchObject({bytes:source.length,mime:"image/png"});
  const objects=createQuestionsV2S3Objects(claim);
  let manifest;
  try{manifest=await processQuestionsV2Photo(claim,objects,new AbortController().signal);}
  finally{objects.close();}
  const final=questionsV2FinalKeys(ownerId,mediaId);
  expect(manifest.variants.small).toMatchObject({key:final.small,width:360});
  expect(manifest.variants.medium).toMatchObject({key:final.medium,width:720});
  const signedRead=await questionsV2SignedRead(questionsV2Marker(final.medium));
  expect(signedRead).toContain("X-Amz-Signature=");
  const fetched=await fetch(signedRead,{redirect:"error"});
  expect(fetched.status).toBe(200);
  expect(fetched.headers.get("content-type")).toBe("image/webp");
  const saved=Buffer.from(await fetched.arrayBuffer());
  expect((await sharp(saved).metadata()).width).toBe(720);
  expect(saved.length).toBe(manifest.variants.medium.bytes);
  await questionsV2Delete([claim.sourceKey,final.small,final.medium]);
  expect(keys.has(final.medium)).toBe(false);
}
describe("Questions V2 real loopback S3-compatible HTTP transport",()=>{
  it("signed POST -> actual SDK HEAD/GET -> Sharp two WebP PUTs -> signed GET -> DELETE",async()=>{
    const before={...requests};
    await uploadAndProcess(0);
    expect(requests.POST-before.POST).toBe(1);
    expect(requests.PUT-before.PUT).toBe(2);
    expect(requests.HEAD-before.HEAD).toBe(1);
    expect(requests.GET-before.GET).toBe(2);
    expect(requests.DELETE-before.DELETE).toBe(3);
  },30_000);
  it("denies unsigned direct reads and rejects tampered signed form without S3 writes",async()=>{
    const source=await sharp({create:{width:32,height:32,channels:3,
      background:"#445566"}}).png().toBuffer();
    const mediaId=randomUUID();
    const key=questionsV2SourceKey("actor_loopback_denied",mediaId,"image/png");
    const signed=await questionsV2PresignedPost(key,"image/png",source.length);
    const form=(overrides:Record<string,string>)=>{
      const data=new FormData();
      for(const [k,v] of Object.entries(signed.fields))data.append(k,overrides[k]??v);
      data.append("file",new Blob([source],{type:"image/png"}),"photo.png");
      return data;
    };
    const beforeSize=keys.size;
    for(const override of [
      {key:questionsV2SourceKey("actor_loopback_foreign",randomUUID(),"image/png")},
      {"Content-Type":"image/jpeg"},
      {"X-Amz-Signature":"0".repeat(64)},
      {"success_action_status":"201"},
    ]){
      const response=await fetch(signed.url,{method:"POST",body:form(override)});
      expect(response.status).toBe(400);
      expect(keys.size).toBe(beforeSize);
    }
    const tiny=new FormData();
    for(const [k,v] of Object.entries(signed.fields))tiny.append(k,v);
    tiny.append("file",new Blob([Buffer.alloc(12)],{type:"image/png"}),"short.png");
    // S3 validates total multipart envelope length, not the exact file bytes.
    // A shorter file can legitimately satisfy policy; Hono confirm must HEAD
    // the object and reject when ContentLength differs from reserved bytes.
    expect((await fetch(signed.url,{method:"POST",body:tiny})).status).toBe(204);
    expect(await questionsV2Head(key)).toMatchObject({bytes:12,mime:"image/png"});
    expect((await questionsV2Head(key)).bytes).not.toBe(source.length);
    const unsigned=await fetch(endpoint+"/"+bucket+"/"+key);
    expect(unsigned.status).toBe(403);
    await questionsV2Delete([key]);
    expect(keys.size).toBe(beforeSize);
  });
  it("five parallel independent photos stay scoped to each owner's keys",async()=>{
    const before={...requests};
    await Promise.all(Array.from({length:5},(_,i)=>uploadAndProcess(i+1)));
    expect(requests.POST-before.POST).toBe(5);
    expect(requests.PUT-before.PUT).toBe(10);
    expect(requests.HEAD-before.HEAD).toBe(5);
    expect(requests.GET-before.GET).toBe(10);
    expect(requests.DELETE-before.DELETE).toBe(15);
    expect(keys.size).toBe(0);
  },60_000);
});
