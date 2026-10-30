/** AG1 G14 current Hono Vox envelopes: Core and provider deliberately mocked. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({
  jwt:vi.fn(), registration:vi.fn(), prepare:vi.fn(), admission:vi.fn(), sign:vi.fn(),
}));
vi.mock("@gafus/auth/jwt",async orig=>({...(await orig<object>()),verifyAccessToken:m.jwt}));
vi.mock("@gafus/core/services/auth",async orig=>({...(await orig<object>()),isRegistrationCompleted:m.registration}));
vi.mock("@gafus/core/services/consultation",async orig=>({...(await orig<object>()),
  prepareConsultationCall:m.prepare,createConsultationCallAdmission:m.admission,
  signConsultationOneTimeKey:m.sign,
}));
import { ConsultationForbiddenError,ConsultationNotFoundError,ConsultationVideoUnavailableError } from "@gafus/core/services/consultation";
import { authMiddleware } from "../../middleware/auth";
import { consultationsRoutes } from "./consultations";
const base="http://local.test/api/v1/consultations/bookings/booking-A/voximplant/";
function app(){const h=new Hono();h.use("/api/v1/consultations/*",authMiddleware);h.route("/api/v1/consultations",consultationsRoutes);return h;}
function req(action:string,body?:object){return app().request(base+action,{method:"POST",headers:{authorization:"Bearer test",...(body?{"content-type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});}
const privateNoStore=(r:Response)=>expect(r.headers.get("cache-control")).toContain("no-store");
beforeEach(()=>{vi.clearAllMocks();m.jwt.mockResolvedValue({id:"client-A",username:"client",role:"USER"});m.registration.mockResolvedValue(true);
 m.prepare.mockResolvedValue({username:"g_u_fixture@app.acc.voximplant.com",room:"gafus_fixture"});
 m.admission.mockResolvedValue({admission:"1800000090.SYNTHETIC_SIGNATURE",expires:1800000090});
 m.sign.mockResolvedValue("fixture-challenge-signature");
});
describe("AG1/AG2 G14 Vox Hono HTTP producer",()=>{
  it.each(["prepare","admission","sign"])("requires 401 Bearer before %s Core side effects",async action=>{
    const r=await app().request(base+action,{method:"POST",headers:action==="sign"?{"content-type":"application/json"}:undefined,
      ...(action==="sign"?{body:JSON.stringify({key:"valid-challenge"})}:{})});
    expect(r.status).toBe(401);
    expect(m.prepare).not.toHaveBeenCalled();
    expect(m.admission).not.toHaveBeenCalled();
    expect(m.sign).not.toHaveBeenCalled();
  });
  it("POST prepare 200 returns scoped SDK username+room, no long-lived credential",async()=>{
    const r=await req("prepare");expect(r.status).toBe(200);privateNoStore(r);
    const payload=await r.json();expect(payload).toEqual({success:true,data:{username:"g_u_fixture@app.acc.voximplant.com",room:"gafus_fixture"}});
    expect(JSON.stringify(payload)).not.toMatch(/password|privateKey|VOXIMPLANT_CREDENTIAL_SECRET/);
    expect(m.prepare).toHaveBeenCalledWith("booking-A","client-A");
  });
  it("POST admission 200 returns exactly ephemeral admission+expires",async()=>{
    const r=await req("admission");expect(r.status).toBe(200);privateNoStore(r);
    expect(await r.json()).toEqual({success:true,data:{admission:"1800000090.SYNTHETIC_SIGNATURE",expires:1800000090}});
    expect(m.admission).toHaveBeenCalledWith("booking-A","client-A");
  });
  it("POST sign 200 returns top-level token not data.token; does not echo key",async()=>{
    const r=await req("sign",{key:"challenge-12345"});expect(r.status).toBe(200);privateNoStore(r);
    expect(await r.json()).toEqual({success:true,token:"fixture-challenge-signature"});
    expect(m.sign).toHaveBeenCalledWith("booking-A","client-A","challenge-12345");
  });
  it.each(["","short","x".repeat(513)])("invalid sign challenge (%s) returns 400 before signing",async key=>{
    const r=await req("sign",{key});expect(r.status).toBe(400);privateNoStore(r);expect(m.sign).not.toHaveBeenCalled();
  });
  it("non-JSON sign request is rejected by Zod before Core",async()=>{
    const r=await req("sign");expect(r.status).toBe(400);privateNoStore(r);expect(m.sign).not.toHaveBeenCalled();
  });
  it.each(["prepare","admission","sign"])("Core foreign owner rejects %s 403 with stable code",async action=>{
    const fn=action==="prepare"?m.prepare:action==="admission"?m.admission:m.sign;
    fn.mockRejectedValueOnce(new ConsultationForbiddenError());
    const r=await req(action,action==="sign"?{key:"valid-challenge"}:undefined);
    expect(r.status).toBe(403);privateNoStore(r);
    expect(await r.json()).toMatchObject({success:false,code:"CONSULTATION_FORBIDDEN"});
  });
  it("Core missing booking returns 404 and no room leakage",async()=>{
    m.prepare.mockRejectedValueOnce(new ConsultationNotFoundError("Консультация"));
    const r=await req("prepare");expect(r.status).toBe(404);privateNoStore(r);
    expect(await r.json()).toMatchObject({success:false,code:"CONSULTATION_NOT_FOUND"});
  });
  it("provider/config unavailable maps to 503 and never exposes secret",async()=>{
    m.admission.mockRejectedValueOnce(new ConsultationVideoUnavailableError());
    const r=await req("admission");expect(r.status).toBe(503);privateNoStore(r);
    expect(await r.json()).toMatchObject({success:false,code:"CONSULTATION_VIDEO_UNAVAILABLE"});
  });
  it("unexpected Vox Core error returns sanitized 500",async()=>{
    m.sign.mockRejectedValueOnce(new Error("SYNTHETIC_INTERNAL_SECRET"));
    const r=await req("sign",{key:"valid-challenge"});expect(r.status).toBe(500);privateNoStore(r);
    expect(await r.text()).not.toContain("SYNTHETIC_INTERNAL_SECRET");
  });
});
