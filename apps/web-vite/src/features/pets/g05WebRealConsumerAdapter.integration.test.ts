/** G05 new Web runner injected source/mock suite. No fetch, POST or shared DB. */
import {describe,it,expect,vi} from "vitest";
import {G05WebRealConsumerAdapter,type G05WirePort,type G05WireRequest}
  from "./g05WebRealConsumerAdapter";
import type {PetCreateBindingS1} from "./petCreateIntentS1";
import type {PetCreateBody,PetReply} from "./petCreateS1";

const key="11111111-1111-4111-8111-111111111111";
const body:PetCreateBody={name:"Барсик",type:"CAT",breed:"Метис",
  birthDate:"2020-02-29",heightCm:24,notes:"synthetic fixture"};
const A:PetCreateBindingS1={ownerId:"A",authEpoch:1,sessionScope:"s1"};
const B:PetCreateBindingS1={ownerId:"B",authEpoch:2,sessionScope:"s2"};
const ack=(owner="A",id="pet_a"):PetReply=>({status:201,body:{
  success:true,data:{id,ownerId:owner,name:body.name,type:body.type}}});
function create(send:G05WirePort,binding=A){
  const s=new G05WebRealConsumerAdapter(send);
  s.setSession(binding);
  expect(s.begin(body,()=>key)).toBe(true);
  return s;
}
function delayed(){
  let resolve!: (reply:PetReply)=>void;
  const promise=new Promise<PetReply>(yes=>{resolve=yes;});
  return {promise,resolve};
}
describe("AG2 G05 prepared real consumer SOURCE-MOCK runner",()=>{
  it("WEBG05-01 sends exact canonical JSON with UUID, no forged owner/header",async()=>{
    const sent:G05WireRequest[]=[];
    const s=create(async request=>{sent.push(request);return ack();});
    expect((await s.first()).kind).toBe("confirmed");
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!.jsonText)).toEqual({...body,clientRequestId:key});
    expect(sent[0]!.jsonText).not.toMatch(/ownerId|userId|Idempotency-Key|weightKg/);
    expect(sent[0]!.binding).toEqual(A);
  });
  it("WEBG05-02 begin does not implicitly POST",()=>{
    const send=vi.fn(async()=>ack());
    const s=create(send);s.setSession({...A});
    expect(s.snapshot.attempts).toBe(0);expect(send).not.toHaveBeenCalled();
  });
  it("WEBG05-03 lost ACK maybe committed: manual identical byte retry",async()=>{
    const sent:string[]=[];let n=0;
    const s=create(async request=>{
      sent.push(request.jsonText);
      if(++n===1)throw Error("simulated transport lost ACK");
      return ack();
    });
    expect((await s.first()).kind).toBe("unknown");
    expect((await s.manualRetry(false)).kind).toBe("blocked");
    expect(sent).toHaveLength(1);
    expect((await s.manualRetry(true)).kind).toBe("confirmed");
    expect(sent).toHaveLength(2);expect(sent[0]).toBe(sent[1]);
  });
  it("WEBG05-04 repeated 503 retains same JSON/no auto",async()=>{
    const sent:string[]=[];
    const s=create(async request=>{sent.push(request.jsonText);
      return {status:503,body:{error:"PRIVATE_DETAIL"}};});
    expect((await s.first()).kind).toBe("unknown");
    expect(sent).toHaveLength(1);
    for(let i=0;i<3;i++){
      const result=await s.manualRetry(true);
      expect(result.kind).toBe("unknown");
      expect(JSON.stringify(result)).not.toContain("PRIVATE_DETAIL");
    }
    expect(new Set(sent).size).toBe(1);expect(sent).toHaveLength(4);
  });
  it.each(["PET_CREATE_REQUEST_CONFLICT","PET_CREATE_RESULT_UNAVAILABLE"])(
    "WEBG05-05/06 409 %s terminal, not ambiguous",async code=>{
      const send=vi.fn(async()=>({status:409,body:{error:code}}));
      const s=create(send);
      expect((await s.first()).kind).toBe("conflict");
      expect(s.snapshot.state).toBe("conflict");
      expect((await s.manualRetry(true)).kind).toBe("blocked");
      expect(send).toHaveBeenCalledTimes(1);
    });
  it("WEBG05-07 401 re-attestation keeps exact body and requires manual action",async()=>{
    const sent:string[]=[];let n=0;
    const s=create(async request=>{
      sent.push(request.jsonText);
      return ++n===1?{status:401,body:{}}:ack();
    });
    expect((await s.first()).kind).toBe("reauth-required");
    expect(sent).toHaveLength(1);
    s.setSession({...A});
    expect((await s.manualRetry(true)).kind).toBe("confirmed");
    expect(sent[0]).toBe(sent[1]);
  });
  it("WEBG05-08 different authEpoch blocks 401 replay",async()=>{
    const send=vi.fn(async()=>({status:401,body:{}}));
    const s=create(send);await s.first();s.setSession({...A,authEpoch:2});
    expect((await s.manualRetry(true)).kind).toBe("blocked");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("WEBG05-09 A-B-A switch permanently fences old key",async()=>{
    const send=vi.fn(async()=>({status:503,body:{}}));
    const s=create(send);await s.first();s.setSession(B);s.setSession(A);
    expect((await s.manualRetry(true)).kind).toBe("blocked");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("WEBG05-10 same owner but changed sessionScope fences retry",async()=>{
    const s=create(async()=>({status:503,body:{}}));
    await s.first();s.setSession({...A,sessionScope:"other"});
    expect((await s.manualRetry(true)).kind).toBe("blocked");
  });
  it("WEBG05-11 logout and login cannot resume old operation",async()=>{
    const s=create(async()=>({status:503,body:{}}));
    await s.first();s.setSession(null);s.setSession(A);
    expect((await s.manualRetry(true)).kind).toBe("blocked");
  });
  it("WEBG05-12 pending A reply 201 after B switch never confirms",async()=>{
    const hold=delayed(),s=create(()=>hold.promise);
    const pending=s.first();s.setSession(B);hold.resolve(ack());
    expect((await pending).kind).toBe("blocked");
    expect(s.snapshot).toMatchObject({fenced:true,state:"unknown"});
  });
  it("WEBG05-13 wrong-owner 201 is unknown, never accepted",async()=>{
    const sends:string[]=[];
    const s=create(async request=>{sends.push(request.jsonText);return ack("B");});
    expect((await s.first()).kind).toBe("unknown");
    expect((await s.manualRetry(true)).kind).toBe("unknown");
    expect(sends[0]).toBe(sends[1]);
  });
  it("WEBG05-14 malformed success envelope never accepted",async()=>{
    const s=create(async()=>({status:201,body:{success:false}}));
    expect((await s.first()).kind).toBe("unknown");
  });
  it("WEBG05-15 simultaneous clicks only one POST",async()=>{
    const hold=delayed(),send=vi.fn(()=>hold.promise),s=create(send);
    const pending=s.first();
    expect((await s.first()).kind).toBe("blocked");
    expect((await s.manualRetry(true)).kind).toBe("blocked");
    expect(send).toHaveBeenCalledTimes(1);hold.resolve(ack());
    expect((await pending).kind).toBe("confirmed");
  });
  it("WEBG05-16 confirmed operation never resent",async()=>{
    const send=vi.fn(async()=>ack()),s=create(send);
    expect((await s.first()).kind).toBe("confirmed");
    expect((await s.manualRetry(true)).kind).toBe("blocked");
    expect((await s.first()).kind).toBe("blocked");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it.each([400,403])("WEBG05-17 status %i terminal no silent retry",async status=>{
    const send=vi.fn(async()=>({status,body:{error:"SENSITIVE"}})),s=create(send);
    expect((await s.first()).kind).toBe(status===400?"editable-error":"denied");
    expect((await s.manualRetry(true)).kind).toBe("blocked");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it.each([429,500,502,503,200])("WEBG05-18 status %i uncertain",async status=>{
    const s=create(async()=>({status,body:{error:"PRIVATE"}}));
    expect((await s.first()).kind).toBe("unknown");
    expect(s.snapshot.state).toBe("unknown");
  });
  it("WEBG05-19 new logical intent cannot replace unknown in same adapter",async()=>{
    const s=create(async()=>({status:503,body:{}}));
    await s.first();expect(s.begin({...body,name:"Другой"},()=>key)).toBe(false);
  });
  it("WEBG05-20 input object mutations cannot rewrite frozen canonical intent",async()=>{
    const mutable={...body};
    const sent:string[]=[];
    const s=new G05WebRealConsumerAdapter(async request=>{
      sent.push(request.jsonText);return {status:503,body:{}};
    });
    s.setSession(A);
    expect(s.begin(mutable,()=>key)).toBe(true);
    mutable.name="Другое";
    await s.first();await s.manualRetry(true);
    expect(sent[0]).toBe(sent[1]);
    expect(JSON.parse(sent[0]!).name).toBe(body.name);
  });
  it("WEBG05-21 transport exception doesn't leak sensitive details",async()=>{
    const s=create(async()=>{throw Error("private token and notes");});
    expect(JSON.stringify(await s.first())).not.toMatch(/private token|and notes/);
  });
  it("WEBG05-22 no authenticated session cannot create/POST",async()=>{
    const send=vi.fn(async()=>ack()),s=new G05WebRealConsumerAdapter(send);
    expect(s.begin(body,()=>key)).toBe(false);
    expect((await s.first()).kind).toBe("blocked");
    expect(send).not.toHaveBeenCalled();
  });
  it("WEBG05-23 changed epoch before late ACK fences 201",async()=>{
    const hold=delayed(),s=create(()=>hold.promise);
    const pending=s.first();s.setSession({...A,authEpoch:3});
    hold.resolve(ack());
    expect((await pending).kind).toBe("blocked");
    expect(s.snapshot.fenced).toBe(true);
  });
  it("WEBG05-24 unknown network rejection replay retains key",async()=>{
    const send=vi.fn().mockResolvedValueOnce({status:503,body:{}})
      .mockRejectedValueOnce(Error("network"))
      .mockResolvedValueOnce(ack());
    const s=create(send);
    expect((await s.first()).kind).toBe("unknown");
    expect((await s.manualRetry(true)).kind).toBe("unknown");
    expect((await s.manualRetry(true)).kind).toBe("confirmed");
    const sent=(send.mock.calls as [G05WireRequest][]).map(x=>x[0].jsonText);
    expect(new Set(sent).size).toBe(1);
  });
});
