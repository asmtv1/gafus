/** Actual Core updatePetPhoto + owner row-lock + CDN adapter, mocked provider.
 * Integration for transaction/cleanup ordering; no production or real S3.
 */
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({
  find:vi.fn(),upload:vi.fn(),remove:vi.fn(),update:vi.fn(),query:vi.fn(),tx:vi.fn(),
  intent:vi.fn(),consume:vi.fn(),events:[] as string[],
  state:{photo:"isodev-avatar:documents/uploads/users/u/pets/p/old.jpg" as string|null},
}));
vi.mock("@gafus/prisma",()=>({
  prisma:{
    pet:{findFirst:m.find},
    $transaction:m.tx,
  },
}));
vi.mock("@gafus/cdn-upload",()=>({
  getPetPhotoPath:(owner:string,pet:string,uuid:string,ext:string)=>
    `users/${owner}/pets/${pet}/${uuid}.${ext}`,
  getRelativePathFromCDNUrl:(s:string)=>s,
  uploadFileToCDN:m.upload,deleteFileFromCDN:m.remove,
  isolatedAvatarLocationFromOwnPath:(path:string)=>"isodev-avatar:documents/uploads/"+path,
}));
vi.mock("@gafus/logger",()=>({
  createWebLogger:()=>({error:vi.fn(),warn:vi.fn(),info:vi.fn()}),
}));
vi.mock("./petVetVisitService",()=>({
  enqueuePetVetCleanup:vi.fn(),lockVetPet:vi.fn(),
}));
vi.mock("./petMediaDeletionSql",()=>({
  petMediaOutboxEnabled:()=>process.env.PET_MEDIA_DELETION_OUTBOX_ENABLED==="true",
  enqueuePetMediaDeletionIntent:m.intent,
  consumePetMediaUploadReservation:m.consume,
}));
import { updatePetPhoto } from "./petsService";
const jpeg=()=>new File([new Uint8Array([0xff,0xd8,0xff,0x00])],
  "pet-photo.jpg",{type:"image/jpeg"});
const fresh="isodev-avatar:documents/uploads/users/u/pets/p/new.jpg";
const old="isodev-avatar:documents/uploads/users/u/pets/p/old.jpg";
afterEach(()=>vi.unstubAllEnvs());
beforeEach(()=>{
  vi.clearAllMocks();m.events.length=0;m.state.photo=old;
  m.intent.mockImplementation(async(_tx:unknown,_owner:string,_pet:string,
    location:string,kind:string)=>{m.events.push("INTENT:"+kind+":"+location);});
  m.consume.mockImplementation(async(_tx:unknown,_owner:string,location:string)=>{
    m.events.push("CONSUME:"+location);
  });
  m.find.mockImplementation(async()=>({id:"p",photoUrl:m.state.photo}));
  m.upload.mockResolvedValue(fresh);
  m.remove.mockResolvedValue(undefined);
  m.update.mockImplementation(async ({data}:{data:{photoUrl:string}})=>{
    m.state.photo=data.photoUrl;return {id:"p",photoUrl:data.photoUrl};
  });
  m.query.mockResolvedValue([{id:"u"}]);
  m.tx.mockImplementation(async (fn:(tx:unknown)=>Promise<unknown>)=>fn({
    $queryRaw:m.query,pet:{findFirst:m.find,update:m.update},
  }));
});
describe("real Core owner-pet photo upload orchestration",()=>{
  it("uploads own key, locks owner, writes and verifies DB, then removes old",async()=>{
    expect(await updatePetPhoto("p","u",jpeg())).toBe(fresh);
    expect(m.find).toHaveBeenCalledWith({where:{id:"p",ownerId:"u"},select:{id:true}});
    expect(m.upload).toHaveBeenCalledTimes(1);
    expect(m.tx).toHaveBeenCalledTimes(1);
    expect(m.query).toHaveBeenCalledTimes(1);
    expect(m.update).toHaveBeenCalledWith({
      where:{id:"p",ownerId:"u"},data:{photoUrl:fresh},
    });
    expect(m.remove).toHaveBeenCalledWith(old);
    expect(m.remove.mock.invocationCallOrder[0])
      .toBeGreaterThan(m.update.mock.invocationCallOrder[0]);
    expect(m.state.photo).toBe(fresh);
  });
  it("foreign pet rejected before S3 upload",async()=>{
    m.find.mockResolvedValueOnce(null);
    await expect(updatePetPhoto("p","intruder",jpeg()))
      .rejects.toThrow("не принадлежит пользователю");
    expect(m.upload).not.toHaveBeenCalled();
    expect(m.tx).not.toHaveBeenCalled();
  });
  it("DB rollback after upload deletes candidate but keeps previous location",async()=>{
    m.tx.mockRejectedValueOnce(Error("PG_TEST_ROLLBACK"));
    await expect(updatePetPhoto("p","u",jpeg()))
      .rejects.toThrow("PG_TEST_ROLLBACK");
    expect(m.state.photo).toBe(old);
    expect(m.remove).toHaveBeenCalledTimes(1);
    expect(m.remove).toHaveBeenCalledWith(fresh);
    expect(m.remove).not.toHaveBeenCalledWith(old);
  });
  it("lost commit ACK with independent readback is success, not unsafe delete",async()=>{
    m.tx.mockImplementationOnce(async (fn:(tx:unknown)=>Promise<unknown>)=>{
      await fn({$queryRaw:m.query,pet:{findFirst:m.find,update:m.update}});
      throw Error("COMMIT_ACK_LOST");
    });
    expect(await updatePetPhoto("p","u",jpeg())).toBe(fresh);
    expect(m.state.photo).toBe(fresh);
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("opt-in photo reserves provider-qualified candidate before PUT and former media on SQL replace",async()=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","true");
    vi.stubEnv("GAFUS_ISOLATED_NONPROD_S3","enabled");
    m.upload.mockImplementation(async(_file:File,path:string)=>{
      m.events.push("PUT:"+path);
      return "isodev-avatar:documents/uploads/"+path;
    });
    m.update.mockImplementation(async({data}:{data:{photoUrl:string}})=>{
      m.events.push("SQL_UPDATE:"+data.photoUrl);
      m.state.photo=data.photoUrl;
      return {id:"p",photoUrl:data.photoUrl};
    });
    const stored=await updatePetPhoto("p","u",jpeg());
    expect(stored).toMatch(/^isodev-avatar:documents\/uploads\/users\/u\/pets\/p\//);
    expect(m.events).toEqual([
      "INTENT:candidate:"+stored,
      "PUT:"+stored.replace("isodev-avatar:documents/uploads/",""),
      "CONSUME:"+stored,
      "INTENT:photo-replaced:"+old,
      "SQL_UPDATE:"+stored,
    ]);
    expect(m.tx).toHaveBeenCalledTimes(2);
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("malicious extension or MIME cannot construct S3 key",async()=>{
    const svg=new File(["<svg>"],"../x.svg",{type:"image/svg+xml"});
    await expect(updatePetPhoto("p","u",svg)).rejects.toThrow("расширение");
    const mislabeled=new File(["hello"],"../x.jpg",{type:"image/png"});
    await expect(updatePetPhoto("p","u",mislabeled)).rejects.toThrow("формат");
    expect(m.upload).not.toHaveBeenCalled();
  });
});
