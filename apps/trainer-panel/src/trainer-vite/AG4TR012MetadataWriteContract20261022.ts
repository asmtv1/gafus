/**
 * AG4-TR-012 SOURCE/MOCK DESIGN ONLY. This is NOT a mounted write API.
 * Existing Core updateCourse() rewrites day/access relations, has no atomic
 * owner/revision CAS and MUST NOT be called with this narrow payload.
 */
import {z} from "zod/v3";

const courseIdPattern=/^[A-Za-z0-9_-]{1,128}$/;
const revisionPattern=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export const nameOnlyWriteProposal=z.object({
 courseId:z.string().regex(courseIdPattern),
 name:z.string().min(1).max(500),
 /** Proposed future wire revision: Course.updatedAt, absent from current draft GET. */
 observedUpdatedAt:z.string().regex(revisionPattern),
}).strict();
export type NameOnlyWriteProposal=z.infer<typeof nameOnlyWriteProposal>;
export function parseNameOnlyWriteProposal(raw:unknown):NameOnlyWriteProposal {
 const data=nameOnlyWriteProposal.parse(raw);
 const date=new Date(data.observedUpdatedAt);
 if(!Number.isFinite(date.getTime())||date.toISOString()!==data.observedUpdatedAt)
  throw Error("INVALID_REVISION");
 return data;
}
/** Honest current source guarantee. Does not implement CAS or authorize a write. */
export function classifyCurrentCoreWriteGuarantee(){
 return {readyForHttpWrite:false,supportedNow:"READ_ONLY",
  requiredBeforeWrite:"ATOMIC_OWNER_AND_REVISION_CAS",
  replayPolicy:"NO_AUTOMATIC_RETRY_AFTER_UNKNOWN"} as const;
}
