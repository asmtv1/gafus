/** Actual Core pet deletion with synthetic Prisma transaction + CDN.
 * A rollback must never remove a still-referenced photo or document.
 */
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({
  tx:vi.fn(),query:vi.fn(),find:vi.fn(),documents:vi.fn(),petDelete:vi.fn(),
  mediaDelete:vi.fn(),lockVet:vi.fn(),enqueueVet:vi.fn(),
  mediaIntent:vi.fn(),docFind:vi.fn(),docDelete:vi.fn(),
  logs:vi.fn(),sequence:[] as string[],
}));
vi.mock("@gafus/prisma",()=>({prisma:{$transaction:m.tx}}));
vi.mock("@gafus/cdn-upload",()=>({
  getRelativePathFromCDNUrl:(value:string)=>value,
  deleteFileFromCDN:m.mediaDelete,
}));
vi.mock("@gafus/logger",()=>({
  createWebLogger:()=>({error:m.logs,info:vi.fn(),warn:vi.fn()}),
}));
vi.mock("./petVetVisitService",()=>({
  lockVetPet:m.lockVet,enqueuePetVetCleanup:m.enqueueVet,
}));
vi.mock("./petMediaDeletionSql",()=>({
  petMediaOutboxEnabled:()=>process.env.PET_MEDIA_DELETION_OUTBOX_ENABLED==="true",
  enqueuePetMediaDeletionIntent:m.mediaIntent,
  consumePetMediaUploadReservation:vi.fn(),
}));
import {deletePet,deletePetDocument} from "./petsService";
const photo="isodev-avatar:documents/uploads/users/owner/pets/pet_A/old.jpg";
const medical="cloudru:documents:users/owner/pets/pet_A/documents/medical.pdf";
afterEach(()=>vi.unstubAllEnvs());
beforeEach(()=>{
  vi.clearAllMocks();m.sequence.length=0;
  m.mediaIntent.mockImplementation(async(_tx:unknown,_owner:string,_pet:string,loc:string,
    reason:string)=>{m.sequence.push("INTENT:"+reason+":"+loc);});
  m.docFind.mockResolvedValue({id:"doc_1",petId:"pet_A",ownerId:"owner",url:medical});
  m.docDelete.mockImplementation(async()=>m.sequence.push("SQL_DOCUMENT_DELETE"));
  m.query.mockResolvedValue([{id:"owner"}]);
  m.find.mockResolvedValue({photoUrl:photo});
  m.documents.mockResolvedValue([{url:medical}]);
  m.petDelete.mockImplementation(async()=>{m.sequence.push("SQL_DELETE");});
  m.lockVet.mockResolvedValue(undefined);m.enqueueVet.mockResolvedValue(undefined);
  m.mediaDelete.mockImplementation(async(path:string)=>m.sequence.push("MEDIA_DELETE:"+path));
  m.tx.mockImplementation(async(fn:(arg:unknown)=>Promise<unknown>)=>{
    const result=await fn({$queryRaw:m.query,
      pet:{findFirst:m.find,delete:m.petDelete},
      petDocument:{findMany:m.documents,findFirst:m.docFind,delete:m.docDelete}});
    m.sequence.push("SQL_COMMIT");return result;
  });
});
describe("SQL-first pet deletion, scoped attachment cleanup",()=>{
  it("deletes only after owner-locked commit, then purges own photo and documents",async()=>{
    expect(await deletePet("pet_A","owner")).toBe(true);
    expect(m.find).toHaveBeenCalledWith({
      where:{id:"pet_A",ownerId:"owner"},select:{photoUrl:true},
    });
    expect(m.documents).toHaveBeenCalledWith({
      where:{petId:"pet_A",ownerId:"owner"},select:{url:true},
    });
    expect(m.petDelete).toHaveBeenCalledWith({where:{id:"pet_A",ownerId:"owner"}});
    expect(m.sequence).toEqual([
      "SQL_DELETE","SQL_COMMIT","MEDIA_DELETE:"+photo,"MEDIA_DELETE:"+medical,
    ]);
    expect(m.lockVet).toHaveBeenCalledOnce();
    expect(m.enqueueVet).toHaveBeenCalledOnce();
  });
  it("foreign pet is not found, no SQL mutation or media deletes",async()=>{
    m.find.mockResolvedValueOnce(null);
    expect(await deletePet("pet_A","foreign")).toBe(false);
    expect(m.petDelete).not.toHaveBeenCalled();
    expect(m.mediaDelete).not.toHaveBeenCalled();
  });
  it("SQL rollback preserves previous S3 photo and documents",async()=>{
    m.petDelete.mockRejectedValueOnce(Error("PG_ROLLBACK"));
    await expect(deletePet("pet_A","owner")).rejects.toThrow("Не удалось удалить");
    expect(m.sequence).not.toContain("SQL_COMMIT");
    expect(m.mediaDelete).not.toHaveBeenCalled();
  });
  it("opt-in Pet cascade atomically persists separate photo/document intents before SQL commit",async()=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","true");
    expect(await deletePet("pet_A","owner")).toBe(true);
    expect(m.sequence).toEqual([
      "INTENT:pet-delete:"+photo,
      "INTENT:pet-delete:"+medical,
      "SQL_DELETE","SQL_COMMIT",
    ]);
    expect(m.mediaIntent).toHaveBeenCalledTimes(2);
    expect(m.mediaDelete).not.toHaveBeenCalled();
    expect(m.enqueueVet).toHaveBeenCalledOnce();
  });
  it("opt-in Pet cascade rolls back atomically when enqueue fails",async()=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","true");
    m.mediaIntent.mockRejectedValueOnce(Error("OUTBOX_INSERT_FAILED"));
    await expect(deletePet("pet_A","owner")).rejects.toThrow("Не удалось удалить питомца");
    expect(m.petDelete).not.toHaveBeenCalled();
    expect(m.mediaDelete).not.toHaveBeenCalled();
    expect(m.sequence).not.toContain("SQL_COMMIT");
  });
  it("opt-in document deletion queues intent before SQL delete; foreign document writes nothing",async()=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","true");
    expect(await deletePetDocument("doc_1","owner","pet_A")).toBe(true);
    expect(m.sequence).toEqual([
      "INTENT:document-delete:"+medical,"SQL_DOCUMENT_DELETE","SQL_COMMIT",
    ]);
    expect(m.mediaDelete).not.toHaveBeenCalled();
    m.sequence.length=0;m.docFind.mockResolvedValueOnce(null);
    expect(await deletePetDocument("doc_2","foreign","pet_A")).toBe(false);
    expect(m.sequence).toEqual(["SQL_COMMIT"]);
    expect(m.mediaDelete).not.toHaveBeenCalled();
  });
  it("opt-in document DB rollback never performs physical deletion",async()=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","true");
    m.docDelete.mockRejectedValueOnce(Error("PG_ROLLBACK"));
    await expect(deletePetDocument("doc_1","owner","pet_A"))
      .rejects.toThrow("PG_ROLLBACK");
    expect(m.sequence).not.toContain("SQL_COMMIT");
    expect(m.mediaDelete).not.toHaveBeenCalled();
  });
  it("media failure after commit never pretends SQL was rolled back",async()=>{
    m.mediaDelete.mockRejectedValueOnce(Error("S3_FAILURE"));
    expect(await deletePet("pet_A","owner")).toBe(true);
    expect(m.petDelete).toHaveBeenCalledOnce();
    expect(m.logs).toHaveBeenCalledWith("PET_MEDIA_POSTCOMMIT_CLEANUP_FAILED",
      expect.any(Error));
    expect(m.mediaDelete).toHaveBeenCalledTimes(2);
  });
});
