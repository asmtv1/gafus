/** Real Pets Core upload entry and synthetic SQL/S3 ports only.
 * No PostgreSQL or provider network connection; verifies producer ordering.
 */
import {beforeEach,afterEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({
  getPet:vi.fn(),docRead:vi.fn(),docCreate:vi.fn(),docCount:vi.fn(),
  upload:vi.fn(),remove:vi.fn(),tx:vi.fn(),raw:vi.fn(),intent:vi.fn(),consume:vi.fn(),
  events:[] as string[],
}));
vi.mock("@gafus/prisma",()=>({prisma:{
  pet:{findFirst:m.getPet},
  petDocument:{findFirst:m.docRead},
  $transaction:m.tx,
}}));
vi.mock("@gafus/cdn-upload",()=>({
  getPetDocumentPath:(owner:string,pet:string,id:string,ext:string)=>
    `users/${owner}/pets/${pet}/documents/${id}.${ext}`,
  privateMediaEnabled:()=>true,
  privateMediaLocation:(_kind:string,path:string)=>
    "cloudru:documents:documents/uploads/"+path,
  parsePrivateMediaLocation:()=>null,
  uploadFileToCDN:m.upload,deleteFileFromCDN:m.remove,
  getRelativePathFromCDNUrl:(value:string)=>value,
}));
vi.mock("@gafus/logger",()=>({
  createWebLogger:()=>({error:vi.fn(),warn:vi.fn(),info:vi.fn()}),
}));
vi.mock("./petVetVisitService",()=>({lockVetPet:vi.fn(),enqueuePetVetCleanup:vi.fn()}));
vi.mock("./petMediaDeletionSql",()=>({
  petMediaOutboxEnabled:()=>process.env.PET_MEDIA_DELETION_OUTBOX_ENABLED==="true",
  enqueuePetMediaDeletionIntent:m.intent,
  consumePetMediaUploadReservation:m.consume,
}));
import {uploadPetDocument} from "./petsService";
const pdf=()=>new File([new Uint8Array([0x25,0x50,0x44,0x46])],
  "medical.pdf",{type:"application/pdf"});
function transaction(callback:(tx:unknown)=>Promise<unknown>){
  return callback({
    $queryRaw:m.raw,pet:{findFirst:m.getPet},
    petDocument:{count:m.docCount,create:m.docCreate},
  }).then(result=>{m.events.push("COMMIT");return result;});
}
beforeEach(()=>{
  vi.clearAllMocks();m.events.length=0;
  m.getPet.mockResolvedValue({id:"pet_A"});
  m.docRead.mockResolvedValue(null);
  m.raw.mockResolvedValue([{id:"owner_A"}]);
  m.docCount.mockResolvedValue(0);
  m.intent.mockImplementation(async(_tx:unknown,_owner:string,_pet:string,
    locator:string,kind:string)=>{m.events.push("INTENT:"+kind+":"+locator);});
  m.consume.mockImplementation(async(_tx:unknown,_owner:string,locator:string)=>{
    m.events.push("CONSUME:"+locator);
  });
  m.upload.mockImplementation(async(_file:File,path:string)=>{
    m.events.push("PUT:"+path);
    return "cloudru:documents:documents/uploads/"+path;
  });
  m.docCreate.mockImplementation(async({data}:{data:Record<string,unknown>})=>{
    m.events.push("SQL_CREATE");
    return {id:"doc_A",createdAt:new Date(),updatedAt:new Date(),...data};
  });
  m.tx.mockImplementation(transaction);
});
afterEach(()=>vi.unstubAllEnvs());
describe("WEB2 before-PUT document outbox intent producer",()=>{
  it("reserves unique qualified candidate before PUT and consumes under document DB commit",async()=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","true");
    const result=await uploadPetDocument("pet_A","owner_A",pdf());
    const location=String(result.url);
    const raw=location.replace("cloudru:documents:documents/uploads/","");
    expect(m.events).toEqual([
      "INTENT:candidate:"+location,"COMMIT",
      "PUT:"+raw,"CONSUME:"+location,"SQL_CREATE","COMMIT",
    ]);
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.intent).toHaveBeenCalledOnce();
    expect(m.consume).toHaveBeenCalledOnce();
  });
  it("failed SQL commit after PUT retains candidate for later GC and never deletes committed data",async()=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","true");
    m.tx.mockImplementationOnce(transaction).mockImplementationOnce(async callback=>{
      await transaction(callback);
      throw Error("DB_COMMIT_ACK_LOST");
    });
    await expect(uploadPetDocument("pet_A","owner_A",pdf()))
      .rejects.toThrow("DB_COMMIT_ACK_LOST");
    expect(m.events.filter((event:string)=>event.startsWith("INTENT:"))).toHaveLength(1);
    expect(m.events.some((event:string)=>event.startsWith("PUT:"))).toBe(true);
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("candidate-reservation SQL failure prevents any S3 PUT",async()=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","true");
    m.intent.mockRejectedValueOnce(Error("OUTBOX_SQL_UNAVAILABLE"));
    await expect(uploadPetDocument("pet_A","owner_A",pdf()))
      .rejects.toThrow("OUTBOX_SQL_UNAVAILABLE");
    expect(m.upload).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.docCreate).not.toHaveBeenCalled();
  });
  it("foreign pet denied before S3 or outbox intent",async()=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","true");
    m.getPet.mockResolvedValueOnce(null);
    await expect(uploadPetDocument("pet_A","foreign",pdf())).rejects.toThrow("не найден");
    expect(m.intent).not.toHaveBeenCalled();
    expect(m.upload).not.toHaveBeenCalled();
  });
});
