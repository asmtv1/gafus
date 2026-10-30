import {apiRequest} from "../../shared/api/client";
export type PreventionType="VACCINATION"|"DEWORMING"|"TICKS_FLEAS";
export type ReminderKind="AFTER_DAYS"|"ON_DATE";
export type PreventionEntry={
  id:string;type:PreventionType;performedAt:string;productName:string|null;
  notes:string|null;reminderEnabled:boolean;reminderKind:ReminderKind;
  reminderDaysAfter:number|null;reminderOnDate:string|null;
  remindAt:string|null;reminderTimes:string[];
};
export type PreventionDraft={
  type:PreventionType;performedAt:string;productName?:string;notes?:string;
  reminderEnabled:boolean;reminderKind:ReminderKind;
  reminderDaysAfter?:number|null;reminderOnDate?:string|null;reminderTimes:string[];
};
const id=(value:unknown):value is string=>typeof value==="string"&&
  /^[A-Za-z0-9_-]{1,128}$/.test(value);
const object=(raw:unknown):Record<string,unknown>|null=>
  raw!==null&&typeof raw==="object"&&!Array.isArray(raw)?
    raw as Record<string,unknown>:null;
const optional=(value:unknown):value is string|null=>value==null||typeof value==="string";
const iso=(value:unknown):value is string=>typeof value==="string"&&
  Number.isFinite(Date.parse(value));
const time=(value:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const types=["VACCINATION","DEWORMING","TICKS_FLEAS"];
const kinds=["AFTER_DAYS","ON_DATE"];
export function projectPrevention(raw:unknown):PreventionEntry{
  const data=object(raw);
  if(!data||!id(data.id)||!types.includes(String(data.type))||
    !iso(data.performedAt)||!optional(data.productName)||!optional(data.notes)||
    typeof data.reminderEnabled!=="boolean"||
    !kinds.includes(String(data.reminderKind))||
    !(data.reminderDaysAfter==null||
      Number.isSafeInteger(data.reminderDaysAfter)&&Number(data.reminderDaysAfter)>=1&&
      Number(data.reminderDaysAfter)<=1095)||
    !(data.reminderOnDate==null||iso(data.reminderOnDate))||
    !(data.remindAt==null||iso(data.remindAt))||
    !(data.reminderTimes==null||Array.isArray(data.reminderTimes)&&
      data.reminderTimes.length>=1&&data.reminderTimes.length<=5&&
      data.reminderTimes.every((part:unknown)=>typeof part==="string"&&time(part))))
    throw Error("INVALID_PREVENTION_ENTRY");
  return {id:data.id,type:data.type as PreventionType,performedAt:data.performedAt,
    productName:data.productName??null,notes:data.notes??null,
    reminderEnabled:data.reminderEnabled,reminderKind:data.reminderKind as ReminderKind,
    reminderDaysAfter:typeof data.reminderDaysAfter==="number"?data.reminderDaysAfter:null,
    reminderOnDate:typeof data.reminderOnDate==="string"?data.reminderOnDate:null,
    remindAt:data.remindAt??null,reminderTimes:(data.reminderTimes??["09:00"]) as string[]};
}
export function projectPreventionList(raw:unknown):PreventionEntry[]{
  if(!Array.isArray(raw)||raw.length>2000)throw Error("INVALID_PREVENTION_LIST");
  const seen=new Set<string>();
  return raw.map(entry=>{
    const item=projectPrevention(entry);
    if(seen.has(item.id))throw Error("DUPLICATE_PREVENTION_ENTRY");
    seen.add(item.id);return item;
  });
}
const path=(petId:string,entryId?:string)=>{
  if(!id(petId)||(entryId!==undefined&&!id(entryId)))
    throw Error("INVALID_PREVENTION_ID");
  return "/api/v1/pets/"+petId+"/prevention"+
    (entryId===undefined?"":"/"+entryId);
};
export const listPetPrevention=(petId:string)=>
  apiRequest<unknown>(path(petId),{method:"GET",browserAuth:true})
    .then(projectPreventionList);
export const createPetPrevention=(petId:string,input:PreventionDraft)=>
  apiRequest<unknown>(path(petId),{method:"POST",browserAuth:true,
    json:input,expectedStatus:201}).then(projectPrevention);
export const updatePetPrevention=(petId:string,id:string,input:PreventionDraft)=>
  apiRequest<unknown>(path(petId,id),{method:"PUT",browserAuth:true,
    json:input,expectedStatus:200}).then(projectPrevention);
export const deletePetPrevention=(petId:string,id:string)=>
  apiRequest<unknown>(path(petId,id),{method:"DELETE",browserAuth:true,
    expectedStatus:200});
