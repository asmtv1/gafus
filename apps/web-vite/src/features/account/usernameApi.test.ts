import { afterEach, describe, expect, it, vi } from "vitest";
import { changeUsername, getUsernameAvailability } from "./usernameApi";
import { type HonoChangeDto, type HonoAvailableDto } from "./usernameContract";
function response(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { "Content-Type": "application/json" },
  });
}
const user = (username = "new_login", id = "actor-A") =>
  ({ id, username, role: "USER" });
afterEach(() => vi.unstubAllGlobals());

describe("G03 typed Hono cookie adapter — local mock fetch, no network", () => {
  it("GET checks normalized username by relative query, with browser cookie but no body/Origin spoof", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200,{
      success:true, data:{ available:true },
    } satisfies HonoAvailableDto));
    vi.stubGlobal("fetch",fetcher);
    expect(await getUsernameAvailability("  NEW_Login  ","actor-A",1)).toEqual({
      kind:"known",available:true,
    });
    const [path,init]=fetcher.mock.calls[0] as [string,RequestInit];
    expect(path).toBe("/api/v1/auth/username-available?username=new_login");
    expect(init).toMatchObject({method:"GET",credentials:"include",cache:"no-store"});
    expect(init.headers).toMatchObject({"X-Gafus-Auth-Transport":"cookie"});
    expect(init.body).toBeUndefined();
    expect(JSON.stringify(init.headers)).not.toMatch(/Origin|Authorization|X-CSRF-Token|Bearer/i);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["  Ab_1  ", "/api/v1/auth/username-available?username=ab_1", true],
    ["ab", null, false],
    ["x".repeat(51), null, false],
    ["привет", null, false],
    ["a.b", null, false],
  ] as const)("GET shared normalized query plan %j", async(input,path,valid)=>{
    const fetcher=vi.fn().mockResolvedValue(response(200,{success:true,data:{available:true}}));
    vi.stubGlobal("fetch",fetcher);
    const decision=await getUsernameAvailability(input,"actor-A",1);
    expect(decision).toEqual(valid?{kind:"known",available:true}:{kind:"fail-closed",autoRetry:false});
    expect(fetcher).toHaveBeenCalledTimes(valid?1:0);
    if(path)expect(fetcher.mock.calls[0][0]).toBe(path);
  });
  it("GET accepts forward-compatible response data additions",async()=>{
    const fetcher=vi.fn().mockResolvedValue(response(200,{
      success:true,data:{available:false,serverVersion:2},futureField:1,
    }));
    vi.stubGlobal("fetch",fetcher);
    expect(await getUsernameAvailability("username_1","actor-A",1))
      .toEqual({kind:"known",available:false});
  });
  it("GET false availability mapped from nested Hono data, not legacy flat",async()=>{
    const fetcher=vi.fn().mockResolvedValue(response(200,{
      success:true,data:{available:false},
    }));
    vi.stubGlobal("fetch",fetcher);
    expect(await getUsernameAvailability("taken_1","actor-A",1)).toEqual({
      kind:"known",available:false});
  });
  it.each([
    [{success:true,available:true}],
    [{success:true,data:{available:"true"}}],
    [{success:true,data:{available:null}}],
    [{success:true,data:{}}],
  ])("GET malformed Hono data fails closed: %j",async payload=>{
    const fetcher=vi.fn().mockResolvedValue(response(200,payload));
    vi.stubGlobal("fetch",fetcher);
    expect(await getUsernameAvailability("valid_1","actor-A",1)).toEqual({
      kind:"fail-closed",autoRetry:false});
  });
  it.each([400,401,403,429,500,503])("GET %i fails closed; no automatic retry",async status=>{
    const fetcher=vi.fn().mockResolvedValue(response(status,{
      success:false,error:"Backend secret + username tried by user",
    }));
    vi.stubGlobal("fetch",fetcher);
    expect(await getUsernameAvailability("valid_1","actor-A",1)).toEqual({
      kind:"fail-closed",autoRetry:false});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("GET rejects invalid username and absent actor before network",async()=>{
    const fetcher=vi.fn();
    vi.stubGlobal("fetch",fetcher);
    expect(await getUsernameAvailability("a","actor-A",1)).toEqual({
      kind:"fail-closed",autoRetry:false});
    expect(await getUsernameAvailability("valid","",1)).toEqual({
      kind:"fail-closed",autoRetry:false});
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("POST sends only newUsername JSON and receives Hono nested actor-matched ACK",async()=>{
    const fetcher=vi.fn().mockResolvedValue(response(200,{
      success:true,data:{user:user()},
    } satisfies HonoChangeDto));
    vi.stubGlobal("fetch",fetcher);
    expect(await changeUsername("  NEW_login  ","actor-A")).toMatchObject({
      kind:"committed",actorId:"actor-A",canonicalUsername:"new_login",
      serverPrincipalValidated:true,profileHref:"/profile?username=new_login",
    });
    const [path,init]=fetcher.mock.calls[0] as [string,RequestInit];
    expect(path).toBe("/api/v1/auth/username-change");
    expect(init).toMatchObject({method:"POST",credentials:"include",cache:"no-store"});
    expect(init.headers).toMatchObject({
      "Content-Type":"application/json","X-Gafus-Auth-Transport":"cookie"});
    expect(JSON.parse(String(init.body))).toEqual({newUsername:"new_login"});
    expect(JSON.stringify(init)).not.toMatch(/userId|Authorization|Bearer|X-CSRF-Token|Origin":/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("POST cannot accept flat legacy ACK or mismatched owner / malformed JSON",async()=>{
    for (const payload of [
      {success:true,username:"new_login"},
      {success:true,data:{user:user("new_login","actor-B")}},
      {success:true,data:{user:{id:"actor-A",username:"UPPER",role:"USER"}}},
      {success:true,data:{user:{id:"actor-A",username:"new_login"}}},
      {success:true,data:{}},
      {success:"true",data:{user:user()}},
      {success:false,data:{user:user()}},
    ]) {
      const fetcher=vi.fn().mockResolvedValue(response(200,payload));
      vi.stubGlobal("fetch",fetcher);
      const result=await changeUsername("new_login","actor-A");
      expect(result.kind).not.toBe("committed");
      expect(result).toHaveProperty("autoRetry",false);
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it.each([[400,"validation-or-conflict-unfrozen"],[401,"unauthenticated"],
    [403,"forbidden"],[429,"rate-limited"],[500,"unknown-outcome"],
    [503,"unknown-outcome"]])("POST HTTP %i safe status %s and single call",async(status,classification)=>{
    const fetcher=vi.fn().mockResolvedValue(response(status,{
      success:false,error:"raw invalid username TEST_SECRET_LEAK",
    }));
    vi.stubGlobal("fetch",fetcher);
    const result=await changeUsername("other_name","actor-A");
    expect(result).toMatchObject({
      kind:"not-confirmed",error:classification,autoRetry:false});
    expect(JSON.stringify(result)).not.toContain("TEST_SECRET_LEAK");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("current server HTTP400 does not fabricate HTTP409 conflict",async()=>{
    const fetcher=vi.fn().mockResolvedValue(response(400,{
      success:false,error:"Логин уже занят",
    }));
    vi.stubGlobal("fetch",fetcher);
    expect(await changeUsername("taken_1","actor-A")).toMatchObject({
      error:"validation-or-conflict-unfrozen",autoRetry:false,
    });
  });
  it("POST network loss or malformed JSON marks unknown ACK without mutation replay",async()=>{
    const fetcher=vi.fn().mockRejectedValue(new Error("lost response"));
    vi.stubGlobal("fetch",fetcher);
    expect(await changeUsername("another_1","actor-A")).toMatchObject({
      kind:"not-confirmed",error:"unknown-outcome",autoRetry:false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const invalid=vi.fn().mockResolvedValue(new Response("{bad json",{status:200}));
    vi.stubGlobal("fetch",invalid);
    expect(await changeUsername("another_1","actor-A")).toMatchObject({
      kind:"not-confirmed",error:"unknown-outcome",autoRetry:false,
    });
    expect(invalid).toHaveBeenCalledTimes(1);
  });
  it("actual oversized HTTP400 non-JSON is UNKNOWN, not an editable format/collision state",async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(
      "Request body is too large: SYNTHETIC_PRIVATE_DIAGNOSTIC",
      {status:400,headers:{"Content-Type":"text/plain"}},
    ));
    vi.stubGlobal("fetch",fetcher);
    const result=await changeUsername("valid_name","actor-A");
    expect(result).toMatchObject({
      kind:"not-confirmed",error:"unknown-outcome",autoRetry:false,
    });
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PRIVATE_DIAGNOSTIC");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("malformed JSON envelope on HTTP400 is UNKNOWN, not a reliable format error",async()=>{
    const fetcher=vi.fn().mockResolvedValue(response(400,{error:"SYNTHETIC_PRIVATE_DIAGNOSTIC"}));
    vi.stubGlobal("fetch",fetcher);
    const result=await changeUsername("valid_name","actor-A");
    expect(result).toMatchObject({
      kind:"not-confirmed",error:"unknown-outcome",autoRetry:false,
    });
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PRIVATE_DIAGNOSTIC");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("post-write read-failure HTTP500 never yields a committed ACK or reruns mutation",async()=>{
    const fetcher=vi.fn().mockResolvedValue(response(500,{
      success:false,error:"Ошибка сервера",
    }));
    vi.stubGlobal("fetch",fetcher);
    expect(await changeUsername("valid_name","actor-A")).toMatchObject({
      kind:"not-confirmed",error:"unknown-outcome",autoRetry:false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("POST invalid candidate never calls network",async()=>{
    const fetcher=vi.fn();
    vi.stubGlobal("fetch",fetcher);
    expect(await changeUsername("a","actor-A")).toHaveProperty("autoRetry",false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
