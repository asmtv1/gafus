import {beforeEach,describe,expect,it,vi} from "vitest";
import {
  describePetMediaLocator,describeLegacyPetMediaDeletionPlan,
  petMediaDedupeKey,runClaimedPetMediaDeletion,
  type PetMediaIntent,type PetMediaDeletionPort,
} from "./petMediaDeletionOutbox";
const owner="owner_A",pet="pet_A";
const photo="isodev-avatar:documents/uploads/users/owner_A/pets/pet_A/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg";
const document="cloudru:documents:documents/uploads/users/owner_A/pets/pet_A/documents/medical.pdf";
const legacy="https://storage.yandexcloud.net/gafus-media/uploads/users/owner_A/pets/pet_A/old.jpg";
let job:PetMediaIntent;
const mk = (location=photo): PetMediaIntent => ({
  id:"job-1",ownerId:owner,petId:pet,locator:location,
  provider:describePetMediaLocator(owner,pet,location).provider,
  dedupeKey:petMediaDedupeKey(owner,location),reason:"pet-delete",status:"processing",
  attemptToken:"attempt-A",leaseUntil:new Date(Date.now()+45_000),attempts:0,
});
let p:PetMediaDeletionPort;
const m=vi.hoisted(()=>({
  fence:vi.fn(),lease:vi.fn(),active:vi.fn(),remove:vi.fn(),complete:vi.fn(),release:vi.fn(),
}));
beforeEach(()=>{
  vi.resetAllMocks();job=mk();
  m.fence.mockImplementation(async(_owner:string,callback:()=>Promise<unknown>)=>callback());
  m.lease.mockResolvedValue(true);m.active.mockResolvedValue(false);
  m.remove.mockResolvedValue(undefined);m.complete.mockResolvedValue(true);
  m.release.mockResolvedValue(undefined);
  p={withOwnerFence:m.fence,isLeaseCurrent:m.lease,hasActiveReference:m.active,
    deleteAndVerify:m.remove,complete:m.complete,release:m.release};
});
describe("WEB2 non-provider pet media outbox contracts",()=>{
  it("classifies immutable qualified locations without routing into Gallery storage",()=>{
    expect(describePetMediaLocator(owner,pet,photo).provider).toBe("isolated-avatar");
    expect(describePetMediaLocator(owner,pet,document).provider).toBe("cloudru-documents");
    expect(describePetMediaLocator(owner,pet,legacy).provider).toBe("legacy-yandex");
    expect(petMediaDedupeKey(owner,photo)).toBe(petMediaDedupeKey(owner,photo));
    expect(petMediaDedupeKey("other",photo)).not.toBe(petMediaDedupeKey(owner,photo));
  });
  it.each([
    "https://evil.invalid/x", "cloudru:documents:documents/uploads/users/other/pets/pet_A/documents/x.pdf",
    "isodev-avatar:documents/uploads/users/other/pets/pet_A/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg",
    "isodev-avatar:documents/uploads/users/owner_A/pets/pet_A/not-a-uuid.jpg",
    "cloudru:questions:questions/uploads/questions/a/img.png",
    "users/owner_A/pets/pet_A/../../x.jpg", "users/owner_A/pets/pet_B/photo.jpg",
    "https://storage.yandexcloud.net/gafus-media/uploads/users/owner_A/pets/pet_A/f.jpg?sig=bad",
  ])("rejects unsafe, foreign and non-pet provider locator: %s",location=>{
    expect(()=>describePetMediaLocator(owner,pet,location)).toThrow();
  });
  it("parses both exact Yandex hosts and relative legacy key without enabling DELETE",()=>{
    const sources=[
      {location:legacy,form:"path-host"},
      {location:"https://gafus-media.storage.yandexcloud.net/uploads/users/owner_A/pets/pet_A/old.jpg",
        form:"bucket-host"},
      {location:"users/owner_A/pets/pet_A/old.jpg",form:"relative"},
    ];
    for(const {location,form} of sources){
      const plan=describeLegacyPetMediaDeletionPlan(owner,pet,location);
      expect(plan).toEqual({
        provider:"legacy-yandex",bucket:"gafus-media",
        key:"uploads/users/owner_A/pets/pet_A/old.jpg",
        sourceForm:form,activation:"DENIED_PENDING_VERSIONED_HEAD_REVIEW",
      });
    }
  });
  it("rejects attempts to reclassify Cloud.ru/isolated or foreign legacy buckets",()=>{
    for(const uri of [photo,document,
      "https://storage.yandexcloud.net/gafus-OTHER/uploads/users/owner_A/pets/pet_A/x.jpg",
      "https://gafus-media.storage.yandexcloud.net.evil.invalid/uploads/users/owner_A/pets/pet_A/x.jpg",
      "https://storage.yandexcloud.net/gafus-media/uploads/users/other/pets/pet_A/x.jpg",
      "https://storage.yandexcloud.net/gafus-media/uploads/users/owner_A/pets/pet_A/x.jpg?X-Amz-Signature=x",
    ])expect(()=>describeLegacyPetMediaDeletionPlan(owner,pet,uri)).toThrow();
  });
  it("performs exactly one scoped, fenced deletion and verifies absence before CAS",async()=>{
    expect(await runClaimedPetMediaDeletion(job,p)).toBe("done");
    expect(m.fence).toHaveBeenCalledWith(owner,expect.any(Function));
    expect(m.active).toHaveBeenCalledOnce();
    expect(m.remove).toHaveBeenCalledWith("isolated-avatar",photo);
    expect(m.complete).toHaveBeenCalledWith("job-1","attempt-A");
    expect(m.release).not.toHaveBeenCalled();
  });
  it("never deletes if a Pet/photo or PetDocument row still references the object",async()=>{
    m.active.mockResolvedValueOnce(true);
    expect(await runClaimedPetMediaDeletion(job,p)).toBe("protected");
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.release).toHaveBeenCalledWith("job-1","attempt-A",60_000);
  });
  it("stale claim and old attempt ACK cannot delete or mark a replacement attempt done",async()=>{
    m.lease.mockResolvedValueOnce(false);
    expect(await runClaimedPetMediaDeletion(job,p)).toBe("stale");
    expect(m.fence).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
    m.lease.mockResolvedValue(true);m.complete.mockResolvedValueOnce(false);
    expect(await runClaimedPetMediaDeletion(job,p)).toBe("stale");
    expect(m.complete).toHaveBeenCalledOnce();
  });
  it("lost delete ACK is retryable, second execution can confirm idempotent absence",async()=>{
    m.remove.mockRejectedValueOnce(Error("S3_ACK_LOST"));
    expect(await runClaimedPetMediaDeletion(job,p)).toBe("retry");
    expect(m.complete).not.toHaveBeenCalled();
    expect(m.release).toHaveBeenCalledWith("job-1","attempt-A",30_000);
    expect(await runClaimedPetMediaDeletion(job,p)).toBe("done");
    expect(m.remove).toHaveBeenCalledTimes(2);
  });
  it("rejects tampered provider, pet, dedupe without ever touching storage",async()=>{
    for(const tampered of [
      {...job,provider:"legacy-yandex" as const},
      {...job,petId:"other_pet"},
      {...job,dedupeKey:"hacked"},
    ])expect(await runClaimedPetMediaDeletion(tampered,p)).toBe("retry");
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.complete).not.toHaveBeenCalled();
  });
  it("bounds exponential backoff for repeated provider failure",async()=>{
    m.remove.mockRejectedValue(Error("S3_UNAVAILABLE"));
    expect(await runClaimedPetMediaDeletion({...job,attempts:30},p)).toBe("retry");
    expect(m.release).toHaveBeenCalledWith("job-1","attempt-A",3_600_000);
  });
  it("already-completed job is safe under repeated callback",async()=>{
    expect(await runClaimedPetMediaDeletion({...job,status:"done",attemptToken:null},p))
      .toBe("already-done");
    expect(m.fence).not.toHaveBeenCalled();
  });
});
