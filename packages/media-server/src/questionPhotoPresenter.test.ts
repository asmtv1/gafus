import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({
  sign:vi.fn(), task:vi.fn(), delivery:vi.fn(), signedRead:vi.fn(),
}));
vi.mock("@gafus/cdn-upload",()=>({
  parsePrivateMediaLocation:(url:string)=>url.startsWith("cloudru:")?{kind:"questions",key:"private"}:null,
  signPrivateUserMedia:mocks.sign,
  questionsV2IsMarker:(value:string)=>value.startsWith("questions-v2:"),
  questionsV2SignedRead:mocks.signedRead,
  questionsV2Marker:(key:string)=>`questions-v2:${key}`,
  questionsV2Delivery:mocks.delivery,
}));
vi.mock("./questionPhotoTaskRead",()=>({readQuestionPhotoMediaTask:mocks.task}));
import {presentQuestionPhoto} from "./questionPhotoPresenter";
describe("legacy question photo provider isolation",()=>{
  beforeEach(()=>vi.resetAllMocks());
  it("preserves discussion reads without exposing a mismatched private locator",async()=>{
    mocks.sign.mockRejectedValue(new Error("PRIVATE_MEDIA_PROVIDER_MISMATCH"));
    expect(await presentQuestionPhoto({id:"photo",url:"cloudru:questions:private"}))
      .toEqual({id:"photo",url:"",status:"UNAVAILABLE"});
  });
  it("keeps signed legacy photos readable",async()=>{
    mocks.sign.mockResolvedValue("https://storage.example/signed");
    expect(await presentQuestionPhoto({id:"photo",url:"cloudru:questions:private"}))
      .toEqual({id:"photo",url:"https://storage.example/signed"});
  });
  it("does not conceal unrelated storage failures",async()=>{
    mocks.sign.mockRejectedValue(new Error("PRIVATE_MEDIA_STORAGE_UNCONFIGURED"));
    await expect(presentQuestionPhoto({id:"photo",url:"cloudru:questions:private"}))
      .rejects.toThrow("PRIVATE_MEDIA_STORAGE_UNCONFIGURED");
  });
});


describe("Question V2 rendition read boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.task.mockResolvedValue(null);
  });
  it("does not render an empty or private marker without a READY manifest", async () => {
    expect(await presentQuestionPhoto({ id: "missing", url: "questions-v2:secret-object-key" }))
      .toBeNull();
    expect(mocks.delivery).not.toHaveBeenCalled();
    expect(mocks.signedRead).not.toHaveBeenCalled();
    expect(mocks.task).toHaveBeenCalledExactlyOnceWith("missing");
  });
  it("preserves a non-renderable pending status without signing or exposing source keys", async () => {
    mocks.task.mockResolvedValue({ status: "AWAITING_UPLOAD", manifest: null });
    expect(await presentQuestionPhoto({ id: "pending", url: "" }))
      .toEqual({ id: "pending", url: "", status: "AWAITING_UPLOAD" });
    expect(mocks.delivery).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("never fabricates a READY image for an empty locator", async () => {
    mocks.task.mockResolvedValue({ status: "READY", manifest: {} });
    expect(await presentQuestionPhoto({ id: "incomplete", url: "" })).toBeNull();
    expect(mocks.delivery).not.toHaveBeenCalled();
  });
  it("returns both signed WebP renditions with dimensions and provider fallback URLs", async () => {
    const manifest = { variants: {
      small: { key: "owner/mini.webp", width: 360, height: 640 },
      medium: { key: "owner/full.webp", width: 1080, height: 1920 },
    } };
    mocks.task.mockResolvedValue({ status: "READY", manifest });
    mocks.delivery.mockResolvedValueOnce({
      url: "https://cdn.example/medium?sig=one", fallbackUrl: "https://object.example/medium?sig=one",
    }).mockResolvedValueOnce({
      url: "https://cdn.example/small?sig=two", fallbackUrl: "https://object.example/small?sig=two",
    });
    expect(await presentQuestionPhoto({ id: "ready", url: "questions-v2:owner/full.webp" }))
      .toEqual({
        id: "ready", status: "READY",
        url: "https://cdn.example/medium?sig=one", smallUrl: "https://cdn.example/small?sig=two",
        fallbackUrl: "https://object.example/medium?sig=one",
        fallbackSmallUrl: "https://object.example/small?sig=two",
        width: 1080, height: 1920, smallWidth: 360, smallHeight: 640,
      });
    expect(mocks.delivery.mock.calls).toEqual([
      ["questions-v2:owner/full.webp"], ["questions-v2:owner/mini.webp"],
    ]);
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.signedRead).not.toHaveBeenCalled();
  });
  it("does not reuse stale signatures on a missing V2 manifest", async () => {
    mocks.task.mockResolvedValue({ status: "READY", manifest: null });
    expect(await presentQuestionPhoto({ id: "stale", url: "questions-v2:owner/medium.webp" }))
      .toBeNull();
    expect(mocks.delivery).not.toHaveBeenCalled();
  });
});
