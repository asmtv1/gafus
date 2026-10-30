import { validatePetBirthDateInput } from "@gafus/core-client/validation/pet";
import type {PetDetails} from "./petApi";

/** Actual Hono contract is PUT /api/v1/pets/:petId, NOT PATCH,
 * with optional properties, no idempotency key for updates.
 * Synthetic-only transport is mandatory; never call apiRequest/fetch PUT here.
 */
export type PetEditPatch=Partial<Pick<PetDetails,"name"|"type"|"breed"|
  "birthDate"|"weightKg"|"heightCm"|"neckGirthCm"|
  "muzzleGirthCm"|"bellyGirthCm"|"notes"|"showInProfile">>;
export type PetEditWire={
  fixtureKind:"AG2_PET_EDIT_SYNTHETIC_ONLY";
  update:(request:{ownerId:string;method:"PUT";path:string;
    body:PetEditPatch})=>Promise<unknown>;
  readback:(request:{ownerId:string;method:"GET";path:string})=>Promise<unknown>;
};
export type PetEditOutcome=
  |{kind:"ACK_MOCK"}|{kind:"UNKNOWN"}
  |{kind:"REJECTED";status:number};
const id=(value:string)=>/^[A-Za-z0-9_-]{1,128}$/.test(value)&&
  value!=="."&&value!=="..";
export function petEditPath(petId:string){
  if(!id(petId))throw Error("INVALID_PET_ID");
  return "/api/v1/pets/"+petId;
}
export const allowedNumbers=["weightKg","heightCm","neckGirthCm",
  "muzzleGirthCm","bellyGirthCm"] as const;
export type PetEditDraft={
  name:string;type:"DOG"|"CAT";breed:string;birthDate:string;notes:string;
  weightKg:string;heightCm:string;neckGirthCm:string;
  muzzleGirthCm:string;bellyGirthCm:string;showInProfile:boolean;
};
export const toDraft=(pet:PetDetails):PetEditDraft=>({
  name:pet.name,type:pet.type==="CAT"?"CAT":"DOG",
  breed:pet.breed??"",birthDate:pet.birthDate?.slice(0,10)??"",
  notes:pet.notes??"",showInProfile:pet.showInProfile,
  weightKg:pet.weightKg?.toString()??"",
  heightCm:pet.heightCm?.toString()??"",
  neckGirthCm:pet.neckGirthCm?.toString()??"",
  muzzleGirthCm:pet.muzzleGirthCm?.toString()??"",
  bellyGirthCm:pet.bellyGirthCm?.toString()??"",
});
export type ValidatedPetEdit={ok:true;patch:PetEditPatch}|
  {ok:false;message:string};
export function validatePetEdit(before:PetDetails,draft:PetEditDraft):
  ValidatedPetEdit{
  const patch:PetEditPatch={};
  const name=draft.name.trim(),breed=draft.breed.trim(),notes=draft.notes.trim();
  if(name.length<2||name.length>50||
    !/^[а-яёА-ЯЁa-zA-Z\s-]+$/.test(name))
    return {ok:false,message:"Имя: 2–50 букв, пробелов или дефисов."};
  if(!["DOG","CAT"].includes(draft.type))
    return {ok:false,message:"Выберите вид питомца."};
  if(breed.length>50||(breed.length>0&&breed.length<2))
    return {ok:false,message:"Порода: от 2 до 50 символов."};
  if(notes.length>500)return {ok:false,message:"Заметки: не более 500 символов."};
  if(name!==before.name)patch.name=name;
  if(draft.type!==before.type)patch.type=draft.type;
  // Original Next treats an empty breed as absent. Hono forbids empty PUT
  // strings, so do not send a failing payload for an optional field.
  if(breed&&breed!==(before.breed??""))patch.breed=breed;
  if(notes!==(before.notes??""))patch.notes=notes;
  if(draft.showInProfile!==before.showInProfile)
    patch.showInProfile=draft.showInProfile;
  // Reuse the exact shared Next validator: DD.MM.YYYY and YYYY-MM-DD,
  // strict calendar day, minimum 1990-01-01 and no future birthdays.
  const birth=validatePetBirthDateInput(draft.birthDate);
  if(!birth.ok)return {ok:false,message:birth.message};
  // Normalize before comparing: a change of input format alone is not a PUT.
  if(birth.apiValue!==(before.birthDate?.slice(0,10)??""))
    patch.birthDate=birth.apiValue;
  for(const field of allowedNumbers){
    const input=draft[field].trim().replace(",",".");
    const previous=before[field];
    if(!input){
      // Hono updatePetSchema/Core explicitly accepts null for height and
      // circumference fields. Weight is still owned by the separate ledger.
      if(previous!==null&&previous!==undefined){
        if(field==="weightKg")return {
          ok:false,message:"Вес изменяется только через историю веса.",
        };
        patch[field]=null;
      }
      continue;
    }
    const value=Number(input);
    const min=field==="weightKg"?0.1:1;
    if(!/^\d+(?:\.\d{1,2})?$/.test(input)||
      !Number.isFinite(value)||value<min||value>200)return {
      ok:false,message:field==="weightKg"?
        "Вес должен быть от 0,1 до 200 кг.":"Измерение должно быть от 1 до 200 см.",
    };
    if(value!==previous)patch[field]=value;
  }
  if(Object.keys(patch).length===0)return {
    ok:false,message:"Изменений для сохранения нет.",
  };
  return {ok:true,patch};
}
const object=(value:unknown):Record<string,unknown>|null=>
  value!==null&&typeof value==="object"&&!Array.isArray(value)?
    value as Record<string,unknown>:null;
