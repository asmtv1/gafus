import type {PetVetVisit} from "@gafus/types";

/** Legacy Next route, currently NOT exposed by Hono petsRoutes.
 * Never fetch this source/mock path in the Vite application.
 */
export const LEGACY_VET_VISITS_GET="/api/v1/pets/:petId/vet-visits";
const id=/^[A-Za-z0-9_-]{1,128}$/;
const record=(value:unknown):Record<string,unknown>|null=>
 value!==null&&typeof value==="object"&&!Array.isArray(value)?
  value as Record<string,unknown>:null;
const compact=(value:unknown,max:number):value is string=>
 typeof value==="string"&&value.length<=max;
const localDay=(value:unknown):value is string=>{
 if(typeof value!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value))return false;
 const date=new Date(value+"T12:00:00.000Z");
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
};
export type VetVisitsSourceWire={
 fixtureKind:"AG2_VET_VISITS_LEGACY_NEXT_GET_SYNTHETIC";
 list:(petId:string)=>Promise<unknown>;
};
export type VetVisitSafe=Pick<PetVetVisit,
 "id"|"petId"|"visitedOn"|"specialty"|"doctorName"|"clinic"|
 "diagnosis"|"conclusion"|"notes"> & {
 attachments:Pick<PetVetVisit["attachments"][number],
 "id"|"name"|"mimeType"|"sizeBytes"|"hasPreview"|"previewProcessing">[];
};
export function projectVetVisits(raw:unknown,petId:string):VetVisitSafe[]{
 if(!id.test(petId)||!Array.isArray(raw))
  throw Error("INVALID_VET_VISITS_LIST");
 const unique=new Set<string>();
 const visits=raw.map((v):VetVisitSafe=>{
  const row=record(v);
  if(!row||!id.test(String(row.id))||row.petId!==petId||
    unique.has(row.id as string)||!localDay(row.visitedOn)||
    !compact(row.specialty,200)||!compact(row.doctorName,200)||
    !compact(row.clinic,300)||!compact(row.diagnosis,10000)||
    !compact(row.conclusion,10000)||!compact(row.notes,10000)||
    !Array.isArray(row.attachments)||row.attachments.length>5)
   throw Error("INVALID_VET_VISIT_DTO");
  unique.add(row.id as string);
  const attachments=row.attachments.map((part)=>{
   const attachment=record(part);
   if(!attachment||!id.test(String(attachment.id))||
    !compact(attachment.name,256)||!["image/jpeg","image/png",
     "image/webp","application/pdf"].includes(String(attachment.mimeType))||
    !Number.isSafeInteger(attachment.sizeBytes)||
    (attachment.sizeBytes as number)<1||
    (attachment.sizeBytes as number)>10*1024*1024||
    typeof attachment.hasPreview!=="boolean"||
    !(attachment.previewProcessing===undefined||
     typeof attachment.previewProcessing==="boolean"))
    throw Error("INVALID_VET_ATTACHMENT");
   return {
    id:attachment.id as string,
    name:attachment.name as string,
    mimeType:attachment.mimeType as string,
    sizeBytes:attachment.sizeBytes as number,
    hasPreview:attachment.hasPreview as boolean,
    previewProcessing:attachment.previewProcessing as boolean|undefined,
   };
  });
  return {
   id:row.id as string,petId,visitedOn:row.visitedOn,
   specialty:row.specialty,doctorName:row.doctorName,clinic:row.clinic,
   diagnosis:row.diagnosis,conclusion:row.conclusion,notes:row.notes,
   attachments,
  } as VetVisitSafe;
 });
 // AG1 returns visitedOn DESC, createdAt DESC. Stable date sort preserves
 // the server's same-day createdAt order (createdAt is absent from DTO).
 return visits.sort((a,b)=>b.visitedOn.localeCompare(a.visitedOn));
}
export function legacyVetVisitsGetPath(petId:string){
 if(!id.test(petId))throw Error("INVALID_PET_ID");
 return "/api/v1/pets/"+petId+"/vet-visits";
}
