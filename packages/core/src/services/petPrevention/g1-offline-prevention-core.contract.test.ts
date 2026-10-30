/** Real existing upsertPreventionEntriesBatch source. Test-only Prisma adapter
 * with row writes/transaction mock; DOES NOT establish PostgreSQL concurrency. */
import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({
 pets:new Map<string,string>(),rows:new Map<string,{id:string;clientId:string;petId:string;ownerId:string;productName:string|null}>(),
 created:0,updated:0,txn:0,failCreate:false,
}));
vi.mock("@gafus/prisma",()=>({
 Prisma:{DbNull:{__test:"DbNull"}},
 prisma:{
  pet:{findFirst:async(args:{where:{id:string;ownerId:string}})=>m.pets.get(args.where.id)===args.where.ownerId?{id:args.where.id}:null},
  $transaction:async(callback:(tx:unknown)=>Promise<unknown>)=>{
   m.txn++;const snapshot=new Map(m.rows),c=m.created,u=m.updated;
   const tx={petPreventionEntry:{
    findUnique:async(args:{where:{petId_clientId:{petId:string;clientId:string}}})=>m.rows.get(args.where.petId_clientId.petId+":"+args.where.petId_clientId.clientId)??null,
    create:async(args:{data:{petId:string;clientId:string;ownerId:string;productName:string|null}})=>{
     if(m.failCreate)throw Error("MOCK_SYNTHETIC_WRITE_FAIL");
     const k=args.data.petId+":"+args.data.clientId;
     if(m.rows.has(k))throw Error("UNIQUE_DB_SIMULATED");
     const row={id:"row-"+String(++m.created),...{petId:args.data.petId,clientId:args.data.clientId,ownerId:args.data.ownerId,productName:args.data.productName}};
     m.rows.set(k,row);return row;
    },
    update:async(args:{where:{id:string};data:{productName?:string|null}})=>{
     m.updated++;for(const [k,v] of m.rows)if(v.id===args.where.id)m.rows.set(k,{...v,productName:args.data.productName??null});return {};
    },
   }};
   try{return await callback(tx);}catch(e){m.rows=new Map(snapshot);m.created=c;m.updated=u;throw e;}
  },
 },
}));
vi.mock("@gafus/logger",()=>({createWebLogger:()=>({error:vi.fn(),info:vi.fn(),warn:vi.fn()})}));
import {upsertPreventionEntriesBatch} from "./petPreventionService";
const CID="b7b0b889-9ac2-479e-a101-1ab65c714c7a";
const event=(clientId=CID,productName="Original")=>({clientId,type:"VACCINATION" as const,performedAt:new Date("2026-10-16T12:00:00.000Z"),productName,reminderEnabled:false});
beforeEach(()=>{vi.clearAllMocks();m.pets=new Map([["petA","A"],["petB","B"]]);m.rows=new Map();m.created=0;m.updated=0;m.txn=0;m.failCreate=false;});
describe("AG3 prevention actual Core orchestration with fake Prisma (NO SQL)",()=>{
 it("PC01 first batch returns created=1, errors=[], row bound to A and petA",async()=>{
  const r=await upsertPreventionEntriesBatch("A","petA",[event()]);
  expect(r).toEqual({success:true,data:{created:1,updated:0,errors:[]}});
  expect(m.rows.get("petA:"+CID)).toMatchObject({ownerId:"A",petId:"petA",productName:"Original"});
 });
 it("PC02 replay same event results created=0 updated=1: re-ACK but not exactly-once no-write",async()=>{
  await upsertPreventionEntriesBatch("A","petA",[event()]);const r=await upsertPreventionEntriesBatch("A","petA",[event()]);
  expect(r).toEqual({success:true,data:{created:0,updated:1,errors:[]}});expect(m.rows).toHaveProperty("size",1);
 });
 it("PC03 same clientId with different body silently overwrites existing row",async()=>{
  await upsertPreventionEntriesBatch("A","petA",[event()]);
  const r=await upsertPreventionEntriesBatch("A","petA",[event(CID,"Changed-with-same-clientId")]);
  expect(r).toEqual({success:true,data:{created:0,updated:1,errors:[]}});
  expect(m.rows.get("petA:"+CID)?.productName).toBe("Changed-with-same-clientId");
 });
 it("PC04 other principal can't batch upsert petA; no data modifications",async()=>{
  await upsertPreventionEntriesBatch("A","petA",[event()]);const c=m.txn;
  expect(await upsertPreventionEntriesBatch("B","petA",[event(CID,"ATTACK")])).toEqual({success:false,error:"Питомец не найден"});
  expect(m.txn).toBe(c);expect(m.rows.get("petA:"+CID)?.ownerId).toBe("A");
 });
 it("PC05 one idempotency key scoped by petId: A and B pets do not collide",async()=>{
  await upsertPreventionEntriesBatch("A","petA",[event()]);const r=await upsertPreventionEntriesBatch("B","petB",[event()]);
  expect(r).toEqual({success:true,data:{created:1,updated:0,errors:[]}});expect(m.rows.size).toBe(2);
 });
 it("PC06 transaction rollback on batch fail leaves no partial mock writes",async()=>{
  m.failCreate=true;const r=await upsertPreventionEntriesBatch("A","petA",[event()]);
  expect(r.success).toBe(false);expect(m.rows.size).toBe(0);
 });
});
