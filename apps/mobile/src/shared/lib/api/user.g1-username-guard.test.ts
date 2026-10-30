import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ request: vi.fn(), multipart: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.request, apiClientMultipart: m.multipart }));
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn() }));

import { userApi } from "./user";

beforeEach(() => vi.clearAllMocks());

describe("AG3 G1 native username-change transport compatibility", () => {
  it("keeps Bearer API POST JSON envelope with optional 401 request fence", async () => {
    const requestGuard = () => true;
    m.request.mockResolvedValue({
      success: true,
      data: { user: { id: "A", username: "fresh_name", role: "USER" } },
    });
    const result = await userApi.changeUsername("fresh_name", requestGuard);
    expect(result.success).toBe(true);
    expect(m.request).toHaveBeenCalledExactlyOnceWith("/api/v1/auth/username-change", {
      method: "POST",
      body: { newUsername: "fresh_name" },
      requestGuard,
    });
  });

  it("preserves old one-argument callers and machine error codes", async () => {
    m.request.mockResolvedValue({ success: false, code: "USERNAME_TAKEN", error: "taken" });
    const result = await userApi.changeUsername("taken_name");
    expect(result.code).toBe("USERNAME_TAKEN");
    expect(m.request).toHaveBeenCalledExactlyOnceWith("/api/v1/auth/username-change", {
      method: "POST",
      body: { newUsername: "taken_name" },
    });
  });
});

describe("AG3 shared username availability DTO", () => {
  it.each([true, false])("preserves boolean %s", async available => {
    m.request.mockResolvedValueOnce({ success: true, data: { available } });
    expect(await userApi.checkUsernameAvailable("name_1")).toEqual({
      success: true, data: { available },
    });
    expect(m.request).toHaveBeenCalledWith("/api/v1/auth/username-available?username=name_1");
  });
  it.each([{available:"true"},{available:1},{available:null},{},null])(
    "fails closed for malformed %j", async data => {
      m.request.mockResolvedValueOnce({success:true,data});
      expect(await userApi.checkUsernameAvailable("name_1")).toMatchObject({
        success:false,code:"INVALID_RESPONSE",
      });
    });
  it("preserves server-trimmed query transport for Mobile without changing Bearer/HTTP 400 semantics", async()=>{
    m.request.mockResolvedValueOnce({success:true,data:{available:false,serverVersion:2}});
    expect(await userApi.checkUsernameAvailable("  Ab_1  ")).toEqual({
      success:true,data:{available:false},
    });
    expect(m.request).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/auth/username-available?username=%20%20Ab_1%20%20",
    );
  });
  it.each([400,401,403,429,500,503])("GET error status %i retains opaque safe transport failure",async status=>{
    m.request.mockResolvedValueOnce({success:false,code:"API_"+status,error:"safe error"});
    const result=await userApi.checkUsernameAvailable("username_1");
    expect(result).toMatchObject({success:false,code:"API_"+status,error:"safe error"});
    expect(m.request).toHaveBeenCalledTimes(1);
  });
  it("accepts forward-compatible extra fields, never accepts malformed success as available",async()=>{
    m.request.mockResolvedValueOnce({success:true,data:{available:true,future:"ok"}});
    expect(await userApi.checkUsernameAvailable("username_1")).toEqual({
      success:true,data:{available:true},
    });
    m.request.mockResolvedValueOnce({success:true,data:{available:"false",future:"ok"}});
    expect(await userApi.checkUsernameAvailable("username_1")).toMatchObject({
      success:false,code:"INVALID_RESPONSE",
    });
  });
  it("retains service failure code", async () => {
    m.request.mockResolvedValueOnce({success:false,code:"RATE_LIMITED",error:"Slow down"});
    expect(await userApi.checkUsernameAvailable("name_1")).toMatchObject({
      success:false,code:"RATE_LIMITED",error:"Slow down",
    });
  });
});
