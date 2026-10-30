/** G05 AG2 Web real consumer gated HTTP tests.
 *
 * NEVER runs real POST with generic "test" env, AG3 Mobile grant or port-only
 * accessibility. Requires AND: exclusive AG4 Web grant, AG3 DONE, AG1 READY,
 * active exact Web lease and current source SHAs plus synthetic JWT fixtures.
 * Running ordinary vitest leaves this suite SKIPPED; no fetch will occur.
 */
import {describe,it,expect} from "vitest";
import {readG05WebGate} from "../../../scripts/g05-web-gate.mjs";
import {G05WebRealConsumerAdapter,type G05WireRequest}
  from "./g05WebRealConsumerAdapter";
import type {PetCreateBody,PetReply} from "./petCreateS1";
import type {PetCreateBindingS1} from "./petCreateIntentS1";

const environment=(globalThis as typeof globalThis &
  {process?:{env:Record<string,string|undefined>}}).process?.env??{};
const admitted=environment.G05_AG2_WEB_RUN==="1" &&
  typeof environment.G05_AG2_WEB_GRANT_RELATIVE==="string";
const grantPath=environment.G05_AG2_WEB_GRANT_RELATIVE??"";
const gate=admitted ? readG05WebGate(grantPath) : null;
const body:PetCreateBody={
  name:"Барсик",type:"CAT",breed:"Метис",birthDate:"2020-02-29",
  heightCm:24,notes:"G05 AG2 isolated synthetic Web consumer",
};
type Actor="A"|"B";
type Ack={success?:boolean;data?:{id?:string;ownerId?:string;
  name?:string;type?:string};error?:string};
const context=():NonNullable<typeof gate>=>{
  if(!gate)throw Error("G05_WEB_GATE_DENIED");
  // Revalidate the actual grant and current lease BEFORE EACH actual POST.
  const fresh=readG05WebGate(grantPath);
  if(fresh.grantId!==gate.grantId||fresh.leaseId!==gate.leaseId)
    throw Error("G05_WEB_LEASE_CHANGED");
  return fresh;
};
const actorBinding=(actor:Actor):PetCreateBindingS1=>{
  const user=context().actors[actor];
  return {ownerId:user.ownerId,authEpoch:user.authEpoch,
    sessionScope:user.sessionScope};
};
const safePet=(reply:PetReply)=>{
  if(reply.status!==201||!reply.body||typeof reply.body!=="object")
    throw Error("G05_NOT_201");
  const data=(reply.body as Ack).data;
  if(!data||typeof data.id!=="string"||typeof data.ownerId!=="string")
    throw Error("G05_UNVERIFIED_SERVER_ACK");
  return {id:data.id,ownerId:data.ownerId};
};
async function post(actor:Actor,json:string,options?:{
  invalidBearer?:boolean;unsupportedHeader?:boolean;
}):Promise<PetReply>{
  const fresh=context();
  const user=fresh.actors[actor];
  const authorization=options?.invalidBearer?
    "Bearer invalid-synthetic-token":"Bearer "+user.accessToken;
  const response=await fetch(fresh.honoOrigin+"/api/v1/pets",{
    method:"POST",redirect:"manual",
    headers:{
      "content-type":"application/json",
      authorization,
      ...(options?.unsupportedHeader?{"Idempotency-Key":globalThis.crypto.randomUUID()}:{}),
    },
    body:json,
    signal:AbortSignal.timeout(8000),
  });
  const data=await response.text();
  // Never echo HTTP response body, JWT, pet notes, source JSON or UUID in logs.
  let parsed:unknown;
  try{parsed=JSON.parse(data);}catch{throw Error("G05_UNSAFE_NON_JSON_REPLY");}
  return {status:response.status,body:parsed};
}
function wireFor(actor:Actor){
  return async (request:G05WireRequest):Promise<PetReply>=>{
    if(request.binding.ownerId!==context().actors[actor].ownerId)
      throw Error("G05_WRONG_ACTOR_ADAPTER");
    return post(actor,request.jsonText);
  };
}
const json=(key:string,value:PetCreateBody=body)=>
  JSON.stringify({...value,clientRequestId:key});

(gate?describe:describe.skip)("AG2 G05 REAL Web consumer [explicit AG4 Web gate required]",()=>{
  it("G05-WEB-R01 201 new + exact replay same key/owner/Pet",async()=>{
    const owner=actorBinding("A").ownerId;
    const payload=json(globalThis.crypto.randomUUID());
    const a=await post("A",payload),b=await post("A",payload);
    expect(a.status).toBe(201);expect(b.status).toBe(201);
    expect(safePet(a).ownerId).toBe(owner);
    expect(safePet(a)).toEqual(safePet(b));
  });

  it("G05-WEB-R02 true server 201 recorded, client loses ACK, manual SAME-key replay",async()=>{
    let initialId="";
    let calls=0;
    const adapter=new G05WebRealConsumerAdapter(async req=>{
      const response=await wireFor("A")(req);
      if(++calls===1){
        initialId=safePet(response).id; // actual remote 201 observed, hidden to adapter
        throw Error("SYNTHETIC_CLIENT_LOST_ACK_AFTER_REAL_HTTP_201");
      }
      return response;
    });
    const binding=actorBinding("A");adapter.setSession(binding);
    expect(adapter.begin(body)).toBe(true);
    expect((await adapter.first()).kind).toBe("unknown");
    expect(adapter.snapshot.attempts).toBe(1);
    const retried=await adapter.manualRetry(true);
    expect(retried.kind).toBe("confirmed");
    if(retried.kind==="confirmed"){
      expect(retried.petId).toBe(initialId);
    }
    expect(calls).toBe(2);
  });

  it("G05-WEB-R03 same key changed payload 409 conflict, original still replayable",async()=>{
    const key=globalThis.crypto.randomUUID();
    const original=json(key);
    const start=await post("A",original);
    expect(start.status).toBe(201);
    const changed=await post("A",json(key,{...body,name:"Другая"}));
    expect(changed.status).toBe(409);
    const replay=await post("A",original);
    expect(replay.status).toBe(201);
    expect(safePet(replay)).toEqual(safePet(start));
  });

  it("G05-WEB-R04 A and B same UUID create separate owned Pet; no key crossover",async()=>{
    const key=globalThis.crypto.randomUUID(),payload=json(key);
    const a=await post("A",payload),b=await post("B",payload);
    expect(a.status).toBe(201);expect(b.status).toBe(201);
    expect(safePet(a).ownerId).toBe(actorBinding("A").ownerId);
    expect(safePet(b).ownerId).toBe(actorBinding("B").ownerId);
    expect(safePet(a).id).not.toBe(safePet(b).id);
  });

  it("G05-WEB-R05 malformed UUID and unsupported header return 400",async()=>{
    const bad=await post("A",json("not-uuid"));
    expect(bad.status).toBe(400);
    const badHeader=await post("A",json(globalThis.crypto.randomUUID()),{unsupportedHeader:true});
    expect(badHeader.status).toBe(400);
  });

  it("G05-WEB-R06 invalid synthetic Bearer token returns 401",async()=>{
    const bad=await post("A",json(globalThis.crypto.randomUUID()),{invalidBearer:true});
    expect(bad.status).toBe(401);
  });
});
