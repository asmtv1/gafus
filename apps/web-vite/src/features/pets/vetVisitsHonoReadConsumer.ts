import {ApiError,apiRequest} from "../../shared/api/client";
import {projectVetVisits,type VetVisitSafe} from "./vetVisitsSourceMock";

/** Current AG1 shared Core/Next/Hono list/detail, source typed only.
 * AG4 10/10 packaged real SQL/JWT proof does NOT authorize Web live HTTP.
 * Source UI injects an in-process transport; these GETs are NOT used by App.
 */
const id=/^[A-Za-z0-9_-]{1,128}$/;
export const VET_HONO_LIST="/api/v1/pets/:petId/vet-visits";
export const VET_HONO_DETAIL="/api/v1/pets/:petId/vet-visits/:visitId";
export type VetHonoSourceReadWire={
 fixtureKind:"AG2_VET_HONO_LIST_DETAIL_SYNTHETIC_ONLY";
 list:(petId:string)=>Promise<unknown>;
 detail:(petId:string,visitId:string)=>Promise<unknown>;
};
export class VetVisitReadContractError extends Error{
 constructor(readonly status:number,readonly code:string){
  super("VET_READ_DENIED");this.name="VetVisitReadContractError";
 }
}
export function vetReadPath(petId:string,visitId?:string):string{
 if(!id.test(petId)||visitId!==undefined&&!id.test(visitId))
  throw new VetVisitReadContractError(404,"VET_VISIT_NOT_FOUND");
 return "/api/v1/pets/"+petId+"/vet-visits"+
  (visitId===undefined?"":"/"+visitId);
}
export function projectHonoVetList(raw:unknown,petId:string):VetVisitSafe[]{
 return projectVetVisits(raw,petId);
}
export function projectHonoVetDetail(raw:unknown,petId:string,visitId:string):
 VetVisitSafe{
 if(!id.test(visitId))throw new VetVisitReadContractError(404,"VET_VISIT_NOT_FOUND");
 const result=projectVetVisits([raw],petId)[0];
 if(!result||result.id!==visitId)
  throw new VetVisitReadContractError(404,"VET_VISIT_NOT_FOUND");
 return result;
}
export function vetReadFailure(error:unknown):"NOT_FOUND"|"UNAUTHORIZED"|"ERROR"{
 const status=error instanceof ApiError||error instanceof VetVisitReadContractError?
  error.status:
  typeof error==="object"&&error!==null&&"status" in error&&
  typeof error.status==="number"?error.status:0;
 if(status===404)return "NOT_FOUND";
 if(status===401||status===403)return "UNAUTHORIZED";
 return "ERROR";
}
/** AG1 structured400 RED/GREEN envelope reader, no mutation transport.
 * Never display message/raw clinical text or unknown fields.
 */
export type VetMutation400={
 code:"VET_VISIT_INVALID_JSON"|"VET_VISIT_VALIDATION_ERROR";
 fieldErrors:Partial<Record<"body"|"visitedOn"|"specialty"|"doctorName"|
  "clinic"|"diagnosis"|"conclusion"|"notes",
  "INVALID_JSON"|"INVALID_TYPE"|"REQUIRED"|"OUT_OF_RANGE"|"INVALID_VALUE">>;
};
export function vetMutation400FieldErrors(raw:unknown):VetMutation400|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const envelope=raw as Record<string,unknown>;
 if(envelope.success!==false||
  !["VET_VISIT_INVALID_JSON","VET_VISIT_VALIDATION_ERROR"].includes(
   String(envelope.code)))return null;
 const result:VetMutation400["fieldErrors"]={};
 const allowed=["body","visitedOn","specialty","doctorName","clinic",
  "diagnosis","conclusion","notes"];
 const codes=["INVALID_JSON","INVALID_TYPE","REQUIRED",
  "OUT_OF_RANGE","INVALID_VALUE"];
 if(envelope.fieldErrors&&typeof envelope.fieldErrors==="object"&&
  !Array.isArray(envelope.fieldErrors)){
  for(const [field,value] of Object.entries(envelope.fieldErrors)){
   if(allowed.includes(field)&&codes.includes(String(value)))
    Object.assign(result,{[field]:value});
  }
 }
 return {code:envelope.code as VetMutation400["code"],fieldErrors:result};
}
export async function sourceOnlyHonoVetListRead(petId:string){
 return projectHonoVetList(await apiRequest<unknown>(vetReadPath(petId),{
  method:"GET",browserAuth:true,
 }),petId);
}
export async function sourceOnlyHonoVetDetailRead(petId:string,visitId:string){
 return projectHonoVetDetail(await apiRequest<unknown>(
  vetReadPath(petId,visitId),{method:"GET",browserAuth:true}),petId,visitId);
}
