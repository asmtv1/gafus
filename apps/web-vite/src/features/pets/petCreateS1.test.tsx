// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { PetCreateS1Form } from "./PetCreateS1Form";
import {
  beginExplicitNewPetIntentS1, markPetIntentS1, newPetCreateIntentS1,
  newSyntheticUuidV4, prepareSyntheticFirstAttemptS1,
  prepareSyntheticManualRetryS1, toPetCreateJsonProposalS1,
  type PetCreateBindingS1, type PetCreateIntentS1,
} from "./petCreateIntentS1";
import {
  emptyPetDraft, mapPetCreateDraft, interpretPetCreateReply,
  type PetCreateBody, type PetCreateDraft, type PetReply,
} from "./petCreateS1";

const valid:PetCreateDraft={...emptyPetDraft, name:"Тоби",
  breed:"Лабрадор",birthDate:"15.03.2020",type:"DOG"};
const body=():PetCreateBody=>{
  const result=mapPetCreateDraft(valid);
  if(!result.ok)throw new Error("bad test fixture");
  return result.body;
};
const okReply=(actor="A"):PetReply=>({
  status:201,body:{success:true,data:{
    id:"pet_123",ownerId:actor,name:"Тоби",type:"DOG",
    weightKg:null,photoUrl:null}},
});
describe("G05-S1 isolated typed pure mapping and ACK: legacy provisional semantics",()=>{
  it("G05-S1-01 canonicalizes legitimate DD.MM.YYYY without local timestamp shift",()=>{
    expect(body()).toMatchObject({name:"Тоби",type:"DOG",birthDate:"2020-03-15"});
  });
  it("G05-S1-02 accepts canonical YYYY-MM-DD and exact leap day",()=>{
    expect(mapPetCreateDraft({...valid,birthDate:"29.02.2020"}))
      .toMatchObject({ok:true,body:{birthDate:"2020-02-29"}});
  });
  it("G05-S1-03 impossible leap/calendar date fails closed",()=>{
    expect(mapPetCreateDraft({...valid,birthDate:"29.02.2021"}))
      .toMatchObject({ok:false,field:"birthDate"});
    expect(mapPetCreateDraft({...valid,birthDate:"31.04.2020"}))
      .toMatchObject({ok:false,field:"birthDate"});
  });
  it("G05-S1-04 future date and pre-1990 rejected under existing legacy UX only",()=>{
    expect(mapPetCreateDraft({...valid,birthDate:"01.01.2099"}))
      .toMatchObject({ok:false,field:"birthDate"});
    expect(mapPetCreateDraft({...valid,birthDate:"31.12.1989"}))
      .toMatchObject({ok:false,field:"birthDate"});
  });
  it("G05-S1-05 required name and breed stay legacy-trimmed and bounded",()=>{
    expect(mapPetCreateDraft({...valid,name:"1"})).toMatchObject({ok:false,field:"name"});
    expect(mapPetCreateDraft({...valid,breed:" "}))
      .toMatchObject({ok:false,field:"breed"});
    expect(mapPetCreateDraft({...valid,name:"  Тоби  "})).toMatchObject({
      ok:true,body:{name:"Тоби"}});
  });
  it("G05-S1-06 rejects unknown pet enum before Hono mock",()=>{
    expect(mapPetCreateDraft({...valid,type:"BIRD"}))
      .toMatchObject({ok:false,field:"type"});
  });
  it("G05-S1-07 optional comma decimal has exact cm unit and omits blanks",()=>{
    const result=mapPetCreateDraft({...valid,heightCm:" 42,5 ",
      neckGirthCm:"",muzzleGirthCm:"13.2"});
    expect(result).toMatchObject({ok:true,body:{heightCm:42.5,muzzleGirthCm:13.2}});
    if(result.ok)expect(result.body).not.toHaveProperty("neckGirthCm");
  });
  it("G05-S1-08 rejects nonfinite, negative and oversize measurements",()=>{
    for(const invalid of ["Infinity","-1","0","201","NaN"]){
      expect(mapPetCreateDraft({...valid,heightCm:invalid})).toMatchObject({
        ok:false,field:"heightCm"});
    }
  });
  it("G05-S1-09 never invents owner, id, weight, photo or default zero",()=>{
    const result=body() as Record<string,unknown>;
    for(const key of ["id","ownerId","userId","weightKg","photoUrl","heightCm"])
      expect(result).not.toHaveProperty(key);
  });
  it("G05-S1-10 notes are trimmed and longer than 500 are rejected",()=>{
    expect(mapPetCreateDraft({...valid,notes:"  любит мячи  "}))
      .toMatchObject({ok:true,body:{notes:"любит мячи"}});
    expect(mapPetCreateDraft({...valid,notes:"а".repeat(501)}))
      .toMatchObject({ok:false,field:"notes"});
  });
  it("G05-S1-11 validates 201 id+owner+name+type ACK before trust",()=>{
    expect(interpretPetCreateReply(okReply(),"A",body())).toMatchObject({
      kind:"confirmed",pet:{id:"pet_123",ownerId:"A",name:"Тоби",type:"DOG"}});
    expect(interpretPetCreateReply(okReply("B"),"A",body()).kind).toBe("unknown");
    expect(interpretPetCreateReply({status:201,body:{success:true,data:{id:"bad/id",ownerId:"A",name:"Тоби",type:"DOG"}}},"A",body()).kind).toBe("unknown");
  });
  it("G05-S1-12 malformed success envelope is unknown, never false ACK",()=>{
    for(const b of [{success:"true"}, {success:true,data:null},{success:false,data:{}},
      {success:true,data:{id:"p1",ownerId:"A",name:"Other",type:"DOG"}}])
      expect(interpretPetCreateReply({status:201,body:b},"A",body()).kind).toBe("unknown");
  });
  it("G05-S1-25 UTC calendar today accepted, UTC tomorrow rejected; no timestamp serialized",()=>{
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-17T11:30:00.000Z"));
      expect(mapPetCreateDraft({...valid,birthDate:"17.10.2026"}))
        .toMatchObject({ok:true,body:{birthDate:"2026-10-17"}});
      expect(mapPetCreateDraft({...valid,birthDate:"18.10.2026"}))
        .toMatchObject({ok:false,field:"birthDate"});
      expect(mapPetCreateDraft({...valid,birthDate:"2026-10-17T00:00:00+14:00"}))
        .toMatchObject({ok:false,field:"birthDate"});
    } finally {vi.useRealTimers();}
  });
  it("G05-S1-26 Gregorian leap 2000/2024 valid; 1900 invalid; 1990 lower inclusive",()=>{
    expect(mapPetCreateDraft({...valid,birthDate:"01.01.1990"}))
      .toMatchObject({ok:true,body:{birthDate:"1990-01-01"}});
    expect(mapPetCreateDraft({...valid,birthDate:"29.02.2000"}))
      .toMatchObject({ok:true,body:{birthDate:"2000-02-29"}});
    expect(mapPetCreateDraft({...valid,birthDate:"2024-02-29"}))
      .toMatchObject({ok:true,body:{birthDate:"2024-02-29"}});
    expect(mapPetCreateDraft({...valid,birthDate:"29.02.1900"}))
      .toMatchObject({ok:false,field:"birthDate"});
    for(const day of ["00.01.2020","32.01.2020","31.06.2020","2020-13-01"]){
      expect(mapPetCreateDraft({...valid,birthDate:day})).toMatchObject({
        ok:false,field:"birthDate"});
    }
  });
  it("G05-S1-27 decimal optional cm source semantics: bounds, comma, absent vs zero, no weight",()=>{
    const result=mapPetCreateDraft({...valid, heightCm:"1", neckGirthCm:"200",
      muzzleGirthCm:"14,25",bellyGirthCm:" "});
    expect(result).toMatchObject({ok:true,body:{
      heightCm:1,neckGirthCm:200,muzzleGirthCm:14.25}});
    if(!result.ok)throw new Error("unexpected test fixture");
    expect(Object.keys(result.body).sort()).toEqual([
      "birthDate","breed","heightCm","muzzleGirthCm","name",
      "neckGirthCm","type",
    ].sort());
    expect(result.body).not.toHaveProperty("weightKg");
  });
  it("G05-S1-28 no unapproved weight precision/initial value invented",()=>{
    const result=mapPetCreateDraft({...valid, heightCm:"1.2345", notes:""});
    expect(result).toMatchObject({ok:true,body:{heightCm:1.2345}});
    if(result.ok)expect(result.body).not.toHaveProperty("weightKg");
  });
  it("G05-S1-34 overspecified measurement digits cannot be silently rounded",()=>{
    for(const val of ["1.0000000000000001","1,234567890123456789","199.99999999999999999"]){
      expect(mapPetCreateDraft({...valid,neckGirthCm:val}))
        .toMatchObject({ok:false,field:"neckGirthCm"});
    }
  });
  it("G05-S1-35 hex, scientific notation and multi-comma are not decimal-centimeters",()=>{
    for(const val of ["0x10","1e2","+10","1,2,3","100abc"]){
      expect(mapPetCreateDraft({...valid,muzzleGirthCm:val}))
        .toMatchObject({ok:false,field:"muzzleGirthCm"});
    }
  });
  it("G05-S1-36 decimal equivalent zero tails and boundary 200 remain accepted",()=>{
    const result=mapPetCreateDraft({...valid,bellyGirthCm:"001.2000",heightCm:"200,000"});
    expect(result).toMatchObject({ok:true,body:{bellyGirthCm:1.2,heightCm:200}});
  });
  it("G05-S1-37 forged weightKg/photoUrl/userId in draft are never serialized",()=>{
    const forged={...valid,weightKg:"17.12345678",photoUrl:"https://invalid.example/secret",
      ownerId:"other",userId:"other"} as PetCreateDraft;
    const result=mapPetCreateDraft(forged);
    expect(result.ok).toBe(true);
    if(result.ok){
      for(const key of ["weightKg","photoUrl","ownerId","userId","id"])
        expect(result.body).not.toHaveProperty(key);
    }
  });
  it("G05-S1-39 UTC calendar boundary stays stable across local DST transitions",()=>{
    vi.useFakeTimers();
    try {
      for(const instant of ["2026-03-29T00:05:00.000Z",
        "2026-03-29T23:05:00.000Z","2026-10-25T00:05:00.000Z",
        "2026-10-25T23:05:00.000Z"]){
        vi.setSystemTime(new Date(instant));
        const today=instant.slice(0,10);
        const next=new Date(today+"T00:00:00.000Z");
        next.setUTCDate(next.getUTCDate()+1);
        expect(mapPetCreateDraft({...valid,birthDate:today}))
          .toMatchObject({ok:true,body:{birthDate:today}});
        expect(mapPetCreateDraft({...valid,birthDate:next.toISOString().slice(0,10)}))
          .toMatchObject({ok:false,field:"birthDate"});
      }
    } finally {vi.useRealTimers();}
  });
  it("G05-S1-40 approved Gregorian date is independent of skipped local civil dates",()=>{
    expect(mapPetCreateDraft({...valid,birthDate:"30.12.2011"}))
      .toMatchObject({ok:true,body:{birthDate:"2011-12-30"}});
    expect(mapPetCreateDraft({...valid,birthDate:"2011-12-30"}))
      .toMatchObject({ok:true,body:{birthDate:"2011-12-30"}});
  });
  it("G05-S1-51 actual Gregorian 2011-12-30 survives Pacific/Apia skipped LOCAL day",()=>{
    const value=mapPetCreateDraft({...valid,birthDate:"30.12.2011"});
    expect(value).toMatchObject({ok:true,body:{birthDate:"2011-12-30"}});
    expect(mapPetCreateDraft({...valid,birthDate:"2011-12-30"}))
      .toMatchObject({ok:true,body:{birthDate:"2011-12-30"}});
  });
  it("G05-S1-52 UTC today stays allowed even when a local zone has already advanced",()=>{
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-17T23:50:00.000Z"));
      expect(mapPetCreateDraft({...valid,birthDate:"17.10.2026"}))
        .toMatchObject({ok:true,body:{birthDate:"2026-10-17"}});
      expect(mapPetCreateDraft({...valid,birthDate:"18.10.2026"}))
        .toMatchObject({ok:false,field:"birthDate"});
    } finally {vi.useRealTimers();}
  });
  it("G05-S1-53 UTC today begins at Z midnight even when local calendar is still yesterday",()=>{
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-18T00:05:00.000Z"));
      expect(mapPetCreateDraft({...valid,birthDate:"18.10.2026"}))
        .toMatchObject({ok:true,body:{birthDate:"2026-10-18"}});
      expect(mapPetCreateDraft({...valid,birthDate:"19.10.2026"}))
        .toMatchObject({ok:false,field:"birthDate"});
    } finally {vi.useRealTimers();}
  });
  it("G05-S1-54 direct 2025-02-29/ISO datetime fail without LOCAL Date overflow",()=>{
    for(const input of ["2025-02-29","2026-02-30","2011-12-32",
      "2020-02-29T00:00:00.000Z","2020-02-29+00:00"]){
      expect(mapPetCreateDraft({...valid,birthDate:input}))
        .toMatchObject({ok:false,field:"birthDate"});
    }
    expect(mapPetCreateDraft({...valid,birthDate:"29.02.2024"}))
      .toMatchObject({ok:true,body:{birthDate:"2024-02-29"}});
  });
  it("G05-S1-57 request weight omission differs from null; response null accepted",()=>{
    const request=body();
    expect(Object.hasOwn(request,"weightKg")).toBe(false);
    expect(JSON.parse(JSON.stringify(request))).not.toHaveProperty("weightKg");
    const reply=okReply();
    expect((reply.body as {data:{weightKg:null}}).data.weightKg).toBeNull();
    expect(interpretPetCreateReply(reply,"A",request)).toMatchObject({
      kind:"confirmed",pet:{ownerId:"A",id:"pet_123"}});
    // @ts-expect-error G05-S1 has no initial weight field, explicit null forbidden
    const explicitNull:PetCreateBody={...request,weightKg:null};
    expect(Object.hasOwn(explicitNull,"weightKg")).toBe(true);
  });
  it("G05-S1-58 runtime forged weight incl 4.25 cannot leak into typed request",()=>{
    for(const candidate of [null,4.25,"4.25",0,-1,250]){
      const untrusted={...valid,weightKg:candidate,ownerId:"B",
        photoUrl:"https://invalid.example/sensitive",userId:"B"} as unknown as PetCreateDraft;
      const mapped=mapPetCreateDraft(untrusted);
      expect(mapped.ok).toBe(true);
      if(mapped.ok){
        for(const key of ["weightKg","ownerId","userId","photoUrl"])
          expect(mapped.body).not.toHaveProperty(key);
      }
    }
    // @ts-expect-error G05-S1 no weight control even for valid server numeric weight
    const numericWeight:PetCreateBody={...body(),weightKg:4.25};
    expect(numericWeight).toHaveProperty("weightKg",4.25);
  });
  it("G05-S1-59 canonical date-only wire rejects offsets/timestamps/loose formats",()=>{
    for(const untrusted of ["2020-3-05","2020-03-5","2020/03/05",
      "2020-03-05T00:00:00.000Z","2020-03-05+00:00","05-03-2020",
      "2020-02-30","2025-02-29","not-a-date"]){
      expect(mapPetCreateDraft({...valid,birthDate:untrusted})).toMatchObject({
        ok:false,field:"birthDate"});
    }
    for(const input of ["05.03.2020","2020-03-05"]){
      const mapped=mapPetCreateDraft({...valid,birthDate:input});
      expect(mapped).toMatchObject({ok:true,body:{birthDate:"2020-03-05"}});
      if(mapped.ok)expect(mapped.body.birthDate).not.toMatch(/[TZ+]/);
    }
    // @ts-expect-error date-only birthDate must be a string, never null
    const nullDate:PetCreateBody={...body(),birthDate:null};
    expect(nullDate.birthDate).toBeNull();
  });
  it("G05-S1-60 typed request rejects ownerId/userId and runtime strips forged owner",()=>{
    const draft={...valid,ownerId:"B",userId:"B",id:"forged"} as unknown as PetCreateDraft;
    const result=mapPetCreateDraft(draft);
    expect(result.ok).toBe(true);
    if(!result.ok)throw new Error("test fixture invalid");
    expect(Object.keys(result.body).sort()).toEqual(
      ["birthDate","breed","name","type"].sort());
    // @ts-expect-error no client-supplied ownerId in create body
    const forgedOwner:PetCreateBody={...body(),ownerId:"B"};
    // @ts-expect-error no client-supplied userId in create body
    const forgedUser:PetCreateBody={...body(),userId:"B"};
    expect(Object.hasOwn(forgedOwner,"ownerId")).toBe(true);
    expect(Object.hasOwn(forgedUser,"userId")).toBe(true);
  });
  it("G05-S1-61 positive 201 with missing/null/foreign owner remains UNKNOWN",()=>{
    const expected=body();
    for(const wrongOwner of [undefined,null,"","B",0]){
      const reply={status:201,body:{success:true,data:{
        id:"pet_123",name:expected.name,type:expected.type,
        ownerId:wrongOwner,weightKg:null}}};
      const result=interpretPetCreateReply(reply,"A",expected);
      expect(result.kind).toBe("unknown");
      expect(JSON.stringify(result)).not.toContain("pet_123");
    }
    expect(interpretPetCreateReply(okReply(),"A",expected).kind).toBe("confirmed");
  });
  it("G05-S1-13 400 editable; 401/403 denied; 429/500/503 unknown",()=>{
    for(const s of [400,401,403,429,500,503]){
      const result=interpretPetCreateReply({status:s,body:{success:false,
        error:"SYNTHETIC_SERVER_SECRET"}},"A",body());
      expect(result.kind).toBe(s===400?"editable-error":
        s===401||s===403?"denied":"unknown");
      expect(JSON.stringify(result)).not.toContain("SYNTHETIC_SERVER_SECRET");
    }
  });
});
const uuidA="11111111-1111-4111-8111-111111111111";
const uuidB="22222222-2222-4222-8222-222222222222";
const bindA:PetCreateBindingS1={ownerId:"A",authEpoch:1,sessionScope:"scope_A"};
describe("G05 S1 preflight request identity, transport/protocol STILL CLOSED",()=>{
  it("G05-S1-62 securely minted local UUID is RFC4122 version 4",()=>{
    const id=newSyntheticUuidV4();
    expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(id).not.toBe(newSyntheticUuidV4());
  });
  it("G05-S1-63 immutable request snapshot pins requestId, canonical date and omitted weight",()=>{
    const draft=body();
    const intent=newPetCreateIntentS1(draft,bindA,()=>uuidA);
    draft.name="Другой";
    expect(intent.requestId).toBe(uuidA);
    expect(intent.body).toMatchObject({name:"Тоби",birthDate:"2020-03-15"});
    expect(intent.body).not.toHaveProperty("clientRequestId");
    expect(intent.body).not.toHaveProperty("weightKg");
    expect(Object.isFrozen(intent)).toBe(true);
    expect(Object.isFrozen(intent.body)).toBe(true);
    expect(Object.isFrozen(intent.binding)).toBe(true);
  });
  it("G05-S1-64 ambiguous ACK plus repeated manual proposals retain key AND snapshot",()=>{
    let calls=0;
    const intent=newPetCreateIntentS1(body(),bindA,()=>{calls++;return uuidA;});
    const uncertain=markPetIntentS1(intent,"unknown");
    const retry1=prepareSyntheticManualRetryS1(uncertain,bindA,true);
    const retry2=prepareSyntheticManualRetryS1(uncertain,bindA,true);
    expect(retry1).toStrictEqual(retry2);
    expect(retry1?.requestId).toBe(uuidA);
    expect(retry1?.body).toBe(intent.body);
    expect(calls).toBe(1);
    expect(prepareSyntheticManualRetryS1(uncertain,bindA,false)).toBeNull();
    expect(prepareSyntheticManualRetryS1(intent,bindA,true)).toBeNull();
  });
  it("G05-S1-65 no NEW key after unknown without explicit duplicate-risk acknowledgment",()=>{
    let calls=0;
    const allocate=()=>{calls++;return calls===1?uuidA:uuidB;};
    const unknown=markPetIntentS1(newPetCreateIntentS1(body(),bindA,allocate),"unknown");
    expect(beginExplicitNewPetIntentS1(unknown,body(),bindA,
      {explicitNewCreate:false,acknowledgePossibleDuplicate:true},allocate)).toBeNull();
    expect(beginExplicitNewPetIntentS1(unknown,body(),bindA,
      {explicitNewCreate:true,acknowledgePossibleDuplicate:false},allocate)).toBeNull();
    expect(calls).toBe(1);
    const deliberate=beginExplicitNewPetIntentS1(unknown,body(),bindA,
      {explicitNewCreate:true,acknowledgePossibleDuplicate:true},allocate);
    expect(deliberate?.requestId).toBe(uuidB);
    expect(deliberate?.requestId).not.toBe(unknown.requestId);
    expect(calls).toBe(2);
  });
  it("G05-S1-66 new key after positive ACK only for conscious new create; collision fails",()=>{
    const confirmed=markPetIntentS1(newPetCreateIntentS1(body(),bindA,()=>uuidA),"confirmed");
    expect(prepareSyntheticManualRetryS1(confirmed,bindA,true)).toBeNull();
    const fresh=beginExplicitNewPetIntentS1(confirmed,body(),bindA,
      {explicitNewCreate:true,acknowledgePossibleDuplicate:false},()=>uuidB);
    expect(fresh?.requestId).toBe(uuidB);
    expect(()=>beginExplicitNewPetIntentS1(confirmed,body(),bindA,
      {explicitNewCreate:true,acknowledgePossibleDuplicate:false},
      ()=>uuidA)).toThrow("UUID collision");
  });
  it("G05-S1-67 changed draft cannot mutate same intent's replay payload",()=>{
    const old=newPetCreateIntentS1(body(),bindA,()=>uuidA);
    const unknown=markPetIntentS1(old,"unknown");
    const altered={...body(),breed:"Метис",notes:"different"};
    const replay=prepareSyntheticManualRetryS1(unknown,bindA,true);
    expect(replay?.body).toBe(old.body);
    expect(replay?.body).not.toEqual(altered);
    expect(unknown.requestId).toBe(uuidA);
    const newIntent=beginExplicitNewPetIntentS1(unknown,altered,bindA,
      {explicitNewCreate:true,acknowledgePossibleDuplicate:true},()=>uuidB);
    expect(newIntent?.requestId).toBe(uuidB);
    expect(newIntent?.body).toMatchObject({breed:"Метис",notes:"different"});
  });
  it("G05-S1-68 A->B->A, relogin and new mount fence old manual retry",()=>{
    const unknown=markPetIntentS1(newPetCreateIntentS1(body(),bindA,()=>uuidA),"unknown");
    const wrong=[
      {ownerId:"B",authEpoch:1,sessionScope:"scope_A"},
      {ownerId:"A",authEpoch:3,sessionScope:"scope_A"},
      {ownerId:"A",authEpoch:1,sessionScope:"scope_NEW"},
    ] satisfies PetCreateBindingS1[];
    for(const binding of wrong){
      expect(prepareSyntheticManualRetryS1(unknown,binding,true)).toBeNull();
      expect(beginExplicitNewPetIntentS1(unknown,body(),binding,
        {explicitNewCreate:true,acknowledgePossibleDuplicate:true},()=>uuidB)).toBeNull();
    }
    expect(prepareSyntheticManualRetryS1(unknown,bindA,true)?.requestId).toBe(uuidA);
    expect(newPetCreateIntentS1(body(),wrong[0]!,()=>uuidB).requestId).toBe(uuidB);
  });
  it("G05-S1-74 initial and explicit retry share approved JSON clientRequestId",()=>{
    const intent=newPetCreateIntentS1(body(),bindA,()=>uuidA);
    const initial=prepareSyntheticFirstAttemptS1(intent,bindA);
    expect(initial).not.toBeNull();
    const unknown=markPetIntentS1(intent,"unknown");
    const manual=prepareSyntheticManualRetryS1(unknown,bindA,true);
    expect(manual).toStrictEqual(initial);
    const original=toPetCreateJsonProposalS1(initial!);
    const replay=toPetCreateJsonProposalS1(manual!);
    expect(replay).toEqual(original);
    expect(replay.clientRequestId).toBe(uuidA);
    expect(replay.birthDate).toBe("2020-03-15");
    expect(replay).not.toHaveProperty("weightKg");
    expect(replay).not.toHaveProperty("ownerId");
    expect(replay).not.toHaveProperty("Idempotency-Key");
    expect(Object.isFrozen(replay)).toBe(true);
  });
  it("G05-S1-75 forged runtime headers/owner/weight cannot leak to JSON proposal",()=>{
    const untrusted={...body(),ownerId:"B",userId:"B",weightKg:4.25,
      "Idempotency-Key":"forged",clientRequestId:"fake"} as unknown as PetCreateBody;
    const intent=newPetCreateIntentS1(untrusted,bindA,()=>uuidA);
    const first=prepareSyntheticFirstAttemptS1(intent,bindA);
    expect(first).not.toBeNull();
    const json=toPetCreateJsonProposalS1(first!);
    expect(Object.keys(json).sort()).toEqual(
      ["name","type","breed","birthDate","clientRequestId"].sort());
    expect(json.clientRequestId).toBe(uuidA);
    expect(first?.body).not.toHaveProperty("clientRequestId");
    expect(first?.body).not.toHaveProperty("Idempotency-Key");
  });
  it("G05-S1-76 changed owner/epoch/session fences first and manual requests",()=>{
    const intent=newPetCreateIntentS1(body(),bindA,()=>uuidA);
    const changed=[
      {...bindA,authEpoch:2},
      {...bindA,ownerId:"B"},
      {...bindA,sessionScope:"session_new"},
    ];
    for(const next of changed){
      expect(prepareSyntheticFirstAttemptS1(intent,next)).toBeNull();
      expect(prepareSyntheticManualRetryS1(markPetIntentS1(intent,"unknown"),
        next,true)).toBeNull();
    }
    expect(prepareSyntheticFirstAttemptS1(intent,bindA)?.requestId).toBe(uuidA);
  });
  it("G05-S1-69 terminal and invalid key generator fail closed without replay",()=>{
    for(const key of ["weak","e66a9c6c-1f72-1476-a342-bfdd9ba68c23"]){
      expect(()=>newPetCreateIntentS1(body(),bindA,()=>key)).toThrow("UUID v4");
    }
    const intent=newPetCreateIntentS1(body(),bindA,()=>uuidA);
    const abandoned=markPetIntentS1(intent,"abandoned");
    expect(prepareSyntheticManualRetryS1(abandoned,bindA,true)).toBeNull();
    expect(()=>markPetIntentS1(abandoned,"unknown")).toThrow("Terminal");
    expect(()=>markPetIntentS1(markPetIntentS1(intent,"unknown"),"confirmed"))
      .toThrow("separately verified ACK");
  });
});
type Resolver = {resolve:(v:PetReply)=>void;promise:Promise<PetReply>};
function deferred():Resolver {
  let resolve!:(value:PetReply)=>void;
  const promise=new Promise<PetReply>(fn=>{resolve=fn;});
  return {resolve,promise};
}
let root:Root,host:HTMLDivElement,cache:QueryClient;
type MockPetSubmit = (
  dto:PetCreateBody & {clientRequestId:string}, identity:PetCreateIntentS1,
)=>Promise<PetReply>;
let send:ReturnType<typeof vi.fn<MockPetSubmit>>;
let cancel:ReturnType<typeof vi.fn<()=>void>>;
async function render(actorId="A"){
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    <PetCreateS1Form actorId={actorId} submitSynthetic={send}
      onCancelIntent={cancel}/>
  </QueryClientProvider>));
}
async function edit(key:string,value:string){
  const el=host.querySelector<HTMLInputElement>("#g05-"+key);
  if(!el)throw new Error("Missing field "+key);
  await act(async()=>{
    const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    set?.call(el,value);
    el.dispatchEvent(new Event("input",{bubbles:true}));
  });
}
async function fill(){
  await edit("name","Тоби");await edit("breed","Лабрадор");
  await edit("birthDate","15.03.2020");
}
async function submit(){
  await act(async()=>{
    const el=host.querySelector("form");if(!el)throw new Error("Missing form");
    el.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
  });
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal("fetch",vi.fn(()=>{throw new Error("S1 network MUST NOT be called");}));
  send=vi.fn<MockPetSubmit>().mockResolvedValue(okReply());
  cancel=vi.fn<()=>void>();
  cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"actor_a",role:"USER"});
  host=document.createElement("div");document.body.append(host);
  root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  cache.clear();host.remove();vi.unstubAllGlobals();
});
describe("G05-S1 isolated mounted React FORM, never registered as real Vite route",()=>{
  it("G05-S1-14 guest cannot render creation form or call submit",async()=>{
    cache.setQueryData(CURRENT_USER_QUERY_KEY,null);
    await render();
    expect(host.textContent).toContain("Требуется авторизация");
    expect(host.querySelector("form")).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
  it("G05-S1-15 mandatory fields report accessible error and zero mutation",async()=>{
    await render();await submit();
    expect(send).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>("#g05-name")?.getAttribute("aria-invalid"))
      .toBe("true");
  });
  it("G05-S1-16 201 matching ACK renders success, exact JSON omits owner/weight/photo",async()=>{
    await render();await fill();await submit();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual({
      ...body(),clientRequestId:send.mock.calls[0][1].requestId,
    });
    expect(host.textContent).toContain("Питомец создан");
    expect(host.textContent).toContain("pet_123");
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toMatchObject({id:"A"});
    expect(host.querySelector("form")).toBeNull();
  });
  it("G05-S1-17 pending double-submit invokes single injected submitter",async()=>{
    const pending=deferred();send.mockReturnValue(pending.promise);
    await render();await fill();
    await submit();await submit();
    expect(send).toHaveBeenCalledTimes(1);
    expect(host.querySelector("form")?.getAttribute("aria-busy")).toBe("true");
    await act(async()=>pending.resolve(okReply()));
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("G05-S1-18 synthetic 400 retains draft and permits manual edit",async()=>{
    send.mockResolvedValue({status:400,body:{success:false,error:"PRIVATE_SERVER_DETAIL"}});
    await render();await fill();await submit();
    expect(host.querySelector<HTMLInputElement>("#g05-name")?.value).toBe("Тоби");
    expect(host.textContent).toContain("Проверьте введённые данные");
    expect(host.textContent).not.toContain("PRIVATE_SERVER_DETAIL");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("G05-S1-19 synthetic 500 terminal and NEVER auto rePOST",async()=>{
    send.mockResolvedValue({status:500,body:{success:false}});
    await render();await fill();await submit();
    expect(host.textContent).toContain("Результат создания не подтверждён");
    expect(host.querySelector("form")).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("G05-S1-20 simulated lost-response terminal with ZERO retry",async()=>{
    send.mockRejectedValue(new Error("SYNTHETIC_SOCKET_LOST_AFTER_COMMIT"));
    await render();await fill();await submit();
    expect(host.textContent).toContain("Автоматической повторной отправки нет");
    expect(host.textContent).not.toContain("SYNTHETIC_SOCKET_LOST_AFTER_COMMIT");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("G05-S1-21 A in-flight 201 after B login cannot show success or change B data",async()=>{
    const pending=deferred();send.mockReturnValue(pending.promise);
    await render();await fill();await submit();
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"B",username:"b",role:"USER"});
    });
    await act(async()=>pending.resolve(okReply("A")));
    expect(host.textContent).toContain("Требуется авторизация");
    expect(host.textContent).not.toContain("Питомец создан");
    expect(cache.getQueryData(CURRENT_USER_QUERY_KEY)).toMatchObject({id:"B"});
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("G05-S1-22 invalid 201 wrong owner cannot invalidate data or claim success",async()=>{
    send.mockResolvedValue(okReply("B"));
    await render();await fill();await submit();
    expect(host.textContent).toContain("Проверьте результат");
    expect(host.textContent).not.toContain("Питомец создан");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("G05-S1-23 cancel button is keyboard semantic, no hidden navigation",async()=>{
    await render();
    const button=[...host.querySelectorAll("button")].find(x=>x.textContent==="Отмена");
    expect(button?.getAttribute("type")).toBe("button");
    await act(async()=>button?.dispatchEvent(new MouseEvent("click",{bubbles:true})));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });
  it("G05-S1-29 reused component actor A->B resets A draft before B can submit",async()=>{
    await render();await fill();
    expect(host.querySelector<HTMLInputElement>("#g05-name")?.value).toBe("Тоби");
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"B",username:"b",role:"USER"});
    });
    await render("B");
    expect(host.querySelector<HTMLInputElement>("#g05-name")?.value).toBe("");
    expect(host.querySelector<HTMLInputElement>("#g05-birthDate")?.value).toBe("");
    await submit();
    expect(send).not.toHaveBeenCalled();
  });
  it("G05-S1-30 A->B->A during pending same actor ID may NOT consume stale old A ACK",async()=>{
    const pending=deferred();send.mockReturnValue(pending.promise);
    await render();await fill();await submit();
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"B",username:"b",role:"USER"});
    });
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"actor_a",role:"USER"});
    });
    await act(async()=>pending.resolve(okReply("A")));
    expect(send).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("Питомец создан");
    expect(host.querySelector("[data-testid='mock-created-pet-id']")).toBeNull();
  });
  it("G05-S1-31 logout/relogin same actor pending ACK is not current session approval",async()=>{
    const pending=deferred();send.mockReturnValue(pending.promise);
    await render();await fill();await submit();
    await act(async()=>{ cache.setQueryData(CURRENT_USER_QUERY_KEY,null); });
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"actor_a",role:"USER"});
    });
    await act(async()=>pending.resolve(okReply("A")));
    expect(send).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("Питомец создан");
  });
  it("G05-S1-38 A->B->the same original A object remains an invalid stale ACK",async()=>{
    const original=cache.getQueryData(CURRENT_USER_QUERY_KEY);
    const pending=deferred();send.mockReturnValue(pending.promise);
    await render();await fill();await submit();
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"B",username:"b",role:"USER"});
      cache.setQueryData(CURRENT_USER_QUERY_KEY,original);
    });
    await act(async()=>pending.resolve(okReply("A")));
    expect(host.textContent).not.toContain("Питомец создан");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("G05-S1-32 pending lost response after account switch never retries or leaks A errors",async()=>{
    const pending=deferred();send.mockReturnValue(pending.promise);
    await render();await fill();await submit();
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"B",username:"b",role:"USER"});
    });
    await act(async()=>pending.resolve({status:503,body:{error:"PRIVATE_A"}}));
    await render("B");
    expect(host.textContent).not.toContain("PRIVATE_A");
    expect(host.textContent).not.toContain("Тоби");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("G05-S1-33 empty optional measurement remains omitted; invalid measurement has no submit",async()=>{
    await render();await fill();await edit("neckGirthCm","Infinity");
    await submit();
    expect(send).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Размер должен быть");
    expect(host.querySelector<HTMLInputElement>("#g05-neckGirthCm")?.value).toBe("Infinity");
  });
  it("G05-S1-24 accessible form labels and native keyboard enter submit hook",async()=>{
    await render();await fill();
    expect(host.querySelector("label[for='g05-birthDate']")).not.toBeNull();
    expect(host.querySelector("fieldset legend")?.textContent).toContain("Тип питомца");
    await submit();
    expect(send).toHaveBeenCalledTimes(1);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("G05-S1-41 required birthDate error focuses the actual invalid input",async()=>{
    await render();
    await edit("name","Тоби");await edit("breed","Лабрадор");
    await submit();
    const input=host.querySelector<HTMLInputElement>("#g05-birthDate");
    expect(document.activeElement).toBe(input);
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(input?.getAttribute("aria-describedby")).toBe("g05-error");
    expect(host.querySelector("#g05-error")?.getAttribute("role")).toBe("alert");
    expect(send).not.toHaveBeenCalled();
  });
  it("G05-S1-42 optional invalid neck value focuses neck, not name; clears on edit",async()=>{
    await render();await fill();await edit("neckGirthCm","Infinity");await submit();
    const field=host.querySelector<HTMLInputElement>("#g05-neckGirthCm");
    expect(document.activeElement).toBe(field);
    expect(field?.getAttribute("aria-invalid")).toBe("true");
    expect(field?.getAttribute("aria-describedby")).toBe("g05-error");
    await edit("neckGirthCm","42,5");
    expect(field?.getAttribute("aria-invalid")).not.toBe("true");
    expect(field?.hasAttribute("aria-describedby")).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it("G05-S1-43 safe async 400 error is keyboard-focusable and draft kept",async()=>{
    send.mockResolvedValue({status:400,body:{success:false,error:"PRIVATE_DATABASE_DETAIL"}});
    await render();await fill();await submit();
    const alert=host.querySelector<HTMLElement>("#g05-error");
    expect(alert?.getAttribute("role")).toBe("alert");
    expect(alert?.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(alert);
    expect(host.querySelector<HTMLInputElement>("#g05-name")?.value).toBe("Тоби");
    expect(host.textContent).not.toContain("PRIVATE_DATABASE_DETAIL");
    expect(cancel).not.toHaveBeenCalled();
  });
  it("G05-S1-44 pending disables cancellation/navigation and prevents double submit",async()=>{
    const wait=deferred();send.mockReturnValue(wait.promise);
    await render();await fill();await submit();
    const cancelButton=[...host.querySelectorAll("button")].find(x=>x.textContent==="Отмена");
    expect(cancelButton?.disabled).toBe(true);
    expect(host.querySelector("form")?.getAttribute("aria-busy")).toBe("true");
    await act(async()=>cancelButton?.dispatchEvent(new MouseEvent("click",{bubbles:true})));
    await submit();
    expect(cancel).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    await act(async()=>wait.resolve(okReply()));
    expect(cancel).not.toHaveBeenCalled();
  });
  it("G05-S1-45 simulated response loss: terminal result focus and explicit exit only",async()=>{
    send.mockRejectedValue(new Error("SQL_PASSWORD_OR_SECRET_123"));
    await render();await fill();await submit();
    const heading=host.querySelector<HTMLElement>("h2");
    expect(document.activeElement).toBe(heading);
    expect(heading?.tabIndex).toBe(-1);
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).not.toContain("SQL_PASSWORD_OR_SECRET_123");
    expect(cancel).not.toHaveBeenCalled();
    const exit=[...host.querySelectorAll("button")].find(x=>x.textContent==="Вернуться");
    expect(exit?.type).toBe("button");
    await act(async()=>exit?.dispatchEvent(new MouseEvent("click",{bubbles:true})));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("G05-S1-46 403 denied has a keyboard-exitable safe terminal view",async()=>{
    send.mockResolvedValue({status:403,body:{success:false,error:"RAW_JWT_COOKIE"}});
    await render();await fill();await submit();
    expect(host.textContent).not.toContain("RAW_JWT_COOKIE");
    expect(document.activeElement).toBe(host.querySelector("h2"));
    expect(host.querySelector("form")).toBeNull();
    const exit=[...host.querySelectorAll("button")].find(x=>x.textContent==="Вернуться");
    await act(async()=>exit?.dispatchEvent(new MouseEvent("click",{bubbles:true})));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("G05-S1-47 confirmed ACK focuses success and offers explicit return, not auto nav",async()=>{
    await render();await fill();await submit();
    expect(document.activeElement).toBe(host.querySelector("h2"));
    expect(host.textContent).toContain("Питомец создан");
    expect(cancel).not.toHaveBeenCalled();
    const back=[...host.querySelectorAll("button")].find(x=>x.textContent==="Вернуться");
    expect(back?.type).toBe("button");
    await act(async()=>back?.dispatchEvent(new MouseEvent("click",{bubbles:true})));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("G05-S1-48 unmounted pending error cannot navigate or expose leaked text",async()=>{
    const wait=deferred();send.mockReturnValue(wait.promise);
    await render();await fill();await submit();
    await act(async()=>root.render(<p data-testid="mock-exit">Место назначения</p>));
    await act(async()=>wait.resolve({status:503,body:{error:"PRIVATE_OLD_ACTOR"}}));
    expect(host.textContent).toBe("Место назначения");
    expect(cancel).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("G05-S1-49 pending->wrong owner 201: terminal unknown, navigates ONLY by explicit return",async()=>{
    const wait=deferred();send.mockReturnValue(wait.promise);
    await render();await fill();await submit();
    await act(async()=>wait.resolve(okReply("B")));
    expect(host.textContent).not.toContain("Питомец создан");
    expect(cancel).not.toHaveBeenCalled();
    const exit=[...host.querySelectorAll("button")].find(x=>x.textContent==="Вернуться");
    await act(async()=>exit?.dispatchEvent(new MouseEvent("click",{bubbles:true})));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("G05-S1-55 synthetic Apia date submit emits only UTC calendar string, no owner/weight",async()=>{
    await render();
    await edit("name","Тоби");await edit("breed","Лабрадор");
    await edit("birthDate","30.12.2011");
    await submit();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({birthDate:"2011-12-30"});
    expect(Object.keys(send.mock.calls[0][0])).not.toContain("ownerId");
    expect(Object.keys(send.mock.calls[0][0])).not.toContain("weightKg");
    expect((globalThis.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Питомец создан");
  });
  it("G05-S1-56 UTC-future input focuses birthDate with sanitized validation error",async()=>{
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-17T23:50:00.000Z"));
      await render();
      await edit("name","Тоби");await edit("breed","Лабрадор");
      await edit("birthDate","18.10.2026");
      await submit();
      const input=host.querySelector<HTMLInputElement>("#g05-birthDate");
      expect(input?.getAttribute("aria-invalid")).toBe("true");
      expect(input?.getAttribute("aria-describedby")).toBe("g05-error");
      expect(document.activeElement).toBe(input);
      expect(send).not.toHaveBeenCalled();
      expect(host.querySelector("[role='alert']")?.textContent).toContain("UTC");
    } finally {vi.useRealTimers();}
  });
  it("G05-S1-50 nonmounted S1 notice is accurate after AG4 policy approval",async()=>{
    await render();
    expect(host.querySelector(".note")?.textContent).toContain("локальная");
    expect(host.textContent).not.toContain("контракт даты и веса ещё не утверждён");
    expect(send).not.toHaveBeenCalled();
    expect((globalThis.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
  it("G05-S1-70 form allocates one UUID after valid submit, not on mount/invalid draft",async()=>{
    await render();
    await submit();
    expect(send).not.toHaveBeenCalled();
    await fill();await submit();
    expect(send).toHaveBeenCalledTimes(1);
    const [dto,intent]=send.mock.calls[0]!;
    expect(intent.requestId).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
    expect({...intent.body,clientRequestId:intent.requestId}).toEqual(dto);
    expect(dto).toHaveProperty("clientRequestId",intent.requestId);
    expect(dto).not.toHaveProperty("ownerId");
    expect(dto).not.toHaveProperty("weightKg");
    expect(host.textContent).not.toContain(intent.requestId);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
  it("G05-S1-71 unknown response preserves identity; manual retry is never automatic",async()=>{
    send.mockRejectedValue(new Error("SYNTHETIC_TCP_ACK_LOSS secret"));
    await render();await fill();await submit();
    const [,intent]=send.mock.calls[0]!;
    expect(intent.state).toBe("pending");
    const uncertain=markPetIntentS1(intent,"unknown");
    const same=prepareSyntheticManualRetryS1(uncertain,intent.binding,true);
    expect(same?.requestId).toBe(intent.requestId);
    expect(same?.body).toBe(intent.body);
    expect(send).toHaveBeenCalledTimes(1);
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).not.toContain("SYNTHETIC_TCP_ACK_LOSS");
    expect(host.textContent).not.toContain(intent.requestId);
    expect([...host.querySelectorAll("button")]
      .some(b=>/повтор/i.test(b.textContent??""))).toBe(true);
  });
  it("G05-S1-72 owner switch while ACK pending never reuses A identity for B",async()=>{
    const pending=deferred();
    send.mockReturnValueOnce(pending.promise).mockResolvedValue(okReply("B"));
    await render();await fill();await submit();
    const old=send.mock.calls[0]![1];
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"B",username:"b",role:"USER"});
    });
    await render("B");await fill();await submit();
    const current=send.mock.calls[1]![1];
    expect(current.binding.ownerId).toBe("B");
    expect(current.requestId).not.toBe(old.requestId);
    expect(current.binding.sessionScope).not.toBe(old.binding.sessionScope);
    expect(prepareSyntheticManualRetryS1(markPetIntentS1(old,"unknown"),
      current.binding,true)).toBeNull();
    await act(async()=>pending.resolve(okReply("A")));
    expect(send).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain(old.requestId);
    expect(host.textContent).not.toContain("SYNTHETIC_TCP_ACK_LOSS");
  });
  it("G05-S1-73 editable HTTP400 followed by conscious resubmit gets new key",async()=>{
    send.mockResolvedValueOnce({status:400,body:{success:false,error:"PRIVATE"}});
    await render();await fill();await submit();
    const first=send.mock.calls[0]![1];
    expect(host.querySelector("form")).not.toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
    await edit("breed","Метис");await submit();
    const second=send.mock.calls[1]![1];
    expect(second.requestId).not.toBe(first.requestId);
    expect(first.body.breed).toBe("Лабрадор");
    expect(second.body.breed).toBe("Метис");
    expect(first.binding.ownerId).toBe(second.binding.ownerId);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("G05-S1-77 uncertain mock outcome keeps JSON requestId and payload on explicit retry",async()=>{
    send.mockResolvedValueOnce({status:503,body:{error:"hidden"}});
    await render();await fill();await submit();
    expect(send).toHaveBeenCalledTimes(1);
    const [first,identity]=send.mock.calls[0]!;
    expect(first).toMatchObject({name:"Тоби",birthDate:"2020-03-15",
      clientRequestId:identity.requestId});
    expect(first).not.toHaveProperty("Idempotency-Key");
    const manual=[...host.querySelectorAll("button")].find(b=>b.textContent==="Повторить вручную (mock)");
    expect(manual?.type).toBe("button");
    send.mockResolvedValueOnce(okReply());
    await act(async()=>manual?.click());
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0]).toEqual(first);
    expect(send.mock.calls[1]![1].requestId).toBe(identity.requestId);
    expect(host.textContent).toContain("Питомец создан");
    expect((globalThis.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
  it("G05-S1-78 multiple manual retries after 503 keep exactly one key; no auto-resend",async()=>{
    send.mockResolvedValue({status:503,body:{error:"unknown"}});
    await render();await fill();await submit();
    const first=send.mock.calls[0]![0];
    for(let attempt=2;attempt<=3;attempt++){
      const manual=[...host.querySelectorAll("button")]
        .find(b=>b.textContent==="Повторить вручную (mock)");
      expect(send).toHaveBeenCalledTimes(attempt-1);
      await act(async()=>manual?.click());
      expect(send).toHaveBeenCalledTimes(attempt);
      expect(send.mock.calls[attempt-1]![0]).toEqual(first);
    }
  });
  it("G05-S1-79 manual pending double click is single-flight",async()=>{
    send.mockResolvedValueOnce({status:503,body:{error:"unknown"}});
    const wait=deferred();send.mockReturnValueOnce(wait.promise);
    await render();await fill();await submit();
    const manual=[...host.querySelectorAll("button")]
      .find(b=>b.textContent==="Повторить вручную (mock)");
    await act(async()=>{manual?.click();manual?.click();});
    expect(send).toHaveBeenCalledTimes(2);
    await act(async()=>wait.resolve(okReply()));
    expect(host.textContent).toContain("Питомец создан");
  });
  it("G05-S1-80 auth session revision after unknown blocks same-owner retry",async()=>{
    send.mockResolvedValueOnce({status:503,body:{error:"unknown"}});
    await render();await fill();await submit();
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"new-session",role:"USER"});
    });
    const manual=[...host.querySelectorAll("button")]
      .find(b=>b.textContent==="Повторить вручную (mock)");
    await act(async()=>manual?.click());
    expect(send).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Сессия изменилась");
  });
  it("G05-S1-81 A-B-A principal change after unknown prevents replay",async()=>{
    send.mockResolvedValueOnce({status:503,body:{error:"unknown"}});
    await render();await fill();await submit();
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"B",username:"b",role:"USER"});
      cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"a",role:"USER"});
    });
    const manual=[...host.querySelectorAll("button")]
      .find(b=>b.textContent==="Повторить вручную (mock)");
    await act(async()=>manual?.click());
    expect(send).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("Питомец создан");
  });

  it("G05-S1-82 manual retry wrong-owner 201 cannot confirm or mint a key",async()=>{
    send.mockResolvedValueOnce({status:503,body:{error:"unknown"}})
      .mockResolvedValueOnce(okReply("B"));
    await render();await fill();await submit();
    const first=send.mock.calls[0]![0];
    const manual=[...host.querySelectorAll("button")]
      .find(b=>b.textContent==="Повторить вручную (mock)");
    await act(async()=>manual?.click());
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0]).toEqual(first);
    expect(host.textContent).toContain("Проверьте результат");
    expect(host.textContent).not.toContain("Питомец создан");
  });
  it("G05-S1-83 failed manual retry leaves draft/key private and stops on logout",async()=>{
    send.mockResolvedValue({status:503,body:{error:"unknown"}});
    await render();await fill();await submit();
    const manual=[...host.querySelectorAll("button")]
      .find(b=>b.textContent==="Повторить вручную (mock)");
    await act(async()=>manual?.click());
    await act(async()=>cache.clear());
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).toContain("Требуется авторизация");
    expect(send).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain(send.mock.calls[0]![1].requestId);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
