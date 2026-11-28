import { createHash } from "node:crypto";
import { must } from "./archive.mjs";

/** Prove delivery through a separately configured, restored CDN. Never
 * resolve a production signed URL or follow a redirect from the QA endpoint. */
export function validateProbeOrigin(origin, config, local) {
  const u=new URL(origin);
  must(!u.username && !u.password && !u.search && !u.hash && u.pathname==="/" &&
    (local ? u.protocol==="http:" && u.hostname==="127.0.0.1" :
      u.protocol==="https:" && /^gafus-restore-[a-z0-9-]+\./.test(u.hostname)),
    "DELIVERY_PROBE_ORIGIN_NOT_ISOLATED");
  must(![...Object.values(config.sources),config.archive].some(c=>new URL(c.endpoint).origin===u.origin) &&
    new URL(config.otaOrigin).origin!==u.origin,"DELIVERY_PROBE_OVERLAPS_SOURCE");
  return u.origin;
}
function urlFor(raw,origin) {
  const u=new URL(raw);
  must(u.origin===origin && !u.username && !u.password && !u.hash,"DELIVERY_PROBE_URL_NOT_ISOLATED");
  return u;
}
async function response(url,headers={}) {
  try {return await fetch(url,{headers,redirect:"error",signal:AbortSignal.timeout(120_000)});}
  catch {throw Error("DELIVERY_PROBE_HTTP_FAILED");}
}
async function assertBytes(res,expected) {
  must(res.status===200 && res.body,"DELIVERY_PROBE_GET_FAILED");
  const digest=createHash("sha256");let n=0;
  for await(const chunk of res.body) {
    n+=chunk.length;
    if(n>expected.size)throw Error("DELIVERY_PROBE_LENGTH_MISMATCH");
    digest.update(chunk);
  }
  must(n===expected.size && digest.digest("hex")===expected.sha256,"DELIVERY_PROBE_DIGEST_MISMATCH");
  if(expected.meta?.ContentType)must(res.headers.get("content-type")?.split(";")[0]===expected.meta.ContentType.split(";")[0],"DELIVERY_PROBE_MIME_MISMATCH");
}
export async function verifyDeliveryProbes(plan,config,entries,local=false) {
  const origin=validateProbeOrigin(plan.origin,config,local);
  must(Array.isArray(plan.probes) && plan.probes.length>0 && plan.probes.length<=100,"DELIVERY_PROBES_REQUIRED");
  const byKey=new Map(entries.map(e=>[e.scope+"\0"+e.key,e]));
  const covered=new Set(),privateScopes=new Set();
  for(const p of plan.probes) {
    const k=p.scope+"\0"+p.key,entry=byKey.get(k);
    must(entry && !covered.has(k) && ["private","public"].includes(p.visibility),"DELIVERY_PROBE_NOT_IN_ARCHIVE");
    const signed=urlFor(p.url,origin);
    // CDN path must actually address the restored object key. No unrelated
    // file with equal bytes, no user-provided redirects.
    must(decodeURIComponent(signed.pathname).endsWith("/"+entry.key),"DELIVERY_PROBE_KEY_MISMATCH");
    if(p.visibility==="private")must(signed.search.length>1,"DELIVERY_PROBE_PRIVATE_SIGNATURE_REQUIRED");
    await assertBytes(await response(signed),entry);
    if(p.visibility==="private") {
      const unsigned=new URL(signed);unsigned.search="";
      // Test after the authenticated read to catch a cache-key/auth regression.
      const unauth=await response(unsigned);
      await unauth.body?.cancel();
      must([401,403,404].includes(unauth.status),"DELIVERY_PROBE_PRIVATE_CACHE_LEAK");
      privateScopes.add(p.scope);
    }
    covered.add(k);
  }
  return {status:"ISOLATED_CDN_SAMPLES_VERIFIED",verifiedObjects:covered.size,privateScopes:[...privateScopes].sort()};
}
