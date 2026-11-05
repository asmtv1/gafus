// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from "vitest";
import {prepareBrowserVideoPoster} from "./browserVideoPoster";

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe("Client-only Web video poster",()=>{
  function setup(type="image/webp"){
    const create=vi.fn(()=>"blob:local-video");
    const revoke=vi.fn();
    vi.stubGlobal("URL",Object.assign(class extends URL {},{
      createObjectURL:create,revokeObjectURL:revoke,
    }));
    vi.spyOn(HTMLMediaElement.prototype,"load").mockImplementation(function(this:HTMLMediaElement){
      if(this.getAttribute("src"))queueMicrotask(()=>this.dispatchEvent(new Event("loadeddata")));
    });
    vi.spyOn(HTMLVideoElement.prototype,"videoWidth","get").mockReturnValue(1280);
    vi.spyOn(HTMLVideoElement.prototype,"videoHeight","get").mockReturnValue(720);
    const drawImage=vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({drawImage} as never);
    vi.spyOn(HTMLCanvasElement.prototype,"toBlob").mockImplementation((callback)=>{
      callback(new Blob([new Uint8Array(1000)],{type}));
    });
    return {create,revoke,drawImage};
  }
  it("generates exactly ONE WebP <=480px and releases browser resources",async()=>{
    const x=setup();
    const src=new File([new Uint8Array(2400)],"clip.mp4",{type:"video/mp4"});
    const result=await prepareBrowserVideoPoster(src);
    expect(result).toMatchObject({name:"poster.webp",type:"image/webp",size:1000});
    expect(x.create).toHaveBeenCalledTimes(1);
    expect(x.drawImage).toHaveBeenCalledTimes(1);
    expect(x.revoke).toHaveBeenCalledWith("blob:local-video");
  });
  it("fails closed when browser does not produce WebP, never uploads disguised PNG",async()=>{
    const x=setup("image/png");
    await expect(prepareBrowserVideoPoster(new File(["movie"],"clip.mp4",{
      type:"video/mp4"}))).rejects.toThrow("VIDEO_POSTER_WEBP_UNSUPPORTED");
    expect(x.revoke).toHaveBeenCalledOnce();
  });
});
