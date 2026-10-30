import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({sign:vi.fn()}));
vi.mock("@gafus/cdn-upload",()=>({
  parsePrivateMediaLocation:(url:string)=>url.startsWith("cloudru:")?{kind:"questions",key:"private"}:null,
  signPrivateUserMedia:mocks.sign,
  questionsV2IsMarker:()=>false,
  questionsV2SignedRead:vi.fn(),questionsV2Marker:vi.fn(),questionsV2Delivery:vi.fn(),
}));
vi.mock("@gafus/prisma",()=>({prisma:{}}));
import {presentQuestionPhoto} from "./presentPhoto";
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
