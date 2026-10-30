import {apiRequest} from "../../shared/api/client";

import {projectPost,projectComment,projectCommentsPage,
  type MomentItem,type MomentComment,type MomentCommentsPage} from "./momentsApi";
const id=(v:unknown):v is string=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const obj=(v:unknown):Record<string,unknown>|null=>
 v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;
const cursor=(v:unknown):v is string=>typeof v==="string"&&
 v.length>=1&&v.length<=512&&!Array.from(v).some(c=>{
  const cp=c.codePointAt(0)??0;return cp<32||cp===127;
 });
export type DetailWire={
 fixtureKind:"AG2_POST_DETAIL_SYNTHETIC_GET_ONLY";
 post:(id:string)=>Promise<unknown>;
 comments:(postId:string,cursor:string|null)=>Promise<unknown>;
 focused:(id:string)=>Promise<unknown>;
};
export function projectDetailPost(raw:unknown,requested:string):MomentItem{
 if(!id(requested))throw Error("INVALID_POST_ID");
 const value=projectPost(raw);
 if(value.id!==requested)throw Error("FOREIGN_POST_RESPONSE");
 return value;
}
export function projectDetailComments(raw:unknown,postId:string):MomentCommentsPage{
 const input=obj(raw);
 if(!id(postId)||!input||!Array.isArray(input.items)||input.items.length>100||
   !(input.nextCursor===null||cursor(input.nextCursor)))throw Error("INVALID_COMMENT_PAGE");
 const ids=new Set<string>();
 for(const entry of input.items){
   const row=obj(entry);
   if(!row||row.postId!==postId||!id(row.id)||ids.has(row.id))
     throw Error("FOREIGN_OR_DUPLICATE_COMMENT");
   ids.add(row.id);
 }
 return projectCommentsPage(raw);
}
export function projectFocusedComment(raw:unknown,postId:string,commentId:string):MomentComment{
 const row=obj(raw);
 if(!id(postId)||!id(commentId)||!row||row.postId!==postId||row.id!==commentId)
   throw Error("FOREIGN_FOCUSED_COMMENT");
 return projectComment(raw);
}
/** One bounded, unambiguous notification comment anchor. */
export function focusedMomentCommentId(search: string): string | null {
  const values = new URLSearchParams(search).getAll("commentId");
  if (values.length !== 1) return null;
  return /^[A-Za-z0-9_-]{1,128}$/.test(values[0]) ? values[0] : null;
}
export const detailCommentId=focusedMomentCommentId;
export async function getPostDetailRead(postId:string){
 if(!id(postId))throw Error("INVALID_POST_ID");
 return projectDetailPost(await apiRequest<unknown>(`/api/v1/feed/posts/${postId}`,
   {method:"GET",browserAuth:true,expectedStatus:200}),postId);
}
export async function getPostDetailComments(postId:string,nextCursor:string|null=null){
 if(!id(postId)||(nextCursor!==null&&!cursor(nextCursor)))throw Error("INVALID_COMMENT_CURSOR");
 return projectDetailComments(await apiRequest<unknown>(
   `/api/v1/feed/posts/${postId}/comments?pageSize=20${nextCursor===null?"":"&cursor="+encodeURIComponent(nextCursor)}`,
   {method:"GET",browserAuth:true,expectedStatus:200}),postId);
}
export async function getPostFocusedComment(postId:string,commentId:string){
 if(!id(postId)||!id(commentId))throw Error("INVALID_FOCUS_ID");
 return projectFocusedComment(await apiRequest<unknown>(
   `/api/v1/feed/comments/${commentId}`,
   {method:"GET",browserAuth:true,expectedStatus:200}),postId,commentId);
}
