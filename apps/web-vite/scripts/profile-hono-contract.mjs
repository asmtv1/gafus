/** AG2 reusable ordinary browser/Hono contract; no networking or secrets. */
export const PATH="/api/v1/user/profile";
export const deterministicReject=new Set([400,401,403,404,409,422,429]);
export function projection(raw){
  const p=raw?.profile;
  if(!raw||typeof raw.id!=="string"||typeof raw.username!=="string"||
    !p||typeof p!=="object"||!["fullName","city","about"].every(
      k=>p[k]===null||typeof p[k]==="string"))throw Error("INVALID_PROFILE_DTO");
  return {id:raw.id,username:raw.username,profile:{
    fullName:p.fullName,city:p.city,about:p.about}};
}
export function changedFields(before,draft){
  const out={};
  for(const [key,max] of [["fullName",120],["city",100],["about",2000]]){
    if(typeof draft[key]!=="string"||draft[key].trim().length>max)
      throw Error("INVALID_PROFILE_INPUT");
    const value=draft[key].trim();
    if(value!==(before[key]??""))out[key]=value;
  }
  return out;
}
export const matches=(current,owner,changes)=>current.id===owner &&
  Object.entries(changes).every(([key,value])=>current.profile[key]===value);
/**
 * Testable ordinary HTTP behavior. Identity must already be checked by caller.
 * This function sends at most one PUT, then one independent GET; never retries.
 * Mutation errors after a request could be committed => UNKNOWN except
 * explicit deterministic 4xx. A same-owner GET is necessary but does not
 * establish uniqueness of the preceding write.
 */
export async function executeProfileAttempt({owner,before,draft,wire,isCurrent}){
  if(!isCurrent(owner))return {kind:"FENCED",writes:0};
  const changes=changedFields(before.profile,draft);
  if(!Object.keys(changes).length)return {kind:"NO_CHANGES",writes:0};
  let ack;
  try{
    ack=await wire({owner,method:"PUT",path:PATH,changes});
  }catch{return {kind:"UNKNOWN",writes:1,changes};}
  if(!isCurrent(owner))return {kind:"FENCED",writes:1};
  if(ack?.status!==200 || ack?.success!==true){
    return {kind:deterministicReject.has(ack?.status)&&ack?.success===false?
      "REJECTED":"UNKNOWN",writes:1,status:deterministicReject.has(ack?.status)?
      ack.status:undefined,changes};
  }
  try{
    const got=await wire({owner,method:"GET",path:PATH});
    if(!isCurrent(owner))return {kind:"FENCED",writes:1};
    if(got?.status!==200||got?.success!==true)return {kind:"UNKNOWN",writes:1,changes};
    const readback=projection(got.data);
    return matches(readback,owner,changes)?
      {kind:"MATCHED_READBACK",writes:1,changes,readback}:
      {kind:"UNKNOWN",writes:1,changes};
  }catch{return {kind:"UNKNOWN",writes:1,changes};}
}
