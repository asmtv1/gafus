/** WEB-URL-051: existing Next-only POST /api/excuses, NOT mounted in Hono.
 * Public synthetic-only provider; no OpenRouter/provider HTTP in Vite.
 */
export const EXCUSES_NEXT_ONLY_PATH="/api/excuses" as const;
export const EXCUSE_OPTIONS=[
 {id:"late-work",label:"Опоздал на работу",description:"Уважительная причина задержки без лишней драмы."},
 {id:"homework",label:"Не сделал домашку",description:"Признать ответственность перед преподавателем."},
 {id:"birthday",label:"Забыл про день рождения",description:"Тёплое извинение без формальности."},
 {id:"missed-meeting",label:"Пропустил встречу",description:"Предложить быстро исправить ситуацию."},
 {id:"ignored-message",label:"Не ответил на сообщение",description:"Тактичное объяснение без обесценивания."},
] as const;
export type ExcuseSituation=(typeof EXCUSE_OPTIONS)[number]["id"];
export type ExcuseResult={excuse:string;plausibility:number;tone:string};
export type ExcuseFixture={
 fixtureKind:"AG2_PUBLIC_EXCUSES_SYNTHETIC_PROVIDER_ONLY";
 generate:(request:{method:"POST";path:typeof EXCUSES_NEXT_ONLY_PATH;
  json:{situationId:ExcuseSituation};signal:AbortSignal})=>Promise<unknown>;
};
export function validSituation(input:unknown):input is ExcuseSituation{
 return typeof input==="string"&&EXCUSE_OPTIONS.some(x=>x.id===input);
}
export function buildExcuseRequest(situationId:unknown,signal:AbortSignal){
 if(!validSituation(situationId))throw Error("UNKNOWN_EXCUSE_SITUATION");
 return {method:"POST" as const,path:EXCUSES_NEXT_ONLY_PATH,
  json:{situationId},signal};
}
export function projectExcuseResult(payload:unknown):ExcuseResult{
 if(!payload||typeof payload!=="object"||Array.isArray(payload))
  throw Error("INVALID_EXCUSE_ENVELOPE");
 const outer=payload as Record<string,unknown>;
 if(outer.success!==true||!outer.data||typeof outer.data!=="object"||
  Array.isArray(outer.data))throw Error("INVALID_EXCUSE_ENVELOPE");
 const row=outer.data as Record<string,unknown>;
 if(typeof row.excuse!=="string"||row.excuse.trim().length<20||
  row.excuse.length>1000||typeof row.tone!=="string"||
  row.tone.trim().length<1||row.tone.length>80||
  typeof row.plausibility!=="number"||!Number.isInteger(row.plausibility)||
  row.plausibility<35||row.plausibility>96)
  throw Error("INVALID_EXCUSE_DTO");
 return {excuse:row.excuse.trim(),plausibility:row.plausibility,tone:row.tone.trim()};
}
