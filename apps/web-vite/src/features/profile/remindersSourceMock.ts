/** Source/mounted synthetic-only Hono training reminder contract.
 * Hono GET/POST /reminders and PUT /reminders/:id; never direct browser network.
 * No WebPush/ServiceWorker/PWA code, no background notifications.
 */
export type TrainingReminder={
  id:string;name:string;enabled:boolean;reminderTime:string;
  reminderDays:string|null;timezone:string;
};
export type ReminderChanges=Partial<Pick<TrainingReminder,
  "name"|"enabled"|"reminderTime"|"reminderDays"|"timezone">>;
export type ReminderCreateBody=Pick<TrainingReminder,
  "name"|"reminderTime"|"reminderDays"|"timezone">;
import type {ReminderV2Transport} from "./reminderV2SourceCandidate";
export type SyntheticReminderTransport={
  fixtureKind:"AG2_REMINDER_SETTINGS_SYNTHETIC_ONLY";
  /** Optional AG4 V2 candidate, never ordinary Web HTTP. */
  v2?:ReminderV2Transport;
  list:(req:{ownerId:string;method:"GET";path:"/api/v1/reminders"})=>Promise<unknown>;
  update:(req:{ownerId:string;method:"PUT";path:string;
    changes:ReminderChanges})=>Promise<unknown>;
  /** Optional source-only Hono POST. Normal App cannot supply this fixture. */
  create?:(req:{ownerId:string;method:"POST";path:"/api/v1/reminders";
    body:ReminderCreateBody})=>Promise<unknown>;
  /** Hono DELETE /:id returns success envelope without data on 200. */
  delete?:(req:{ownerId:string;method:"DELETE";path:string})=>Promise<unknown>;
};
const validId=(v:unknown):v is string=>typeof v==="string"&&
  /^[A-Za-z0-9_-]{1,128}$/.test(v)&&v!=="."&&v!=="..";
