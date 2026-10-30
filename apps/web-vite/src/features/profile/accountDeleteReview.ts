/** WEB-URL-038 profile adapter metadata ONLY.
 * Canonical request paths, code validation, classification, one-shot
 * submit/session guards and review UI live in features/account/G04.
 * This module intentionally DOES NOT duplicate the G04 deletion consumer.
 */
import {G04_MOCK_ENDPOINTS} from "../account/g04SourceMockConsumer";
export const CODE_PATH=G04_MOCK_ENDPOINTS.requestCode;
export const DELETE_PATH=G04_MOCK_ENDPOINTS.deleteAccount;
export type SyntheticAccountDeletion={
  fixtureKind:"AG2_ACCOUNT_DELETE_REVIEW_SYNTHETIC_NEVER_REAL";
  eligibility:(req:{ownerId:string})=>Promise<unknown>;
  requestCode:(req:{ownerId:string;method:"POST";path:typeof CODE_PATH})=>Promise<unknown>;
  submit:(req:{ownerId:string;method:"POST";path:typeof DELETE_PATH;json:{code:string}})=>Promise<unknown>;
  readback:(req:{ownerId:string;method:"GET";path:"/api/v1/auth/me"})=>Promise<unknown>;
};
const object=(v:unknown):Record<string,unknown>|null=>
 v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;
/** Synthetic mail capability only; never copy email/address to the UI. */
export function projectDeletionEligibility(raw:unknown):{emailReady:boolean}{
 const r=object(raw);
 if(!r||typeof r.emailReady!=="boolean")throw Error("DELETE_ELIGIBILITY_INVALID");
 return {emailReady:r.emailReady};
}
/** Session state never demonstrates account deletion (even if 401). */
export function projectSessionReadback(raw:unknown):"active"|"unauthenticated"{
 const r=object(raw);
 if(!r||(r.active!==true&&r.active!==false))throw Error("DELETE_READBACK_UNKNOWN");
 return r.active?"active":"unauthenticated";
}
