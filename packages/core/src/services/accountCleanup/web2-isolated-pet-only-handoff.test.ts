/** In-process SQL statement/namespace checks. No DB or S3 provider touched. */
import {describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({gallery:vi.fn(),feed:vi.fn()}));
vi.mock("../gallery/accountCleanup",()=>({enqueueGalleryAccountCleanup:m.gallery}));
vi.mock("../feed/cleanup",()=>({enqueueFeedAccountCleanup:m.feed}));
vi.mock("@gafus/cdn-upload",()=>({DUAL_PROVIDER_CLEANUP_MARKER:"DUAL_PROVIDER_REVIEW"}));
import {enqueueAccountStorageCleanup} from "./enqueue";
import {accountStorageTargets} from "../../../../cdn-upload/src/accountStorageCleanup";
const owner="owner_A";
describe("WEB2 account deletion: isolated pet photo with no documents or avatar",()=>{
  it("snapshots an independent documents cleanup intent for isolated pet photo",async()=>{
    const sql:string[]=[];
    const params:unknown[][]=[];
    const tx={$executeRaw:vi.fn(async(strings:string[],...args:unknown[])=>{
      sql.push(strings.join("?"));params.push(args);return 1;
    })};
    await enqueueAccountStorageCleanup(tx as never,owner,new Date("2030-01-01"));
    expect(tx.$executeRaw).toHaveBeenCalledTimes(5);
    const statement=sql.find(source=>source.includes('INSERT INTO "AccountStorageCleanup"'));
    expect(statement).toBeDefined();
    expect(statement).toContain('UNION SELECT 1 FROM "Pet"');
    expect(statement).toContain('UNION SELECT "photoUrl" FROM "Pet"');
    expect(statement).toContain("\"photoUrl\" LIKE 'isodev-avatar:%'");
    expect(statement).toContain('"ownerId" = ?');
    expect(statement).toContain("AND url NOT LIKE 'isodev-avatar:%'");
    expect(statement).toContain("isodev-private:questions:%");
    expect(statement).toContain("isodev-private:documents:%");
    expect(statement).toContain("s.scope = 'documents' AND EXISTS");
    expect(params.flat()).toContain(owner);
    expect(m.gallery).toHaveBeenCalledOnce();
    expect(m.feed).toHaveBeenCalledOnce();
  });
  it("pet-photo private marker is preserved and does not resolve under a changed provider",()=>{
    const loc=`isodev-avatar:documents/uploads/users/${owner}/pets/pet_A/11111111-1111-4111-8111-111111111111.jpg`;
    const env={GAFUS_ISOLATED_NONPROD_S3:"enabled"};
    expect(accountStorageTargets("documents",owner,[loc],[],env)).toEqual({
      prefixes:[`documents/uploads/users/${owner}/pets/`],
      keys:[`documents/uploads/users/${owner}/pets/pet_A/11111111-1111-4111-8111-111111111111.jpg`],
    });
    expect(()=>accountStorageTargets("documents",owner,[loc],[],{}))
      .toThrow("CLEANUP_INVALID_PRIVATE_LOCATION");
    expect(()=>accountStorageTargets("documents","otherOwner",[loc],[],env))
      .toThrow("CLEANUP_INVALID_PRIVATE_LOCATION");
  });
  it("foreign Documents Cloud.ru marker never authorizes someone else's object",()=>{
    const foreign="cloudru:documents:documents/uploads/users/otherOwner/pets/pet_X/documents/a.pdf";
    expect(()=>accountStorageTargets("documents",owner,[foreign],[],{}))
      .toThrow("CLEANUP_INVALID_PRIVATE_LOCATION");
  });
  it("isolated local cleanup cannot falsely confirm Cloud.ru Documents erasure",()=>{
    const cloud=`cloudru:documents:documents/uploads/users/${owner}/pets/pet_A/documents/a.pdf`;
    expect(()=>accountStorageTargets("documents",owner,[cloud],[],{
      GAFUS_ISOLATED_NONPROD_S3:"enabled",
    })).toThrow("CLEANUP_PROVIDER_MISMATCH");
    expect(accountStorageTargets("documents",owner,[cloud],[],{})).toEqual({
      prefixes:[`documents/uploads/users/${owner}/pets/`],
      keys:[`documents/uploads/users/${owner}/pets/pet_A/documents/a.pdf`],
    });
  });
  it("documents cleaner targets only the exact deleted account pets prefix",()=>{
    const targets=accountStorageTargets("documents",owner,[],[],{
      GAFUS_ISOLATED_NONPROD_S3:"enabled",
    });
    expect(targets).toEqual({
      prefixes:[`documents/uploads/users/${owner}/pets/`],keys:[],
    });
    expect(targets.prefixes[0]).not.toContain("owner_B");
    // No test invokes createAccountStorageCleaner() or its provider .sweep().
  });
});
