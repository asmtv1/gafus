import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({tx:vi.fn(),lock:vi.fn(),update:vi.fn(),remove:vi.fn(),outside:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{
  $transaction:(...args:unknown[])=>m.tx(...args),
  reminder:{update:m.outside,delete:m.outside,findFirst:m.outside},
}}));
import {updateReminder,deleteReminder} from "./training-reminder-application.js";
beforeEach(()=>{
  vi.clearAllMocks();
  m.tx.mockImplementation(async(fn:(t:unknown)=>Promise<unknown>)=>fn({
    $queryRaw:m.lock,reminder:{update:m.update,delete:m.remove},
  }));
  m.lock.mockResolvedValue([{id:"reminder-A"}]);
  m.update.mockResolvedValue({id:"reminder-A",name:"New"});
  m.remove.mockResolvedValue({id:"reminder-A",name:"New"});
});
describe("reminder row-level ownership is checked inside the same SQL transaction",()=>{
  it("updates only a matching owner after taking the DB lock",async()=>{
    const result=await updateReminder("owner-A","reminder-A",{name:"New"});
    expect(result).toMatchObject({id:"reminder-A",name:"New"});
    expect(m.lock).toHaveBeenCalledOnce();
    expect(m.update).toHaveBeenCalledExactlyOnceWith({where:{id:"reminder-A"},data:{name:"New"}});
    expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.update.mock.invocationCallOrder[0]);
    expect(m.outside).not.toHaveBeenCalled();
  });
  it("denies a missing or transferred record without touching the row",async()=>{
    m.lock.mockResolvedValueOnce([]);
    await expect(updateReminder("other","reminder-A",{name:"stolen"})).rejects.toThrow("Напоминание не найдено");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("locks and deletes only authorized owner within transaction",async()=>{
    expect(await deleteReminder("owner-A","reminder-A")).toMatchObject({id:"reminder-A"});
    expect(m.remove).toHaveBeenCalledExactlyOnceWith({where:{id:"reminder-A"}});
    expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.remove.mock.invocationCallOrder[0]);
  });
  it("never removes an object if the row lock has no matching actor",async()=>{
    m.lock.mockResolvedValueOnce([]);
    await expect(deleteReminder("other","reminder-A")).rejects.toThrow("Напоминание не найдено");
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("invalid update fields are rejected before opening transactions",async()=>{
    await expect(updateReminder("owner-A","reminder-A",{reminderTime:"29:99"})).rejects.toThrow("Некорректный формат времени");
    expect(m.tx).not.toHaveBeenCalled();
  });
});
