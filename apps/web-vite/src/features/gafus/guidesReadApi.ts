import type {GafusMiniGuideDto} from "@gafus/types";
import {apiRequest} from "../../shared/api/client";

/** Existing Hono GETs; do not call POST /unlock or reconcile paid access. */
export type GuideListItem=Pick<GafusMiniGuideDto,
  "courseId"|"title"|"description"|"unlocked"|"canPurchase"|
  "price"|"expiresAt"|"accessSource">;
export type GuideRead={courseId:string;text:string};
export type GuidesSourceMock={
  fixtureKind:"AG2_GUIDES_SYNTHETIC_GET_ONLY";
  list:()=>Promise<unknown>;
  read:(courseId:string)=>Promise<unknown>;
};
const record=(v:unknown):Record<string,unknown>|null=>
  v!==null&&typeof v==="object"&&!Array.isArray(v)?
    v as Record<string,unknown>:null;
const id=(v:unknown):v is string=>
  typeof v==="string"&&/^[a-zA-Z0-9_-]{1,128}$/.test(v);
const bounded=(v:unknown,max:number):v is string=>
  typeof v==="string"&&v.length<=max;
const time=(v:unknown):v is string=>bounded(v,40)&&
  Number.isFinite(Date.parse(v));
const bad=():never=>{throw Error("INVALID_GUIDES_DTO");};
export function projectMiniGuides(raw:unknown):GuideListItem[]{
  if(!Array.isArray(raw)||raw.length>80)throw Error("INVALID_GUIDES_DTO");
  const unique=new Set<string>();
  return raw.map((entry:unknown)=>{
    const item=record(entry);
    if(!item||!id(item.courseId)||unique.has(item.courseId)||
      !bounded(item.title,180)||!item.title.trim()||
      !bounded(item.description,4000)||
      typeof item.unlocked!=="boolean"||
      typeof item.canPurchase!=="boolean"||
      !Number.isSafeInteger(item.price)||Number(item.price)<0||
      !bounded(item.accessSource,90)||
      !(item.expiresAt===null||time(item.expiresAt)))throw Error("INVALID_GUIDES_DTO");
    unique.add(item.courseId);
    // Strip image signed URLs and all unrelated server metadata.
    return {
      courseId:item.courseId as string,title:item.title as string,
      description:item.description as string,
      unlocked:item.unlocked as boolean,
      canPurchase:item.canPurchase as boolean,price:item.price as number,
      expiresAt:item.expiresAt as string|null,
      accessSource:item.accessSource as string,
    };
  });
}
function safePlainText(html:string):string{
  if(html.length>200_000)bad();
  // Don't render HTML / inline JS; use deterministic text extraction only.
  const cleaned=html.replace(/<(script|style|iframe|object|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&(?:nbsp|#160);/gi," ")
    .replace(/&amp;/gi,"&").replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">").replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'").replace(/\s+/g," ").trim();
  return cleaned.slice(0,30000);
}
export function projectGuideRead(raw:unknown,expectedId:string):GuideRead{
  const entry=record(raw);
  if(!id(expectedId)||!entry||entry.courseId!==expectedId||
    !bounded(entry.guideContent,200_000))throw Error("INVALID_GUIDES_DTO");
  return {courseId:expectedId,text:safePlainText(entry.guideContent as string)};
}
export async function getGuideCatalog(){
  return projectMiniGuides(await apiRequest<unknown>("/api/v1/gafus/mini-guides",{
    method:"GET",browserAuth:true,expectedStatus:200}));
}
export async function getAuthorizedGuide(courseId:string){
  if(!id(courseId))bad();
  return projectGuideRead(await apiRequest<unknown>(
    `/api/v1/gafus/mini-guide/${courseId}`,{
      method:"GET",browserAuth:true,expectedStatus:200,
    }),courseId);
}
