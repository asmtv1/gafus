import {feedClient} from "./feedClient";
import type {FeedAuthorDto} from "@gafus/types";

/** WEB-URL-021 existing Hono Core read-only GET.
 * This is the user's own preference list, not a public profile DTO.
 */
export type HiddenAuthor=Pick<FeedAuthorDto,"id"|"username"|"name">;
export type HiddenAuthorsPage={items:HiddenAuthor[];nextCursor:string|null};
export type HiddenAuthorsReadTransport={
  fixtureKind:"AG2_HIDDEN_AUTHORS_OWNER_SYNTHETIC_GET_ONLY"|
    "AG2_HIDDEN_AUTHORS_HONO_GET_ONLY";
  status:()=>Promise<unknown>;
  list:(cursor:string|null)=>Promise<unknown>;
};
/** Existing AG1 owner-only GET; never alters follow/hidden preferences. */
export const hiddenAuthorsHonoRead:HiddenAuthorsReadTransport={
  fixtureKind:"AG2_HIDDEN_AUTHORS_HONO_GET_ONLY",
  status:()=>feedClient.status(),
  list:(cursor)=>feedClient.listHiddenAuthors({pageSize:20,
    ...(cursor===null?{}:{cursor})}),
};
/** Backward-compatible fixture type for the previous opt-in component tests. */
export type HiddenAuthorsSyntheticTransport=HiddenAuthorsReadTransport & {
  fixtureKind:"AG2_HIDDEN_AUTHORS_OWNER_SYNTHETIC_GET_ONLY";
};
const record=(value:unknown):Record<string,unknown>|null=>
  value!==null&&typeof value==="object"&&!Array.isArray(value)
    ?value as Record<string,unknown>:null;
const identifier=(v:unknown):v is string=>typeof v==="string"&&
  /^[A-Za-z0-9_-]{1,128}$/.test(v);
const safeUsername=(v:unknown):v is string=>
  typeof v==="string"&&/^[A-Za-z0-9_.-]{1,64}$/.test(v)&&
  !v.includes("..");
const safeTime=(v:unknown):v is string=>
  typeof v==="string"&&v.length<=40&&Number.isFinite(Date.parse(v));
export function projectHiddenAuthorsStatus(raw:unknown):{enabled:boolean}{
  const data=record(raw);
  if(!data||typeof data.enabled!=="boolean")throw Error("INVALID_FEED_STATUS");
  return {enabled:data.enabled};
}
export function projectHiddenAuthorsPage(raw:unknown):HiddenAuthorsPage{
  const page=record(raw);
  if(!page||!Array.isArray(page.items)||page.items.length>50||
    !safeTime(page.serverNow)||
    !(page.nextCursor===null||identifier(page.nextCursor)))
    throw Error("INVALID_HIDDEN_AUTHOR_PAGE");
  const seen=new Set<string>();
  const items:HiddenAuthor[]=page.items.map((value:unknown)=>{
    const row=record(value);
    if(!row||!identifier(row.id)||seen.has(row.id)||
      !safeUsername(row.username)||typeof row.name!=="string"||
      row.name.trim().length===0||row.name.length>140)
      throw Error("INVALID_HIDDEN_AUTHOR");
    seen.add(row.id);
    // Avatar URLs (including S3 signatures), private contact fields and
    // unrelated profile/roles are intentionally never cached or rendered.
    return {id:row.id,username:row.username,name:row.name};
  });
  return {items,nextCursor:page.nextCursor as string|null};
}
export async function getHiddenAuthorsAccess(){
  return projectHiddenAuthorsStatus(await feedClient.status());
}
/** Restore the current owner's hidden-author preference through the real Feed API. */
export async function restoreHiddenAuthor(authorId:string):Promise<void>{
  if(!identifier(authorId))throw Error("INVALID_HIDDEN_AUTHOR_ID");
  const ack=await feedClient.setAuthorPreference(authorId,{hidden:false});
  if(!ack||ack.hidden!==false)throw Error("INVALID_HIDDEN_AUTHOR_RESTORE_ACK");
}

export async function getMyHiddenAuthors(cursor:string|null=null){
  if(cursor!==null&&!identifier(cursor))throw Error("INVALID_HIDDEN_AUTHORS_CURSOR");
  const dto=await feedClient.listHiddenAuthors({pageSize:20,
    ...(cursor===null?{}:{cursor})});
  return projectHiddenAuthorsPage(dto);
}
