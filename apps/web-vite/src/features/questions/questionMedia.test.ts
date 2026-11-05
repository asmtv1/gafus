// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../shared/media/browserPhotoWebp",()=>({
  prepareBrowserPhotoWebp:vi.fn(async()=>({
    small:{file:new File([new Uint8Array(120)],"small.webp",{type:"image/webp"}),width:360,height:270},
    medium:{file:new File([new Uint8Array(240)],"medium.webp",{type:"image/webp"}),width:1440,height:1080},
  })),
}));
import { discardUnusedQuestionPhoto, uploadQuestionPhoto, validateQuestionFiles } from "./questionMedia";
import { prepareBrowserPhotoWebp } from "../../shared/media/browserPhotoWebp";
function photo(data:number[],name="dog.jpg",mime="image/jpeg"){
  return new File([new Uint8Array(data)],name,{type:mime});
}
function response(data:unknown,status=200){
  return new Response(JSON.stringify({success:status<400,data,error:"Core reports a storage error"}),{status});
}
const s3="https://s3.cloud.ru/gafus-questions-public";
function grant(id="photo-1"){
  return {id,upload:{method:"POST",url:s3,fields:{key:"incoming/medium.webp"}},
    smallUpload:{method:"POST",url:s3,fields:{key:"incoming/small.webp"}}};
}
function fakeDirectStorageUpload(failed=false){
  const calls:{method:string;url:string;withCredentials:boolean;form:FormData}[]=[];
  class FakeXHR{
    status=failed?403:204;
    upload={onprogress:null as ((event:ProgressEvent)=>void)|null};
    onload:(()=>void)|null=null;
    onerror:(()=>void)|null=null;
    onabort:(()=>void)|null=null;
    ontimeout:(()=>void)|null=null;
    withCredentials=false;
    timeout=0;
    private method="";
    private url="";
    open(method:string,url:string){this.method=method;this.url=url;}
    send(body:FormData){
      calls.push({method:this.method,url:this.url,withCredentials:this.withCredentials,form:body});
      queueMicrotask(()=>this.onload?.());
    }
    abort(){this.onabort?.();}
  }
  vi.stubGlobal("XMLHttpRequest",FakeXHR);
  return calls;
}
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
describe("Questions: browser-produced WebP and zero photo Jobs",()=>{
  it("reserves two final WebP variants, posts both direct to S3, then confirms READY",async()=>{
    const calls=fakeDirectStorageUpload();
    const fake=vi.fn().mockResolvedValueOnce(response(grant(),201))
      .mockResolvedValueOnce(response({id:"photo-1",status:"READY"}));
    vi.stubGlobal("fetch",fake);
    const progress:number[]=[];
    expect(await uploadQuestionPhoto(photo([255,216,255,0]),p=>progress.push(p))).toBe("photo-1");
    expect(fake.mock.calls.map(([uri])=>uri)).toEqual([
      "/api/v1/questions/photos/client-reservations",
      "/api/v1/questions/photos/photo-1/client-confirm",
    ]);
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({mediumBytes:240});
    expect(fake.mock.calls[0][1]).toMatchObject({method:"POST",credentials:"include"});
    expect(vi.mocked(prepareBrowserPhotoWebp)).toHaveBeenCalledWith(
      expect.any(File), {small:360,medium:1440});
    expect(calls).toHaveLength(2);
    expect(calls.map(c=>c.form.get("key"))).toEqual(["incoming/small.webp","incoming/medium.webp"]);
    for(const call of calls){
      expect(call.method).toBe("POST");
      expect(call.withCredentials).toBe(false);
      expect((call.form.get("file") as File).type).toBe("image/webp");
    }
    expect(progress.at(-1)).toBe(100);
  });
  it("rejects invalid input before creating server media",()=>{
    const invalid=photo([1],"bad.gif","image/gif");
    expect(()=>validateQuestionFiles([invalid],0)).toThrow("JPG");
    expect(()=>validateQuestionFiles([],0)).toThrow("не более 5");
    expect(()=>validateQuestionFiles([photo([1]),photo([1])],4)).toThrow("не более 5");
    expect(()=>validateQuestionFiles([photo([])],0)).toThrow("10 МБ");
  });
  it("rejects forged reservation ID before posting any S3 bytes",async()=>{
    const calls=fakeDirectStorageUpload();
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response(grant("../escape"),201)));
    await expect(uploadQuestionPhoto(photo([255,216,255]))).rejects.toThrow("резервирование");
    expect(calls).toHaveLength(0);
  });
  it("does not publish photo when S3 rejects either variant and asks Core to discard",async()=>{
    const calls=fakeDirectStorageUpload(true);
    const fake=vi.fn().mockResolvedValueOnce(response(grant(),201))
      .mockResolvedValueOnce(response({id:"photo-1"}));
    vi.stubGlobal("fetch",fake);
    await expect(uploadQuestionPhoto(photo([1,2,3]))).rejects.toThrow("S3 отклонил");
    expect(calls).toHaveLength(2);
    expect(fake.mock.calls.map(([uri])=>uri)).toEqual([
      "/api/v1/questions/photos/client-reservations", "/api/v1/questions/photos/photo-1",
    ]);
    expect(fake.mock.calls[1][1]?.method).toBe("DELETE");
  });
  it("propagates Core failures and does not upload to S3",async()=>{
    const calls=fakeDirectStorageUpload();
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response(null,413)));
    await expect(uploadQuestionPhoto(photo([1,2,3]))).rejects.toMatchObject({status:413});
    expect(calls).toHaveLength(0);
  });
  it("requires a correct READY confirmation; never accepts QUEUED",async()=>{
    fakeDirectStorageUpload();
    const fake=vi.fn().mockResolvedValueOnce(response(grant(),201))
      .mockResolvedValueOnce(response({id:"photo-1",status:"QUEUED"}))
      .mockResolvedValueOnce(response({id:"photo-1"}));
    vi.stubGlobal("fetch",fake);
    await expect(uploadQuestionPhoto(photo([1,2,3]))).rejects.toThrow("готовую фотографию");
    expect(fake.mock.calls[1][0]).toBe("/api/v1/questions/photos/photo-1/client-confirm");
    expect(fake.mock.calls[2][1].method).toBe("DELETE");
  });
  it("only discards owner photos with a verified server acknowledgement",async()=>{
    const fake=vi.fn().mockResolvedValueOnce(response({id:"different"}))
      .mockResolvedValueOnce(response({id:"photo-1"}));
    vi.stubGlobal("fetch",fake);
    await expect(discardUnusedQuestionPhoto("../secret")).rejects.toThrow("Некорректная");
    expect(fake).not.toHaveBeenCalled();
    await expect(discardUnusedQuestionPhoto("photo-1")).rejects.toThrow("не подтвердил");
    await expect(discardUnusedQuestionPhoto("photo-1")).resolves.toBeUndefined();
    expect(fake.mock.calls[1][0]).toBe("/api/v1/questions/photos/photo-1");
  });
});
