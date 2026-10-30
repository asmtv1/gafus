import {afterEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({cloud:vi.fn(),avatar:vi.fn(),run:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{}}));
vi.mock("@gafus/cdn-upload",()=>({
  deletePrivateUserMedia:m.cloud,deleteIsolatedAvatarLocation:m.avatar,
}));
vi.mock("./petMediaDeletionSql",()=>({runOnePetMediaDeletionSql:m.run}));
import {deleteVerifiedPetMediaObject,petMediaWorkerAllowed,
  processDuePetMediaDeletionIntents} from "./petMediaDeletionRuntime";
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
const local={
  NODE_ENV:"development",GAFUS_LOCAL_ISOLATED_API:"1",
  GAFUS_ISOLATED_NONPROD_S3:"enabled",
  PET_MEDIA_DELETION_OUTBOX_ENABLED:"true",PET_MEDIA_CLEANUP_WORKER_ENABLED:"true",
};
describe("WEB2 local-only provider-aware outbox runtime",()=>{
  it("rejects typos, production and nonisolated environments",()=>{
    expect(petMediaWorkerAllowed({})).toBe(false);
    expect(()=>petMediaWorkerAllowed({...local,NODE_ENV:"production"})).toThrow("PET_MEDIA_WORKER_ISOLATION_DENIED");
    expect(()=>petMediaWorkerAllowed({...local,GAFUS_ISOLATED_NONPROD_S3:"false"}))
      .toThrow("PET_MEDIA_WORKER_ISOLATION_DENIED");
    expect(()=>petMediaWorkerAllowed({...local,PET_MEDIA_CLEANUP_WORKER_ENABLED:"yes"}))
      .toThrow("PET_MEDIA_WORKER_CONFIG_INVALID");
  });
  it("routes only qualified documents and isolated-avatar to HEAD-verifying providers",async()=>{
    await deleteVerifiedPetMediaObject("cloudru-documents","cloudru:documents:test");
    await deleteVerifiedPetMediaObject("isolated-avatar","isodev-avatar:test");
    expect(m.cloud).toHaveBeenCalledWith("cloudru:documents:test");
    expect(m.avatar).toHaveBeenCalledWith("isodev-avatar:test");
    await expect(deleteVerifiedPetMediaObject("legacy-yandex","users/foo/pets/p/photo.jpg"))
      .rejects.toThrow("PET_MEDIA_LEGACY_HEAD_VERIFICATION_REQUIRED");
  });
  it("never reads SQL when the gate is disabled, and stops on empty claim",async()=>{
    expect(await processDuePetMediaDeletionIntents()).toBe(0);
    expect(m.run).not.toHaveBeenCalled();
    for(const [key,val] of Object.entries(local))vi.stubEnv(key,val);
    m.run.mockResolvedValueOnce("done").mockResolvedValueOnce("empty");
    expect(await processDuePetMediaDeletionIntents(3)).toBe(1);
    expect(m.run).toHaveBeenCalledTimes(2);
  });
});
