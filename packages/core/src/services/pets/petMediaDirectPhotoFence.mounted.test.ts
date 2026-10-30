/** Actual Core public create/update entrypoints, fake SQL only, no provider. */
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({
  find:vi.fn(),create:vi.fn(),read:vi.fn(),update:vi.fn(),owner:vi.fn(),
  transaction:vi.fn(),intent:vi.fn(),actions:[] as string[],
}));
vi.mock("@gafus/prisma",()=>({prisma:{
  pet:{findFirst:m.find,create:m.create},$transaction:m.transaction,
}}));
vi.mock("./petMediaDeletionSql",()=>({
  petMediaOutboxEnabled:()=>process.env.PET_MEDIA_DELETION_OUTBOX_ENABLED==="true",
  enqueuePetMediaDeletionIntent:m.intent,
  consumePetMediaUploadReservation:vi.fn(),
}));
import {createPet,updatePet,PetMediaDirectPhotoUrlDeniedError} from "./petsService";
const old="isodev-avatar:documents/uploads/users/owner_A/pets/pet_A/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg";
const foreign="isodev-avatar:documents/uploads/users/owner_B/pets/pet_B/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg";
beforeEach(()=>{
  vi.clearAllMocks();m.actions.length=0;
  m.find.mockResolvedValue({id:"pet_A",ownerId:"owner_A",photoUrl:old});
  m.read.mockResolvedValue({photoUrl:old});
  m.owner.mockResolvedValue([{id:"owner_A"}]);
  m.intent.mockImplementation(async()=>{m.actions.push("intent");});
  m.update.mockImplementation(async({data}:{data:{photoUrl?:string|null}})=>{
    m.actions.push("update:"+String(data.photoUrl));
    return {id:"pet_A",ownerId:"owner_A",...data};
  });
  m.transaction.mockImplementation(async(fn:(tx:unknown)=>Promise<unknown>)=>{
    const result=await fn({
      $queryRaw:m.owner,pet:{findFirst:m.read,update:m.update},
    });
    m.actions.push("commit");return result;
  });
  m.create.mockResolvedValue({id:"pet_NEW",ownerId:"owner_A"});
});
afterEach(()=>vi.unstubAllEnvs());
describe("WEB2 generic Pet photo URL writes vs gated media outbox",()=>{
  it.each([
    "not-a-url?synthetic-credential=SHOULD_NOT_LEAK",
    "isodev-avatar:documents/uploads/users/owner_B/pets/pet_B/bad.jpg",
    "cloudru:gallery:other-bucket/unsupported-photo.jpg",
    "https://storage.yandexcloud.net/unknown-bucket/users/owner_B/x.png",
  ])("typed Core denial rejects malformed/foreign/unsupported direct URL without raw data: %s",async photoUrl=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","true");
    const input={name:"Bim",type:"DOG",breed:"Pug",birthDate:"2023-01-01",photoUrl};
    const capture=await createPet("owner_A",input).catch(error=>error as unknown);
    expect(capture).toBeInstanceOf(PetMediaDirectPhotoUrlDeniedError);
    expect((capture as PetMediaDirectPhotoUrlDeniedError).code)
      .toBe("PET_MEDIA_DIRECT_PHOTO_URL_DENIED");
    expect(JSON.stringify(capture)).not.toContain(photoUrl);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("typed Core denial is preserved when another photo wins under owner lock",async()=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","true");
    m.read.mockResolvedValueOnce({photoUrl:foreign});
    const capture=await updatePet("pet_A","owner_A",{photoUrl:old})
      .catch(error=>error as unknown);
    expect(capture).toBeInstanceOf(PetMediaDirectPhotoUrlDeniedError);
    expect((capture as PetMediaDirectPhotoUrlDeniedError).code)
      .toBe("PET_MEDIA_DIRECT_PHOTO_URL_DENIED");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("a foreign Pet returns null before photo mutation denial, retaining owner boundary",async()=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","true");
    m.find.mockResolvedValueOnce(null);
    expect(await updatePet("pet_A","owner_B",{photoUrl:foreign})).toBeNull();
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
  it("disabled outbox retains legacy generic Pet create/update photoUrl behavior",async()=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","false");
    const input={name:"Bim",type:"DOG",breed:"Pug",birthDate:"2023-01-01",photoUrl:foreign};
    expect(await createPet("owner_A",input)).toMatchObject({id:"pet_NEW"});
    expect(m.create).toHaveBeenCalledOnce();
    expect(m.create.mock.calls[0]![0]).toMatchObject({data:{photoUrl:foreign}});
    await updatePet("pet_A","owner_A",{photoUrl:foreign});
    expect(m.owner).not.toHaveBeenCalled();
    expect(m.intent).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({
      data:{photoUrl:foreign},
    }));
  });
  it("new Pet cannot attach another owner's media by arbitrary photoUrl",async()=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","true");
    await expect(createPet("owner_A",{
      name:"Bim",type:"DOG",breed:"Pug",birthDate:"2023-01-01",photoUrl:foreign,
    })).rejects.toThrow("PET_MEDIA_DIRECT_PHOTO_URL_DENIED");
    expect(m.create).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("generic update cannot attach foreign photo or race the fenced upload method",async()=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","true");
    await expect(updatePet("pet_A","owner_A",{photoUrl:foreign}))
      .rejects.toThrow("PET_MEDIA_DIRECT_PHOTO_URL_DENIED");
    expect(m.update).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("clearing a photo commits a durable former-media intent before null update",async()=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","true");
    await updatePet("pet_A","owner_A",{photoUrl:""});
    expect(m.owner).toHaveBeenCalledOnce();
    expect(m.read).toHaveBeenCalledWith({
      where:{id:"pet_A",ownerId:"owner_A"},select:{photoUrl:true},
    });
    expect(m.intent).toHaveBeenCalledWith(expect.anything(),"owner_A","pet_A",old,"photo-replaced");
    expect(m.actions).toEqual(["intent","update:null","commit"]);
  });
  it("already unchanged photo may be echoed in full form, no duplicate media intent",async()=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","true");
    await updatePet("pet_A","owner_A",{photoUrl:old,name:"Bim"});
    expect(m.intent).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({
      data:{photoUrl:old,name:"Bim"},
    }));
  });
  it("concurrent newer photo beats stale form: recheck under User FOR UPDATE rejects stale URL",async()=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","true");
    m.read.mockResolvedValueOnce({photoUrl:foreign});
    await expect(updatePet("pet_A","owner_A",{photoUrl:old}))
      .rejects.toMatchObject({ code: "PET_MEDIA_DIRECT_PHOTO_URL_DENIED" });
    expect(m.intent).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.owner).toHaveBeenCalledOnce();
  });
  it("concurrent owner/Pet deletion prevents any photo update or cleanup",async()=>{
    vi.stubEnv("PET_MEDIA_DELETION_OUTBOX_ENABLED","true");
    m.read.mockResolvedValueOnce(null);
    expect(await updatePet("pet_A","owner_A",{photoUrl:""})).toBeNull();
    expect(m.intent).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
});
