import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({transaction:vi.fn(),lock:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{$transaction:m.transaction}}));
import {lockGafusUser,withGafusUserLock} from "./walletLock.js";
beforeEach(()=>{vi.clearAllMocks();m.transaction.mockImplementation(async(fn:(tx:unknown)=>Promise<unknown>)=>fn({$queryRaw:m.lock}));});
describe("Gafus wallet lock consistency across API, worker and Core",()=>{
 it("holds lock until the callback finishes, inside the same tx",async()=>{
  let sawLock=false;
  const result=await withGafusUserLock("owner-A",async tx=>{
    expect(tx).toBeDefined();
    sawLock=m.lock.mock.calls.length===1;
    return "committed";
  });
  expect(sawLock).toBe(true);
  expect(result).toBe("committed");
  expect(m.transaction).toHaveBeenCalledOnce();
  expect(m.lock).toHaveBeenCalledOnce();
 });
 it("missing owner fails closed before opening a transaction",async()=>{
  await expect(withGafusUserLock("",async()=>"unsafe")).rejects.toThrow("GAFUS_WALLET_OWNER_REQUIRED");
  expect(m.transaction).not.toHaveBeenCalled();
 });
 it("injected tx lock never opens a second transaction",async()=>{
  await lockGafusUser({$queryRaw:m.lock} as never,"owner-A");
  expect(m.lock).toHaveBeenCalledOnce();
  expect(m.transaction).not.toHaveBeenCalled();
 });
 it("missing user in an injected tx fails before SQL",async()=>{
  await expect(lockGafusUser({$queryRaw:m.lock} as never,"")).rejects.toThrow("GAFUS_WALLET_OWNER_REQUIRED");
  expect(m.lock).not.toHaveBeenCalled();
 });
});