const snapshot=(raw:unknown,petId:string):Record<string,unknown>|null=>{
  const d=object(raw);
  if(!d||d.id!==petId||typeof d.name!=="string"||
    !["DOG","CAT"].includes(String(d.type))||
    !(d.breed===null||typeof d.breed==="string")||
    !(d.birthDate===null||typeof d.birthDate==="string")||
    !(d.notes===null||typeof d.notes==="string")||
    typeof d.showInProfile!=="boolean")return null;
  for(const field of allowedNumbers){
    if(d[field]!==undefined&&d[field]!==null&&
      (typeof d[field]!=="number"||!Number.isFinite(d[field])))
      return null;
  }
  return d;
};
export function classifyPetEditAck(raw:unknown,petId:string,
  patch:PetEditPatch):PetEditOutcome{
  const reply=object(raw);
  if(!reply)return {kind:"UNKNOWN"};
  const httpStatus=reply.httpStatus;
  if(typeof httpStatus!=="number")return {kind:"UNKNOWN"};
  if(httpStatus===200&&reply.success===true){
    const data=snapshot(reply.data,petId);
    if(!data)return {kind:"UNKNOWN"};
    return matchesPetPatch(data,patch)?{kind:"ACK_MOCK"}:{kind:"UNKNOWN"};
  }
  if([400,401,403,404,409,422,429].includes(httpStatus)&&
    reply.success===false)
    return {kind:"REJECTED",status:httpStatus};
  return {kind:"UNKNOWN"};
}
export function matchesPetPatch(raw:unknown,patch:PetEditPatch){
  const d=object(raw);
  if(!d)return false;
  return Object.entries(patch).every(([field,val])=>{
    const actual=d[field];
    if(field==="birthDate"&&typeof actual==="string")
      return actual.slice(0,10)===String(val);
    return actual===val;
  });
}
export function classifyPetReadback(raw:unknown,petId:string,
  patch:PetEditPatch):"MATCH_MOCK"|"NOT_PROVEN"{
  const snap=snapshot(raw,petId);
  return snap&&matchesPetPatch(snap,patch)?"MATCH_MOCK":"NOT_PROVEN";
}
export function petEditErrorCopy(status:number){
  if(status===400||status===422)return "Сервер не принял значения полей.";
  if(status===401)return "Сессия завершена. Войдите снова.";
  if(status===403)return "Редактирование этого питомца запрещено.";
  if(status===404)return "Питомец не найден или недоступен.";
  if(status===409)return "Данные конфликтуют с серверным состоянием.";
  if(status===429)return "Слишком много запросов. Попробуйте позднее.";
  return "Не удалось подтвердить сохранение.";
}
