import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requestEmailChange, confirmEmailChange,
  setAccountPassword, changeAccountPassword, accountOperationError,
} from "./accountApi";
import { ApiError, apiRequest } from "../../shared/api/client";

function response(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status, headers: { "Content-Type": "application/json" },
  });
}
afterEach(() => vi.unstubAllGlobals());

describe("W1 four real typed relative Hono POST adapters (fake fetch, zero network)", () => {
  it("email request is exact private cookie-only POST, no untrusted actor or supplied Origin header", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200, { success:true }));
    vi.stubGlobal("fetch", fetcher);
    await requestEmailChange("new@example.org");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [path, options] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/v1/auth/email-change-request");
    expect(options).toMatchObject({
      method:"POST",credentials:"include",cache:"no-store",
    });
    expect(options.headers).toMatchObject({
      "X-Gafus-Auth-Transport":"cookie", "Content-Type":"application/json",
    });
    expect(JSON.parse(String(options.body))).toEqual({newEmail:"new@example.org"});
    expect(JSON.stringify(options)).not.toMatch(/userId|Bearer|X-CSRF|Authorization|Origin":/);
  });
  it("email request includes current password when supplied without exposing it in URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200, { success: true }));
    vi.stubGlobal("fetch", fetcher);
    await requestEmailChange("new@example.org", "CurrentPass123");
    const [path, options] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/v1/auth/email-change-request");
    expect(JSON.parse(String(options.body))).toEqual({
      newEmail: "new@example.org", currentPassword: "CurrentPass123",
    });
    expect(String(path)).not.toContain("CurrentPass123");
  });
  it("PUBLIC confirm is POST with token ONLY, credentials omit, never /me/refresh, no cookie transport", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200,{success:true}));
    vi.stubGlobal("fetch",fetcher);
    const token="T".repeat(43);
    await confirmEmailChange(token);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [path,opts]=fetcher.mock.calls[0] as [string,RequestInit];
    expect(path).toBe("/api/v1/auth/email-change-confirm");
    expect(opts.credentials).toBe("omit");
    expect(opts.method).toBe("POST");
    expect(opts.cache).toBe("no-store");
    expect(JSON.parse(String(opts.body))).toEqual({token});
    expect(JSON.stringify(opts.headers)).not.toMatch(/cookie|Bearer|Authorization/i);
    expect(path).not.toContain(token);
  });
  it("set password posts ONLY newPassword and never userId, body secret stays private", async () => {
    const fetcher=vi.fn().mockResolvedValue(response(200,{success:true}));
    vi.stubGlobal("fetch",fetcher);
    await setAccountPassword("GoodPassword123!");
    const [path,opts]=fetcher.mock.calls[0] as [string,RequestInit];
    expect(path).toBe("/api/v1/auth/set-password");
    expect(opts.credentials).toBe("include");
    expect(opts.headers).toMatchObject({"X-Gafus-Auth-Transport":"cookie"});
    expect(JSON.parse(String(opts.body))).toEqual({newPassword:"GoodPassword123!"});
    expect(path).not.toContain("Password");
  });
  it("change password posts current + new, no user identity or confirm fields", async () => {
    const fetcher=vi.fn().mockResolvedValue(response(200,{success:true}));
    vi.stubGlobal("fetch",fetcher);
    await changeAccountPassword("CurrentPassword1","NewPassword2");
    const [path,opts]=fetcher.mock.calls[0] as [string,RequestInit];
    expect(path).toBe("/api/v1/auth/change-password");
    expect(opts.credentials).toBe("include");
    expect(JSON.parse(String(opts.body))).toEqual({
      currentPassword:"CurrentPassword1",newPassword:"NewPassword2",
    });
    expect(JSON.stringify(opts.body)).not.toMatch(/confirm|userId|role/);
  });
  it.each([
    [400,"USERNAME_OR_EMAIL_CONFLICT"],
    [401,"UNAUTHORIZED"],[403,"FORBIDDEN"],
    [429,"RATE_LIMITED"],[503,"EMAIL_CHANGE_UNAVAILABLE"],
  ])("literal failure HTTP %i is typed ApiError without automatic mutation retry", async(status,code)=>{
    const fetcher=vi.fn().mockResolvedValue(response(status,{
      success:false, code, error:"Тестовая ошибка",
    }));
    vi.stubGlobal("fetch",fetcher);
    await expect(requestEmailChange("new@example.org"))
      .rejects.toMatchObject({status,code});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("HTTP 503 maps to safe unknown-ack guidance, 401 to login and 400 business text", () => {
    expect(accountOperationError(new ApiError(503,"provider failed","EMAIL_CHANGE_UNAVAILABLE"),"email"))
      .toContain("Результат запроса неизвестен");
    expect(accountOperationError(new ApiError(401,"unauthorized"),"password"))
      .toContain("Войдите снова");
    expect(accountOperationError(new ApiError(400,"Логин занят"),"email")).toBe("Логин занят");
  });
  it.each([400,409])("S1_PRIVACY_DELTA public confirm %i error must not reveal echoed capability",status=>{
    const secret="privateEmailCapability_"+"e".repeat(60);
    const output=accountOperationError(new ApiError(status,
      "Expired token: "+secret+"; contact support", "EMAIL_TOKEN_EXPIRED"),"confirm");
    expect(output).toContain("Ссылка");
    expect(output).not.toContain(secret);
    expect(output).not.toContain("contact support");
    expect(output).not.toContain("Expired token");
  });
  it("W1_PASSWORD_ERROR_PRIVACY unknown 400/409 cannot render a reflected password",()=>{
    const secret="NeverEchoPassword123!";
    for(const status of [400,409]){
      const actual=accountOperationError(new ApiError(status,
        "Invalid password "+secret+" in request"),"password");
      expect(actual).not.toContain(secret);
      expect(actual).not.toContain("Invalid password");
      expect(actual).toContain("парол");
    }
  });
  it("W1_PASSWORD_ERROR_PRIVACY recognized Core business error still useful",()=>{
    for(const message of ["Неверный текущий пароль",
      "Сначала установите пароль",
      "Пароль уже установлен, используйте смену пароля",
      "Пользователь не найден"]){
      expect(accountOperationError(new ApiError(400,message),"password")).toBe(message);
    }
  });
  it("malformed ACK {}, success:false at 200 and body success:'yes' never count as mutation success", async () => {
    for(const value of [{},{success:false,error:"Rejected"},{success:"yes"}]){
      vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response(200,value)));
      await expect(setAccountPassword("GoodPassword123!")).rejects.toBeInstanceOf(ApiError);
    }
  });
  it("network timeout/rejected fetch never automatically retries credentials", async () => {
    const fetcher=vi.fn().mockRejectedValue(new Error("TIMEOUT_SYNTH"));
    vi.stubGlobal("fetch",fetcher);
    await expect(changeAccountPassword("OldPassword1","NewPassword2")).rejects.toThrow("TIMEOUT_SYNTH");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("forbids a cookie-transport request with credentials omitted, and rejects external URLs", async () => {
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    await expect(apiRequest("/api/v1/auth/change-password",{
      method:"POST",json:{},browserAuth:true,credentials:"omit",
    })).rejects.toThrow(/cannot omit/);
    await expect(apiRequest("https://bad.invalid/api/v1/auth/confirm")).rejects.toThrow(/relative/);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
