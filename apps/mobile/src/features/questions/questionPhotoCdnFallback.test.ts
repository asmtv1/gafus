import {describe,expect,it,vi} from "vitest";
import {allowQuestionsS3Fallback} from "./questionPhotoCdnFallback";
const key="questions/uploads/questions/v2/owner-1/01234567-89ab-4def-8123-456789abcdef/v1/image/s.webp";
const cdn="https://ebiteskukingusk.begetcdn.cloud/"+key;
const s3="https://gafus-questions-public.s3.cloud.ru/"+key;
describe("Questions Photo V2 CDN -> S3 fallback gate",()=>{
  it.each([410,500,503,599])("permits exact public S3 only after CDN HEAD HTTP %i",async status=>{
    const head=vi.fn(async(_url:string,_init?:RequestInit)=>new Response(null,{status}));
    await expect(allowQuestionsS3Fallback(cdn,s3,head as typeof fetch)).resolves.toBe(true);
    expect(head).toHaveBeenCalledOnce();
    expect(head.mock.calls[0]?.[0]).toBe(cdn);
    expect(head.mock.calls[0]?.[1]).toMatchObject({method:"HEAD",credentials:"omit",redirect:"error"});
  });
  it.each([200,301,400,401,403,404,429])("never bypasses CDN HTTP %i",async status=>{
    const head=vi.fn(async(_url:string,_init?:RequestInit)=>new Response(null,{status}));
    await expect(allowQuestionsS3Fallback(cdn,s3,head as typeof fetch)).resolves.toBe(false);
    expect(head).toHaveBeenCalledOnce();
  });
  it("allows native-only DNS/network failures but never a CDN 403/404",async()=>{
    const refused=vi.fn(async()=>{throw new TypeError("getaddrinfo ENOTFOUND");});
    await expect(allowQuestionsS3Fallback(cdn,s3,refused as typeof fetch,true)).resolves.toBe(true);
    await expect(allowQuestionsS3Fallback(cdn,s3,refused as typeof fetch)).resolves.toBe(false);
    for(const status of [403,404]) {
      const denied=vi.fn(async()=>new Response(null,{status}));
      await expect(allowQuestionsS3Fallback(cdn,s3,denied as typeof fetch,true)).resolves.toBe(false);
    }
  });
  it("denies network failures and mismatched/malicious S3 fallback URLs",async()=>{
    const failed=vi.fn(async()=>{throw Error("CORS_DENIED");});
    await expect(allowQuestionsS3Fallback(cdn,s3,failed as typeof fetch)).resolves.toBe(false);
    const req=vi.fn(async()=>new Response(null,{status:503}));
    for(const invalid of [
      s3.replace("/s.webp","/m.webp"),
      "https://gafus-questions-public.s3.cloud.ru/questions/v2/owner/source.jpg",
      "https://attacker.example/"+key,
      s3+"?x=1",
    ]) await expect(allowQuestionsS3Fallback(cdn,invalid,req as typeof fetch)).resolves.toBe(false);
    for(const invalid of [
      cdn.replace("https:","http:"),
      cdn.replace(".begetcdn.cloud",".example"),
      cdn+"?signature=unexpected",
    ]) await expect(allowQuestionsS3Fallback(invalid,s3,req as typeof fetch)).resolves.toBe(false);
    expect(req).not.toHaveBeenCalled();
  });
});
