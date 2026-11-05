import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({convert:vi.fn(),frame:vi.fn(),deleted:vi.fn()}));
vi.mock("expo-file-system",()=>({File:class {
  uri:string;exists=true;size=800;
  constructor(uri:string){this.uri=uri;}
  delete(){mocks.deleted(this.uri);}
}}));
vi.mock("expo-image-manipulator",()=>({manipulateAsync:mocks.convert,
  SaveFormat:{WEBP:"webp"}}));
vi.mock("./makeVideoPoster",()=>({makeFeedVideoPoster:mocks.frame}));
import {prepareVideoPosterWebp} from "./prepareVideoPosterWebp";
beforeEach(()=>{
  Object.values(mocks).forEach(mock=>mock.mockReset());
  mocks.convert.mockResolvedValue({uri:"file:///poster.webp",width:480,height:270});
  mocks.frame.mockResolvedValue("file:///local-preview.jpg");
});
describe("Mobile one poster for 720p and 360p",()=>{
  it("reuses the Moments picker thumbnail without opening another video player",async()=>{
    const out=await prepareVideoPosterWebp("file:///movie.mp4","file:///preview.jpg");
    expect(out).toMatchObject({uri:"file:///poster.webp",mime:"image/webp",
      width:480,height:270,bytes:800});
    expect(mocks.frame).not.toHaveBeenCalled();
    expect(mocks.convert).toHaveBeenCalledWith("file:///preview.jpg",[],{
      format:"webp",compress:0.8});
    out.dispose();
    expect(mocks.deleted).toHaveBeenCalledExactlyOnceWith("file:///poster.webp");
  });
  it("extracts just one frame for Chat2, then converts it once",async()=>{
    await prepareVideoPosterWebp("file:///movie.mp4");
    expect(mocks.frame).toHaveBeenCalledExactlyOnceWith("file:///movie.mp4");
    expect(mocks.convert).toHaveBeenCalledOnce();
  });
  it("fails without uploading anything if client frame extraction failed",async()=>{
    mocks.frame.mockResolvedValueOnce(undefined);
    await expect(prepareVideoPosterWebp("file:///bad.mov"))
      .rejects.toThrow("VIDEO_POSTER_FRAME_UNAVAILABLE");
    expect(mocks.convert).not.toHaveBeenCalled();
  });
});
