// @vitest-environment jsdom
import{afterEach,describe,expect,it,vi}from"vitest";
import{prepareBrowserPhotoWebp}from"./browserPhotoWebp";
const original=new File([new Uint8Array(200)],"dog.jpg",{type:"image/jpeg"});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe("browser-only WebP encoder",()=>{
  it("encodes 360/720/1440 WebP at quality 0.8, preserving aspect and original file",async()=>{
    const close=vi.fn();
    vi.stubGlobal("createImageBitmap",vi.fn(async()=>({width:4032,height:3024,close})));
    const sizes:number[][]=[];
    const originalCreate=document.createElement.bind(document);
    vi.spyOn(document,"createElement").mockImplementation((tag,...args)=>{
      const node=originalCreate(tag,...args);
      if(tag==="canvas"){
        const canvas=node as HTMLCanvasElement;
        vi.spyOn(canvas,"getContext").mockReturnValue({drawImage:()=>sizes.push([canvas.width,canvas.height])} as never);
        vi.spyOn(canvas,"toBlob").mockImplementation((cb,type,quality)=>{
          expect(type).toBe("image/webp");expect(quality).toBe(0.8);
          cb(new Blob([new Uint8Array(100)],{type:"image/webp"}));
        });
      }
      return node;
    });
    const result=await prepareBrowserPhotoWebp(original,{small:360,medium:720,large:1440});
    expect(sizes).toEqual([[360,270],[720,540],[1440,1080]]);
    expect(result.large.file.type).toBe("image/webp");
    expect(result.small.file.size).toBe(100);
    expect(original.type).toBe("image/jpeg");
    expect(close).toHaveBeenCalledOnce();
  });
  it("does not upscale tiny files",async()=>{
    vi.stubGlobal("createImageBitmap",vi.fn(async()=>({width:120,height:90,close:vi.fn()})));
    const sizes:number[][]=[];
    const create=document.createElement.bind(document);
    vi.spyOn(document,"createElement").mockImplementation((tag,...args)=>{
      const node=create(tag,...args);
      if(tag==="canvas"){
        const canvas=node as HTMLCanvasElement;
        vi.spyOn(canvas,"getContext").mockReturnValue({drawImage:()=>sizes.push([canvas.width,canvas.height])} as never);
        vi.spyOn(canvas,"toBlob").mockImplementation(cb=>cb(new Blob(["x"],{type:"image/webp"})));
      }
      return node;
    });
    await prepareBrowserPhotoWebp(original,{large:1440});
    expect(sizes).toEqual([[120,90]]);
  });
  it("fails closed when WebP codec is missing or image decode fails",async()=>{
    vi.stubGlobal("createImageBitmap",vi.fn(async()=>{throw Error("bad decoder");}));
    await expect(prepareBrowserPhotoWebp(original,{small:360})).rejects.toThrow("прочитать");
  });
});
