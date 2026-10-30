import { afterEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({ client:vi.fn(), multipart:vi.fn() }));
vi.mock("./client",()=>({
  apiClient:(...args:unknown[])=>m.client(...args),
  apiClientMultipart:(...args:unknown[])=>m.multipart(...args),
}));
vi.mock("expo-secure-store",()=>({getItemAsync:vi.fn()}));
import {userApi} from "./user";
afterEach(()=>vi.resetAllMocks());
describe("original registered user deletion Mobile transport",()=>{
  it("6-digit email challenge uses exactly registered POST, no 401 replay, current actor",async()=>{
    m.client.mockResolvedValue({success:true});
    const current=()=>true;
    expect(await userApi.requestAccountDeletionCode(current)).toMatchObject({success:true});
    expect(m.client).toHaveBeenCalledOnce();
    expect(m.client).toHaveBeenCalledWith("/api/v1/user/account/deletion-code",{
      method:"POST",body:{},requestGuard:current,skipAuthRefreshReplay:true,
    });
  });
  it("final deletion POST sends only six-digit code and actor requestGuard, never replays 401",async()=>{
    m.client.mockResolvedValue({success:true});
    const current=()=>true;
    expect(await userApi.deleteAccount("123456",current)).toMatchObject({success:true});
    expect(m.client).toHaveBeenCalledExactlyOnceWith("/api/v1/user/account/delete",{
      method:"POST",body:{code:"123456"},requestGuard:current,
      skipAuthRefreshReplay:true,
    });
    expect(JSON.stringify(m.client.mock.calls)).not.toContain("userId");
    expect(JSON.stringify(m.client.mock.calls)).not.toContain("username");
  });
  it("rejects invalid/malformed code locally without any backend or mail effect",async()=>{
    for(const value of ["","1","12345","1234567","１２３４５６","12345a"," 123456 "]){
      const result=await userApi.deleteAccount(value,()=>true);
      expect(result).toMatchObject({success:false,code:"INVALID_CODE"});
    }
    expect(m.client).not.toHaveBeenCalled();
  });
  it("existing callers without guard still keep request replay disabled",async()=>{
    m.client.mockResolvedValue({success:true});
    await userApi.requestAccountDeletionCode();
    await userApi.deleteAccount("000000");
    expect(m.client.mock.calls.map(([,opts])=>opts)).toEqual([
      {method:"POST",body:{},skipAuthRefreshReplay:true},
      {method:"POST",body:{code:"000000"},skipAuthRefreshReplay:true},
    ]);
  });
});
