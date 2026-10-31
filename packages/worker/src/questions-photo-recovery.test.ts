import { afterEach,describe,expect,it,vi } from "vitest";
import { createHash,createHmac } from "node:crypto";
import { createQuestionsPhotoRecoveryTick, questionsPhotoCleanupInternal } from "./questions-photo-recovery";

afterEach(()=>vi.unstubAllGlobals());
function recovery(count:number,active=0){
  const cleanup=vi.fn(async()=>({cleaned:false}));
  const dispatch=vi.fn(async()=>({dispatched:1}));
  const database={questionV2MediaTask:{count:vi.fn(async(args:{where:{status?:string}})=>
    args.where.status==="PROCESSING"?active:count)}};
  const tick=createQuestionsPhotoRecoveryTick({
    database:database as never,
    dispatch:dispatch as never,cleanup,
    now:()=>new Date("2026-10-28T12:00:00.000Z"),
  });
  return {tick,cleanup,dispatch,database};
}
describe("Questions-only durable PostgreSQL recovery",()=>{
  it("cleans orphaned storage without launching empty Cloud Jobs",async()=>{
    const t=recovery(0);
    await expect(t.tick()).resolves.toEqual({dispatched:0});
    expect(t.cleanup).toHaveBeenCalledOnce();
    expect(t.dispatch).not.toHaveBeenCalled();
  });
  it("launches at most two jobs for durable due images, not fixed empty jobs",async()=>{
    const t=recovery(6);
    await expect(t.tick()).resolves.toEqual({dispatched:2});
    expect(t.dispatch).toHaveBeenCalledTimes(2);
    expect(t.database.questionV2MediaTask.count).toHaveBeenCalledWith({
      where:{attempts:{lt:4},OR:[
        {status:"QUEUED",nextAttemptAt:{lte:new Date("2026-10-28T12:00:00.000Z")}},
        {status:"PROCESSING",leaseUntil:{lt:new Date("2026-10-28T12:00:00.000Z")}},
      ]},
    });
  });
  it("does not launch when both PG photo leases are occupied",async()=>{
    const t=recovery(5,2);
    await expect(t.tick()).resolves.toEqual({dispatched:0});
    expect(t.dispatch).not.toHaveBeenCalled();
  });
  it("launches only one when one of two leases is occupied",async()=>{
    const t=recovery(5,1);
    await expect(t.tick()).resolves.toEqual({dispatched:1});
    expect(t.dispatch).toHaveBeenCalledOnce();
  });
  it("does not hide a Cloud launch failure, so next cron retries from PostgreSQL",async()=>{
    const t=recovery(1);
    t.dispatch.mockRejectedValueOnce(new Error("CLOUD_UNAVAILABLE"));
    await expect(t.tick()).rejects.toThrow("CLOUD_UNAVAILABLE");
    await expect(t.tick()).resolves.toEqual({dispatched:1});
    expect(t.cleanup).toHaveBeenCalledTimes(2);
  });
});
describe("Questions-only recovery cleanup signature",()=>{
  it("rejects verified-looking production app subdomains before network access",async()=>{
    const names=["QUESTIONS_V2_INTERNAL_BASE_URL","QUESTIONS_V2_INTERNAL_HMAC_SECRET",
      "QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED","QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME"] as const;
    const initial=Object.fromEntries(names.map(name=>[name,process.env[name]]));
    const request=vi.fn();
    vi.stubGlobal("fetch",request);
    try{
      process.env.QUESTIONS_V2_INTERNAL_HMAC_SECRET="isolated-questions-secret-longer-than-32-bytes";
      process.env.QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED="true";
      for(const domain of ["dev-questions.gafus.app","dev-questions.gafus.ru",
        "api.gafus.app","api.gafus.ru"]){
        process.env.QUESTIONS_V2_INTERNAL_BASE_URL="https://"+domain+"/";
        process.env.QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME=domain;
        await expect(questionsPhotoCleanupInternal()).rejects.toThrow("UNSAFE_ORIGIN");
      }
      expect(request).not.toHaveBeenCalled();
    }finally{
      for(const name of names){
        if(initial[name]===undefined)delete process.env[name];
        else process.env[name]=initial[name];
      }
    }
  });
  it("allows only exact production HMAC API when production flags and host match",async()=>{
    const keys=["NODE_ENV","GAFUS_LOCAL_ISOLATED_API","QUESTIONS_V2_INTERNAL_BASE_URL",
      "QUESTIONS_V2_INTERNAL_HMAC_SECRET","QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED",
      "QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME"] as const;
    const original=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
    const request=vi.fn(async(_url:string,_init:RequestInit)=>
      new Response(JSON.stringify({cleaned:false}),{status:200}));
    vi.stubGlobal("fetch",request);
    try{
      process.env.NODE_ENV="production";
      delete process.env.GAFUS_LOCAL_ISOLATED_API;
      process.env.QUESTIONS_V2_INTERNAL_BASE_URL="https://api.gafus.ru/";
      process.env.QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME="api.gafus.ru";
      process.env.QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED="true";
      process.env.QUESTIONS_V2_INTERNAL_HMAC_SECRET="production-only-synthetic-hmac-with-32-plus-bytes";
      await expect(questionsPhotoCleanupInternal()).resolves.toBeUndefined();
      expect(request).toHaveBeenCalledOnce();
      expect(request.mock.calls[0]?.[0]).toBe("https://api.gafus.ru/internal/questions/media/jobs/cleanup");
      request.mockClear();
      for(const invalid of ["https://admin.gafus.ru/","https://api.gafus.app/",
        "http://api.gafus.ru/","https://api.gafus.ru:444/",
        "https://api.gafus.ru/other/","https://api.gafus.ru/?debug=1"]){
        process.env.QUESTIONS_V2_INTERNAL_BASE_URL=invalid;
        await expect(questionsPhotoCleanupInternal()).rejects.toThrow("UNSAFE_ORIGIN");
      }
      expect(request).not.toHaveBeenCalled();
      process.env.QUESTIONS_V2_INTERNAL_BASE_URL="https://api.gafus.ru/";
      process.env.GAFUS_LOCAL_ISOLATED_API="1";
      await expect(questionsPhotoCleanupInternal()).rejects.toThrow("UNSAFE_ORIGIN");
      delete process.env.GAFUS_LOCAL_ISOLATED_API;
      process.env.QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED="false";
      await expect(questionsPhotoCleanupInternal()).rejects.toThrow("UNSAFE_ORIGIN");
    }finally{
      for(const key of keys){
        if(original[key]===undefined)delete process.env[key];
        else process.env[key]=original[key];
      }
    }
  });
  it("uses the exact HMAC verifier contract without sending S3 keys",async()=>{
    const initial={...process.env};
    const secret="local-only-test-secret-length-over-32";
    process.env.QUESTIONS_V2_INTERNAL_BASE_URL="http://127.0.0.1:3001/";
    process.env.QUESTIONS_V2_INTERNAL_HMAC_SECRET=secret;
    process.env.GAFUS_LOCAL_ISOLATED_API="1";
    const request=vi.fn(async(url:string,opts:RequestInit)=>{
      expect(url).toBe("http://127.0.0.1:3001/internal/questions/media/jobs/cleanup");
      const body=String(opts.body);
      expect(JSON.parse(body)).toEqual({batchSize:1});
      const headers=opts.headers as Record<string,string>;
      const digest=createHash("sha256").update(body).digest("hex");
      const signature=createHmac("sha256",secret).update([
        "POST","/internal/questions/media/jobs/cleanup",
        headers["x-questions-timestamp"],headers["x-questions-nonce"],digest,
      ].join("\n")).digest("hex");
      expect(headers["x-questions-signature"]).toBe(signature);
      return new Response(JSON.stringify({cleaned:true}),{status:200});
    });
    vi.stubGlobal("fetch",request);
    try{
      await expect(questionsPhotoCleanupInternal()).resolves.toBeUndefined();
      expect(request).toHaveBeenCalledOnce();
    }finally{
      for(const name of ["QUESTIONS_V2_INTERNAL_BASE_URL",
        "QUESTIONS_V2_INTERNAL_HMAC_SECRET","GAFUS_LOCAL_ISOLATED_API"]){
        if(initial[name]===undefined)delete process.env[name];
        else process.env[name]=initial[name];
      }
    }
  });
});