export const reminderPath=(id:string)=>{
  if(!validId(id))throw Error("REMINDER_ID_INVALID");
  return "/api/v1/reminders/"+id;
};
export const timeOk=(v:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export const daysOk=(v:string|null)=>v===null||
  /^[1-7](,[1-7])*$/.test(v)&&
  new Set(v.split(",")).size===v.split(",").length;
export const tzOk=(v:string)=>{
  try{Intl.DateTimeFormat("ru-RU",{timeZone:v});return v.length<=100;}
  catch{return false;}
};
const plain=(v:unknown):Record<string,unknown>|null=>
  v!==null&&typeof v==="object"&&!Array.isArray(v)?
    v as Record<string,unknown>:null;
export function projectReminder(input:unknown):TrainingReminder{
  const v=plain(input);
  if(!v||!validId(v.id)||typeof v.name!=="string"||
    v.name.trim().length<1||v.name.length>100||
    typeof v.enabled!=="boolean"||typeof v.reminderTime!=="string"||
    !timeOk(v.reminderTime)||!(v.reminderDays===null||
      typeof v.reminderDays==="string"&&daysOk(v.reminderDays))||
    typeof v.timezone!=="string"||!tzOk(v.timezone))
    throw Error("REMINDER_DTO_INVALID");
  return {id:v.id,name:v.name,enabled:v.enabled,
    reminderTime:v.reminderTime,reminderDays:v.reminderDays,
    timezone:v.timezone};
}
export function projectReminders(input:unknown):TrainingReminder[]{
  if(!Array.isArray(input)||input.length>5)throw Error("REMINDER_LIST_INVALID");
  const rows=input.map(projectReminder),seen=new Set(rows.map(row=>row.id));
  if(rows.length!==seen.size)throw Error("REMINDER_DUPLICATE_ID");
  return rows;
}
export function validateReminderChanges(original:TrainingReminder,
  next:TrainingReminder):{ok:true;changes:ReminderChanges}|
    {ok:false;message:string}{
  if(original.id!==next.id)return {ok:false,message:"Напоминание изменилось."};
  const name=next.name.trim();
  if(!name||name.length>100)return {ok:false,message:"Название: 1–100 символов."};
  if(!timeOk(next.reminderTime))return {ok:false,message:"Время: ЧЧ:ММ, от 00:00 до 23:59."};
  if(!daysOk(next.reminderDays))return {ok:false,message:"Дни: от Пн до Вс без повторений."};
  if(!tzOk(next.timezone))return {ok:false,message:"Выберите допустимый часовой пояс."};
  const changes:ReminderChanges={};
  if(original.name!==name)changes.name=name;
  if(original.enabled!==next.enabled)changes.enabled=next.enabled;
  if(original.reminderTime!==next.reminderTime)changes.reminderTime=next.reminderTime;
  if(original.reminderDays!==next.reminderDays)changes.reminderDays=next.reminderDays;
  if(original.timezone!==next.timezone)changes.timezone=next.timezone;
  if(!Object.keys(changes).length)return {ok:false,message:"Нет изменений для сохранения."};
  return {ok:true,changes};
}
export function validateReminderCreate(body:ReminderCreateBody):
  {ok:true;body:ReminderCreateBody}|{ok:false;message:string}{
  const name=body.name.trim();
  if(!name||name.length>100)return {ok:false,message:"Название: 1–100 символов."};
  if(!timeOk(body.reminderTime))return {ok:false,message:"Время: ЧЧ:ММ."};
  if(!daysOk(body.reminderDays))
    return {ok:false,message:"Дни: от Пн до Вс без повторений."};
  if(!tzOk(body.timezone))
    return {ok:false,message:"Выберите допустимый часовой пояс."};
  return {ok:true,body:{name,reminderTime:body.reminderTime,
    reminderDays:body.reminderDays,timezone:body.timezone}};
}
export function matchesNewReminder(row:unknown,body:ReminderCreateBody){
  try{
    const projected=projectReminder(row);
    return projected.name===body.name&&
      projected.reminderTime===body.reminderTime&&
      projected.reminderDays===body.reminderDays&&
      projected.timezone===body.timezone;
  }catch{return false;}
}
export function classifyReminderCreateAck(raw:unknown,body:ReminderCreateBody):ReminderResult{
  const value=plain(raw);
  if(!value||typeof value.httpStatus!=="number")return {kind:"UNKNOWN"};
  if((value.httpStatus===200||value.httpStatus===201)&&value.success===true&&
    matchesNewReminder(value.data,body))return {kind:"ACK_MOCK"};
  if([400,401,403,404,409,422,429].includes(value.httpStatus)&&
    value.success===false)
    return {kind:"REJECTED",status:value.httpStatus};
  return {kind:"UNKNOWN"};
}
export type ReminderResult={kind:"ACK_MOCK"|"UNKNOWN"|"REJECTED";status?:number};
export function matchesReminder(snapshot:unknown,id:string,changes:ReminderChanges){
  try{
    const row=projectReminder(snapshot);
    return row.id===id&&Object.entries(changes).every(([k,v])=>
      row[k as keyof TrainingReminder]===v);
  }catch{return false;}
}
export function classifyReminderAck(raw:unknown,id:string,changes:ReminderChanges):ReminderResult{
  const v=plain(raw);
  if(!v||typeof v.httpStatus!=="number")return {kind:"UNKNOWN"};
  if(v.httpStatus===200&&v.success===true&&matchesReminder(v.data,id,changes))
    return {kind:"ACK_MOCK"};
  if([400,401,403,404,409,422,429].includes(v.httpStatus)&&v.success===false)
    return {kind:"REJECTED",status:v.httpStatus};
  return {kind:"UNKNOWN"};
}
export function classifyReminderDeleteAck(raw:unknown):ReminderResult{
  const v=plain(raw);
  if(!v||typeof v.httpStatus!=="number")return {kind:"UNKNOWN"};
  if(v.httpStatus===200&&v.success===true)return {kind:"ACK_MOCK"};
  if([400,401,403,404,409,422,429].includes(v.httpStatus)&&v.success===false)
    return {kind:"REJECTED",status:v.httpStatus};
  return {kind:"UNKNOWN"};
}
export function reminderListMatchesOperation(
  rows:TrainingReminder[],id:string,operation:"update"|"toggle"|"delete",
  changes:ReminderChanges|null,
):boolean{
  const item=rows.find(x=>x.id===id);
  if(operation==="delete")return !item;
  return !!item&&!!changes&&matchesReminder(item,id,changes);
}
export function reminderError(status:number|undefined):string{
  if(status===400||status===422)return "Значения напоминания отклонены сервером.";
  if(status===401)return "Сессия завершена. Войдите снова.";
  if(status===403)return "Нет доступа к настройкам напоминаний.";
  if(status===404)return "Напоминание не найдено.";
  if(status===409)return "Конфликт изменений. Проверьте данные.";
  if(status===429)return "Слишком много запросов.";
  return "Результат не подтверждён.";
}
export const dayLabels=["Пн","Вт","Ср","Чт","Пт","Сб","Вс"] as const;
