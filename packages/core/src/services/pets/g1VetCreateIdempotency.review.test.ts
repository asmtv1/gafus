/** Review-only canonical vet create receipt mechanics; never POST or call Prisma. */
import { describe, expect, it } from "vitest";
import { vetCreateOperationKey, vetCreateFingerprint,
  vetCreateExistingReceiptDecision, type VetCreateReceiptReview,
} from "./g1VetCreateIdempotency.review";
const draft={visitedOn:"2026-10-01",specialty:"  Canine dentist  ",
  diagnosis:"SYNTHETIC_DX_NOT_FOR_LOGS",notes:"SYNTHETIC_PRIVATE_NOTES"};
const key="7CE2D3A5-6C4F-4F16-9FE4-07B25409AA7A";
const secret="SYNTHETIC_TEST_ONLY_FINGERPRINT_KEY_ABCD0123";
const current=new Date("2026-10-18T07:00:00Z");
const receipt=(fingerprint:string):VetCreateReceiptReview=>({operationKind:"CREATE",fingerprint,
  state:"COMMITTED",visitId:"visit-A",responseJson:{id:"visit-A"},
  expiresAt:new Date("2026-11-17T07:00:00Z")});
describe("Vet create lost ACK proposal, no new schema/live handler",()=>{
  it("V01 UUIDv4 case folded; bad UUID and other key shapes rejected",()=>{
    expect(vetCreateOperationKey(key)).toBe(key.toLowerCase());
    for(const bad of ["", "uuid-v1", "00000000-0000-1000-8000-000000000000"])
      expect(()=>vetCreateOperationKey(bad)).toThrow("VET_CREATE_KEY_INVALID");
  });
  it("V02 canonical parsed fields ignore unknown owner body, defaults and trim",()=>{
    const normalized=vetCreateFingerprint("pet-A",{...draft,ownerId:"owner-B"},secret);
    expect(normalized).toBe(vetCreateFingerprint("pet-A",{
      ...draft,specialty:"Canine dentist",doctorName:"",clinic:"",conclusion:"",
    },secret));
    expect(normalized).toMatch(/^[0-9a-f]{64}$/);
    expect(normalized).not.toContain("SYNTHETIC_PRIVATE_NOTES");
  });
  it("V03 medical fingerprint uses mandatory server HMAC; key rotation changes hash",()=>{
    const first=vetCreateFingerprint("pet-A",draft,secret);
    expect(first).not.toBe(vetCreateFingerprint("pet-A",draft,secret+"rotation"));
    expect(()=>vetCreateFingerprint("pet-A",draft,"short")).toThrow("VET_CREATE_FINGERPRINT_SECRET_REQUIRED");
    expect(first).not.toContain("SYNTHETIC_DX_NOT_FOR_LOGS");
  });
  it("V04 same owner/key different pet or medical content not a replay",()=>{
    const first=vetCreateFingerprint("pet-A",draft,secret);
    expect(first).not.toBe(vetCreateFingerprint("pet-B",draft,secret));
    expect(first).not.toBe(vetCreateFingerprint("pet-A",{...draft,diagnosis:"Other"},secret));
  });
  it("V05 invalid clinical date or missing required specialty fail before receipt",()=>{
    expect(()=>vetCreateFingerprint("pet-A",{...draft,visitedOn:"2026-02-30"},secret)).toThrow();
    expect(()=>vetCreateFingerprint("pet-A",{...draft,specialty:""},secret)).toThrow();
    expect(()=>vetCreateFingerprint("bad%id",draft,secret)).toThrow("VET_CREATE_PET_INVALID");
  });
  it("V06 stable COMMITTED snapshot is replay (owner/pet existence checked separately)",()=>{
    const fingerprint=vetCreateFingerprint("pet-A",draft,secret);
    expect(vetCreateExistingReceiptDecision(receipt(fingerprint),fingerprint,current))
      .toBe("IDEMPOTENT_REPLAY");
  });
  it("V07 same UUID changed payload or operation kind conflicts",()=>{
    const fingerprint=vetCreateFingerprint("pet-A",draft,secret);
    expect(vetCreateExistingReceiptDecision(receipt(fingerprint),"0".repeat(64),current))
      .toBe("VET_CREATE_CONFLICT");
    expect(vetCreateExistingReceiptDecision({...receipt(fingerprint),operationKind:"DELETE"},fingerprint,current))
      .toBe("VET_CREATE_CONFLICT");
  });
  it("V08 expired, pending, deleted, missing snapshot -> UNKNOWN no recreation",()=>{
    const fingerprint=vetCreateFingerprint("pet-A",draft,secret);
    const r=receipt(fingerprint);
    for(const changed of [{...r,state:"PENDING"},{...r,visitId:null},
      {...r,responseJson:null},{...r,expiresAt:new Date("2026-10-17T07:00:00Z")}])
      expect(vetCreateExistingReceiptDecision(changed,fingerprint,current))
        .toBe("VET_CREATE_UNKNOWN");
  });
});
