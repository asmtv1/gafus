import {createHash,createHmac} from "node:crypto";
import {beforeEach,afterEach,describe,expect,it,vi} from "vitest";
import {createQuestionsV2JobCore} from "./questions-v2-job-core";

const names=[
  "GAFUS_LOCAL_ISOLATED_API",
  "QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED",
  "QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME",
  "QUESTIONS_V2_JOB_ENABLED",
] as const;
const initial:Record<string,string|undefined>={};
const secret=Buffer.alloc(32,0x5f);
beforeEach(()=>{
  for(const name of names)initial[name]=process.env[name];
  delete process.env.QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED;
  delete process.env.QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME;
  delete process.env.QUESTIONS_V2_JOB_ENABLED;
  process.env.GAFUS_LOCAL_ISOLATED_API="1";
});
afterEach(()=>{
  for(const name of names){
    if(initial[name]===undefined)delete process.env[name];
    else process.env[name]=initial[name];
  }
});
describe("Questions Photo V2 one-shot Core transport",()=>{
  it("signs exact local claim over body SHA256, timestamp and nonce",async()=>{
    const fetcher=vi.fn(async(raw:URL|string|Request,init?:RequestInit)=>{
      expect(String(raw)).toBe("http://127.0.0.1:3001/internal/questions/media/jobs/claim");
      const body=String(init?.body);
      const headers=init?.headers as Record<string,string>;
      const sha=createHash("sha256").update(body).digest("hex");
      const expected=createHmac("sha256",secret).update([
        "POST","/internal/questions/media/jobs/claim",
        headers["x-questions-timestamp"],headers["x-questions-nonce"],sha,
      ].join("\n")).digest("hex");
      expect(headers["x-questions-signature"]).toBe(expected);
      expect(init?.redirect).toBe("error");
      return new Response(JSON.stringify({jobs:[]}),{
        status:200,headers:{"content-type":"application/json"},
      });
    });
    const core=createQuestionsV2JobCore({
      baseUrl:"http://127.0.0.1:3001/",secret,fetcher:fetcher as typeof fetch,
      now:()=>Date.parse("2026-10-28T10:00:00Z"),
    });
    await expect(core.claimOne()).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("rejects production endpoints, foreign HTTPS and unauthorized loopback",()=>{
    const open=(baseUrl:string)=>createQuestionsV2JobCore({baseUrl,secret});
    expect(()=>open("http://127.0.0.1:3002/")).toThrow("UNSAFE_ORIGIN");
    process.env.GAFUS_LOCAL_ISOLATED_API="0";
    expect(()=>open("http://127.0.0.1:3001/")).toThrow("UNSAFE_ORIGIN");
    expect(()=>open("https://dev-questions.example/")).toThrow("UNSAFE_ORIGIN");
    process.env.QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED="true";
    process.env.QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME="api.gafus.ru";
    expect(()=>open("https://api.gafus.ru/")).toThrow("UNSAFE_ORIGIN");
    process.env.QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME="dev-questions.gafus.app";
    expect(()=>open("https://dev-questions.gafus.app/")).toThrow("UNSAFE_ORIGIN");
    process.env.QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME="dev-questions.gafus.ru";
    expect(()=>open("https://dev-questions.gafus.ru/")).toThrow("UNSAFE_ORIGIN");
    process.env.QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME="dev-questions.example";
    expect(()=>open("https://dev-questions.example/")).not.toThrow();
    expect(()=>open("https://unknown.example/")).toThrow("UNSAFE_ORIGIN");
    expect(()=>open("https://dev-questions.example/not-root")).toThrow("UNSAFE_ORIGIN");
  });
  it("accepts exact production API only for activated Questions V2 Job and preserves signed HMAC",async()=>{
    const request=vi.fn(async(raw:URL|string|Request,init?:RequestInit)=>{
      expect(String(raw)).toBe("https://api.gafus.ru/internal/questions/media/jobs/claim");
      const body=String(init?.body);
      const headers=init?.headers as Record<string,string>;
      const sha=createHash("sha256").update(body).digest("hex");
      const expected=createHmac("sha256",secret).update([
        "POST","/internal/questions/media/jobs/claim",
        headers["x-questions-timestamp"],headers["x-questions-nonce"],sha,
      ].join("\n")).digest("hex");
      expect(headers["x-questions-signature"]).toBe(expected);
      return new Response(JSON.stringify({jobs:[]}),{status:200});
    });
    process.env.GAFUS_LOCAL_ISOLATED_API="0";
    process.env.QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED="true";
    process.env.QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME="api.gafus.ru";
    const open=(baseUrl:string)=>createQuestionsV2JobCore({baseUrl,secret,
      fetcher:request as typeof fetch});
    expect(()=>open("https://api.gafus.ru/")).toThrow("UNSAFE_ORIGIN");
    process.env.QUESTIONS_V2_JOB_ENABLED="true";
    await expect(open("https://api.gafus.ru/").claimOne()).resolves.toBeNull();
    expect(request).toHaveBeenCalledOnce();
    for(const raw of ["https://gafus.ru/","http://api.gafus.ru/",
      "https://admin.gafus.ru/","https://api.gafus.app/",
      "https://api.gafus.ru:1234/","https://api.gafus.ru/private",
      "https://api.gafus.ru/?token=1","https://api.gafus.ru/#fragment"])
      expect(()=>open(raw)).toThrow("UNSAFE_ORIGIN");
    process.env.QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED="false";
    expect(()=>open("https://api.gafus.ru/")).toThrow("UNSAFE_ORIGIN");
    process.env.QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED="true";
    process.env.QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME="unknown.example";
    expect(()=>open("https://api.gafus.ru/")).toThrow("UNSAFE_ORIGIN");
  });
  it("rejects malformed Core JSON and oversized responses",async()=>{
    const oversized=vi.fn(async()=>new Response("x".repeat(65*1024),{status:200}));
    const core=createQuestionsV2JobCore({
      baseUrl:"http://127.0.0.1:3001/",secret,fetcher:oversized as typeof fetch,
    });
    await expect(core.claimOne()).rejects.toThrow("RESPONSE_OVERSIZE");
    const bad=createQuestionsV2JobCore({
      baseUrl:"http://127.0.0.1:3001/",secret,
      fetcher:vi.fn(async()=>new Response(JSON.stringify({jobs:[1,2]}),{status:200})) as typeof fetch,
    });
    await expect(bad.claimOne()).rejects.toThrow("INVALID_CLAIM");
  });
});
