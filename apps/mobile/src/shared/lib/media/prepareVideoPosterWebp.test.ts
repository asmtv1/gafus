import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({
  convert:vi.fn(),frame:vi.fn(),deleted:vi.fn(),
  bytes:vi.fn(),write:vi.fn(),
}));
vi.mock("expo-file-system",()=>({File:class {
  uri:string;exists=true;size=800;
  constructor(uri:string){this.uri=uri;}
  delete(){mocks.deleted(this.uri);}
  bytes(){return mocks.bytes(this.uri);}
  write(bytes:Uint8Array){mocks.write(this.uri,bytes);}
}}));
vi.mock("expo-image-manipulator",()=>({manipulateAsync:mocks.convert,
  SaveFormat:{WEBP:"webp"}}));
vi.mock("./makeVideoPoster",()=>({makeFeedVideoPoster:mocks.frame}));
import {prepareVideoPosterWebp} from "./prepareVideoPosterWebp";
beforeEach(()=>{
  Object.values(mocks).forEach(mock=>mock.mockReset());
  mocks.convert.mockResolvedValue({uri:"file:///poster.webp",width:480,height:270});
  mocks.frame.mockResolvedValue("file:///local-preview.jpg");
  mocks.bytes.mockResolvedValue(new Uint8Array([
    82,73,70,70, 22,0,0,0, 87,69,66,80, // RIFF WEBP (30 bytes)
    86,80,56,32, 10,0,0,0, 0,0,0,0,0,0,0,0,0,0, // VP8X
  ]));
});
describe("Mobile one poster for 720p and 360p",()=>{
  it("reuses the Moments picker thumbnail without opening another video player",async()=>{
    const out=await prepareVideoPosterWebp("file:///movie.mp4","file:///preview.jpg");
    expect(out).toMatchObject({uri:"file:///poster.webp",mime:"image/webp",
      width:480,height:270,bytes:800});
    expect(mocks.frame).not.toHaveBeenCalled();
    expect(mocks.convert).toHaveBeenCalledWith("file:///preview.jpg",[{resize:{width:480}}],{
      format:"webp",compress:0.8});
    out.dispose();
    expect(mocks.deleted).toHaveBeenCalledExactlyOnceWith("file:///poster.webp");
  });
  it("cleans an ICC-bearing Android WebP before upload to S3",async()=>{
    mocks.bytes.mockResolvedValueOnce(new Uint8Array([
      82,73,70,70, 48,0,0,0, 87,69,66,80,
      86,80,56,88, 10,0,0,0, 32,0,0,0,0,0,0,0,0,0, // VP8X with ICC
      73,67,67,80, 3,0,0,0, 9,8,7,0, // ICCP odd payload
      86,80,56,32, 6,0,0,0, 1,2,3,4,5,6, // pixel payload
    ]));
    const result=await prepareVideoPosterWebp("file:///movie.mp4","file:///preview.jpg");
    expect(result.uri).toBe("file:///poster.webp");
    expect(mocks.write).toHaveBeenCalledOnce();
    const [path, bytes]=mocks.write.mock.calls[0]!;
    expect(path).toBe("file:///poster.webp");
    expect([...bytes].some((_,i)=>String.fromCharCode(...bytes.slice(i,i+4))==="ICCP")).toBe(false);
    expect(bytes[20]).toBe(0);
  });
  it("extracts just one frame for Chat2, then converts it once",async()=>{
    await prepareVideoPosterWebp("file:///movie.mp4");
    expect(mocks.frame).toHaveBeenCalledExactlyOnceWith("file:///movie.mp4");
    expect(mocks.convert).toHaveBeenCalledOnce();
  });
  it("shrinks oversized portrait posters rather than rejecting the video",async()=>{
    mocks.convert.mockResolvedValueOnce({uri:"file:///large.webp",width:480,height:1040})
      .mockResolvedValueOnce({uri:"file:///small.webp",width:222,height:480});
    const out=await prepareVideoPosterWebp("file:///movie.mp4","file:///preview.jpg");
    expect(out).toMatchObject({uri:"file:///small.webp",width:222,height:480});
    expect(mocks.convert).toHaveBeenNthCalledWith(2,"file:///large.webp",
      [{resize:{height:480}}],{format:"webp",compress:0.8});
  });
  it("converts native image-manipulator exceptions into actionable poster errors",async()=>{
    mocks.convert.mockRejectedValueOnce(Error("NativeSharedObjectNotFoundException"));
    await expect(prepareVideoPosterWebp("file:///movie.mp4","file:///preview.jpg"))
      .rejects.toThrow("VIDEO_POSTER_WEBP_FAILED");
  });
  it("fails without uploading anything if client frame extraction failed",async()=>{
    mocks.frame.mockResolvedValueOnce(undefined);
    await expect(prepareVideoPosterWebp("file:///bad.mov"))
      .rejects.toThrow("VIDEO_POSTER_FRAME_UNAVAILABLE");
    expect(mocks.convert).not.toHaveBeenCalled();
  });
});
