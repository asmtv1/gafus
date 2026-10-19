import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({
  uploadLegacy:vi.fn(),uploadNew:vi.fn(),wake:vi.fn(),count:vi.fn(),create:vi.fn(),
  update:vi.fn(),present:vi.fn(),
}));
vi.mock("file-type",()=>({
  fileTypeFromBuffer:vi.fn().mockResolvedValue({ext:"png",mime:"image/png"}),
}));
vi.mock("@gafus/cdn-upload",()=>({
  questionCloudJobEnabled:()=>true,
  privateMediaEnabled:()=>true,
  publicQuestionsEnabled:()=>true,
  privateMediaLocation:(_kind:string,path:string)=>"cloudru:questions:questions/uploads/"+path,
  pendingQuestionLocation:(path:string)=>"cloudru:questions-pending:"+path,
  uploadPrivateUserMedia:m.uploadLegacy,
  uploadQuestionSource:m.uploadNew,
}));
vi.mock("@gafus/queues",()=>({enqueueQuestionsProcessing:m.wake}));
vi.mock("./service",()=>({questionActor:vi.fn().mockResolvedValue({id:"owner"})}));
vi.mock("./presentPhoto",()=>({presentQuestionPhotoUrl:m.present}));
vi.mock("@gafus/prisma",()=>({
  prisma:{
    $transaction:vi.fn(async cb=>cb({
      questionPhoto:{count:m.count,create:m.create,update:m.update},
    })),
  },
}));
import {uploadQuestionPhoto} from "./photos";
beforeEach(()=>{
  vi.clearAllMocks();
  m.count.mockResolvedValue(0);
  m.create.mockImplementation(async ({data})=>({id:"photo-id",...data}));
  m.update.mockImplementation(async ({data})=>({id:"photo-id",...data}));
  m.uploadLegacy.mockResolvedValue("cloudru:questions:questions/uploads/questions/owner/uuid.png");
  m.uploadNew.mockResolvedValue("cloudru:questions-pending:questions/incoming/questions/owner/uuid/source.png");
  m.wake.mockResolvedValue(undefined);
  m.present.mockResolvedValue("https://s3.cloud.ru/signed-private-photo");
});
describe("first deploy Questions client compatibility",()=>{
  const bytes=new Uint8Array([137,80,78,71,13,10,26,10]);
  it("preserves immediate signed private photo for installed legacy mobile clients",async()=>{
    const result=await uploadQuestionPhoto("owner",bytes,{allowAsync:false});
    expect(result).toMatchObject({id:"photo-id",url:"https://s3.cloud.ru/signed-private-photo"});
    expect(m.create).toHaveBeenCalledWith({data:expect.objectContaining({
      storagePath:expect.stringMatching(/^cloudru:questions:/),url:"",
    })});
    expect(m.uploadLegacy).toHaveBeenCalledWith("questions",expect.any(String),bytes,"image/png");
    expect(m.uploadNew).not.toHaveBeenCalled();
    expect(m.wake).not.toHaveBeenCalled();
  });
  it("uses private Cloud.ru source and returns processing state for updated clients",async()=>{
    const result=await uploadQuestionPhoto("owner",bytes,{allowAsync:true});
    expect(result).toEqual({id:"photo-id",url:"",processing:true});
    expect(m.create).toHaveBeenCalledWith({data:expect.objectContaining({
      storagePath:expect.stringMatching(/^cloudru:questions-pending:/),url:"",
    })});
    expect(m.uploadNew).toHaveBeenCalledWith(expect.any(String),bytes,"image/png");
    expect(m.uploadLegacy).not.toHaveBeenCalled();
    expect(m.present).not.toHaveBeenCalled();
    expect(m.wake).toHaveBeenCalledOnce();
    expect(m.wake).toHaveBeenCalledWith(expect.stringMatching(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    ));
  });
});
