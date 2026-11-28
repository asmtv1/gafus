import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({role:vi.fn(),lock:vi.fn(),transaction:vi.fn(),insert:vi.fn(),erase:vi.fn(),upsert:vi.fn(),config:vi.fn(),count:vi.fn(),messages:vi.fn(),update:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{
  user:{findUnique:m.role},
  trainerAIConfig:{findFirst:m.config},
  trainerAIChat:{count:m.count,findMany:m.messages},
  $transaction:m.transaction,
}}));
import {
 readTrainerAIActorRole,readTrainerAIStreamConfig,readTrainerAISettingsSummary,
 readTrainerAIHistoryRows,clearTrainerAIHistoryAuthorized,saveTrainerAIExchangeAuthorized,
 saveTrainerAIConfigAuthorized,
} from "./persistence.js";
const tx=()=>({
 $queryRaw:m.lock,user:{findUnique:m.role},
 trainerAIChat:{create:m.insert,deleteMany:m.erase},trainerAIConfig:{upsert:m.upsert},
});
beforeEach(()=>{
 vi.clearAllMocks();m.role.mockResolvedValue({role:"TRAINER"});m.lock.mockResolvedValue([{id:"actor"}]);
 m.transaction.mockImplementation(async(callback:(t:unknown)=>Promise<unknown>)=>callback(tx()));
 m.insert.mockResolvedValue({id:"assistant-message"});m.erase.mockResolvedValue({count:2});
 m.config.mockResolvedValue({model:"safe-model",enabled:true,apiKey:"secret-synthetic"});
 m.count.mockResolvedValue(0);m.messages.mockResolvedValue([]);
});
describe("Trainer AI persistence owns actor-scoped queries and atomic transactions",()=>{
 it("returns only current role and fails closed with no identity",async()=>{
  expect(await readTrainerAIActorRole("actor")).toBe("TRAINER");
  expect(m.role).toHaveBeenCalledExactlyOnceWith({where:{id:"actor"},select:{role:true}});
  expect(await readTrainerAIActorRole("")).toBeNull();
  expect(m.role).toHaveBeenCalledOnce();
 });
 it("keeps API key out of safe settings response",async()=>{
  expect(await readTrainerAISettingsSummary("actor",["TRAINER","ADMIN"])).toEqual({model:"safe-model",enabled:true,hasCustomKey:true});
  expect(m.config).toHaveBeenCalledWith({where:{trainerId:"actor",trainer:{role:{in:["TRAINER","ADMIN"]}}},select:{model:true,enabled:true,apiKey:true}});
  expect(await readTrainerAIStreamConfig("actor",["TRAINER","ADMIN"])).toEqual({model:"safe-model",enabled:true,apiKey:"secret-synthetic"});
 });
 it("bounds the history query to the authenticated trainer",async()=>{
  m.count.mockResolvedValueOnce(25);
  const result=await readTrainerAIHistoryRows("actor",20,10,["TRAINER"]);
  expect(result).toEqual({total:25,messages:[]});
  expect(m.messages).toHaveBeenCalledExactlyOnceWith({where:{trainerId:"actor",trainer:{role:{in:["TRAINER"]}}},orderBy:[{createdAt:"desc"},{id:"desc"}],take:10,skip:20,
   select:{id:true,role:true,content:true,tokensUsed:true,attachments:true,createdAt:true}});
 });
 it("does not issue an out-of-range SQL offset or accept invalid pagination",async()=>{
  m.count.mockResolvedValue(1000);
  expect(await readTrainerAIHistoryRows("actor",Number.MAX_SAFE_INTEGER,100,["TRAINER"])).toEqual({total:1000,messages:[]});
  expect(m.messages).not.toHaveBeenCalled();
  await expect(readTrainerAIHistoryRows("actor",NaN,100,["TRAINER"])).rejects.toThrow("INVALID_HISTORY_PAGE");
  await expect(readTrainerAIHistoryRows("actor",0,101,["TRAINER"])).rejects.toThrow("INVALID_HISTORY_PAGE");
 });
 it("fails closed before reading settings/history without eligible roles",async()=>{
   expect(await readTrainerAIStreamConfig("actor",[])).toBeNull();
   expect(await readTrainerAISettingsSummary("actor",[])).toBeNull();
   await expect(readTrainerAIHistoryRows("actor",0,10,[])).rejects.toThrow("FORBIDDEN");
   expect(m.config).not.toHaveBeenCalled();expect(m.messages).not.toHaveBeenCalled();
 });
 it("denies revoked staff before inserting either message",async()=>{
  m.role.mockResolvedValueOnce({role:"USER"});
  const input={trainerId:"actor",content:"question",reply:"answer",model:"m"};
  await expect(saveTrainerAIExchangeAuthorized(input,["TRAINER","ADMIN"])).rejects.toThrow("FORBIDDEN");
  expect(m.insert).not.toHaveBeenCalled();
 });
 it("writes a full pair inside one locked SQL transaction",async()=>{
  const input={trainerId:"actor",content:"question",reply:"answer",model:"m",tokensUsed:8};
  expect(await saveTrainerAIExchangeAuthorized(input,["TRAINER"])).toEqual({id:"assistant-message"});
  expect(m.transaction).toHaveBeenCalledOnce();
  expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.insert.mock.invocationCallOrder[0]);
  expect(m.insert).toHaveBeenCalledTimes(2);
  expect(m.insert.mock.calls[0]?.[0]).toMatchObject({data:{trainerId:"actor",role:"user",content:"question"}});
  expect(m.insert.mock.calls[1]?.[0]).toMatchObject({data:{trainerId:"actor",role:"assistant",content:"answer",tokensUsed:8}});
 });
 it("never clears someone else's messages after current-role revocation",async()=>{
  m.role.mockResolvedValueOnce({role:"USER"});
  await expect(clearTrainerAIHistoryAuthorized("actor",["TRAINER"])).rejects.toThrow("FORBIDDEN");
  expect(m.erase).not.toHaveBeenCalled();
 });
 it("clears only the authorized trainer in a transaction",async()=>{
  expect(await clearTrainerAIHistoryAuthorized("actor",["TRAINER"])).toBe(2);
  expect(m.erase).toHaveBeenCalledExactlyOnceWith({where:{trainerId:"actor"}});
 });
 it("admin settings write rechecks the current database role under lock",async()=>{
  const data={where:{trainerId:"target"},create:{trainerId:"target",model:"m"},update:{model:"m"}} as const;
  m.role.mockResolvedValueOnce({role:"ADMIN"});
  await saveTrainerAIConfigAuthorized("admin",data,["ADMIN","MODERATOR"]);
  expect(m.upsert).toHaveBeenCalledExactlyOnceWith(data);
  expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.upsert.mock.invocationCallOrder[0]);
 });
 it("rejects missing or demoted staff before changing the key/config",async()=>{
  m.role.mockResolvedValueOnce({role:"USER"});
  const data={where:{trainerId:"target"},create:{trainerId:"target",model:"m"},update:{model:"m"}} as const;
  await expect(saveTrainerAIConfigAuthorized("user",data,["ADMIN"])).rejects.toThrow("Недостаточно прав");
  expect(m.upsert).not.toHaveBeenCalled();
  await expect(saveTrainerAIConfigAuthorized("",data,["ADMIN"])).rejects.toThrow("Недостаточно прав");
 });
});
