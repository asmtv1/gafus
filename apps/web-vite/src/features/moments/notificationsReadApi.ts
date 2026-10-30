import type {FeedNotificationDto} from "@gafus/types";
import {feedClient} from "./feedClient";

/** Existing Core/Hono GET /api/v1/feed/notifications. Never mutate read state. */
export type NotificationView=Pick<FeedNotificationDto,
  "id"|"kind"|"postId"|"readAt"|"createdAt"|"targetAvailable"|"actorCount"> & {
  commentId:string|null;
  actorNames:string[];
  actorProfiles:{username:string;name:string}[];
};
export type NotificationPage={items:NotificationView[];nextCursor:string|null};
export type NotificationReadWire={
  fixtureKind:"AG2_FEED_NOTIFICATIONS_SYNTHETIC_GET_ONLY"|
    "AG2_FEED_NOTIFICATIONS_HONO_GET_ONLY";
  status:()=>Promise<unknown>;
  list:(cursor:string|null)=>Promise<unknown>;
};
const obj=(v:unknown):Record<string,unknown>|null=>v&&typeof v==="object"&&
  !Array.isArray(v)?v as Record<string,unknown>:null;
const id=(v:unknown):v is string=>typeof v==="string"&&
  /^[a-zA-Z0-9_-]{1,128}$/.test(v);
const time=(v:unknown):v is string=>typeof v==="string"&&
  Number.isFinite(Date.parse(v))&&v.length<=40;
const kind:NotificationView["kind"][]=["author_post","comment","reply",
  "post_reaction","comment_reaction"];
export function projectNotificationStatus(raw:unknown):{enabled:boolean}{
  const value=obj(raw);
  if(!value||typeof value.enabled!=="boolean")throw Error("INVALID_FEED_ACCESS");
  return {enabled:value.enabled};
}
export function projectNotificationPage(raw:unknown):NotificationPage{
  const page=obj(raw);
  if(!page||!Array.isArray(page.items)||page.items.length>50||
    !(page.nextCursor===null||id(page.nextCursor))||
    !time(page.serverNow))throw Error("INVALID_NOTIFICATION_PAGE");
  const ids=new Set<string>();
  const items=page.items.map((data:unknown):NotificationView=>{
    const n=obj(data);
    if(!n||!id(n.id)||ids.has(n.id)||!id(n.postId)||
      !kind.includes(n.kind as NotificationView["kind"])||
      !(n.commentId===undefined||n.commentId===null||id(n.commentId))||
      !time(n.createdAt)||!(n.readAt===null||time(n.readAt))||
      !Number.isSafeInteger(n.actorCount)||Number(n.actorCount)<0||
      typeof n.targetAvailable!=="boolean"||!Array.isArray(n.actors)||
      n.actors.length>20)throw Error("INVALID_NOTIFICATION_ROW");
    ids.add(n.id);
    const actorProfiles=n.actors.map((entry:unknown)=>{
      const actor=obj(entry);
      if(!actor||!id(actor.id)||!id(actor.username)||
        typeof actor.name!=="string"||actor.name.length>140)
        throw Error("INVALID_NOTIFICATION_ACTOR");
      // Only already-public username/display name for profile navigation.
      // Never project actor ID, avatar/signed URL, contact or role.
      return {name:actor.name,username:actor.username as string};
    });
    return {id:n.id,kind:n.kind as NotificationView["kind"],
      postId:n.postId,commentId:(n.commentId??null) as string|null,
      readAt:n.readAt as string|null,
      createdAt:n.createdAt as string,targetAvailable:n.targetAvailable,
      actorCount:n.actorCount as number,
      actorNames:actorProfiles.map(actor=>actor.name),actorProfiles};
  });
  return {items,nextCursor:page.nextCursor as string|null};
}
/** Production read transport: exact registered AG1 GET, no mark-read calls. */
export const notificationHonoReadWire:NotificationReadWire={
  fixtureKind:"AG2_FEED_NOTIFICATIONS_HONO_GET_ONLY",
  status:()=>feedClient.status(),
  list:(cursor)=>feedClient.listNotifications({pageSize:20,
    ...(cursor===null?{}:{cursor})}),
};

/** Strict, owner-scoped mutations from the existing Feed Hono API (not fixtures). */
export async function markMomentNotificationRead(notificationId:string):Promise<void>{
  if(!id(notificationId))throw Error("INVALID_NOTIFICATION_ID");
  const ack=await feedClient.markNotificationRead(notificationId);
  if(ack?.id!==notificationId||!time(ack.readAt))
    throw Error("INVALID_NOTIFICATION_READ_ACK");
}
export async function markAllMomentNotificationsRead():Promise<void>{
  const ack=await feedClient.markAllNotificationsRead();
  if(!Number.isSafeInteger(ack?.count)||ack.count<0)
    throw Error("INVALID_NOTIFICATION_READ_ALL_ACK");
}

export async function getNotificationAccess(){
  return projectNotificationStatus(await feedClient.status());
}
export async function getNotificationHistory(cursor:string|null=null){
  if(cursor!==null&&!id(cursor))throw Error("INVALID_NOTIFICATION_CURSOR");
  const raw=await feedClient.listNotifications({pageSize:20,
    ...(cursor===null?{}:{cursor})});
  return projectNotificationPage(raw);
}
