import {apiRequest,isolatedNonprodBrowserS3Url} from "../../shared/api/client";
import {GALLERY_LIMITS, GALLERY_MIME_TYPES} from "@gafus/types";
import type {GalleryUploadDto} from "@gafus/types";

/** Original Hono Gallery dispatcher; all mutations retain Core owner ACL.
 * The API returns short-lived signed media; never construct storage URLs.
 * Gallery DTO remains in volatile Query memory only, never localStorage.
 */
export type AlbumSummary={
  id:string;ownerId:string;ownerUsername:string;
  name:string;description:string|null;
  isVisible:boolean;canEdit:boolean;photoCount:number;
  coverThumbUrl:string|null;coverPhotoId?:string|null;urlsExpireAt:string|null;
};
export type AlbumPhoto={
  id:string;albumId:string;caption:string|null;status:
    "pending"|"processing"|"ready"|"moving"|"failed";
  thumbUrl:string|null;fullUrl:string|null;
  urlsExpireAt:string|null;width:number|null;height:number|null;
  /** Retry metadata is only projected for the authenticated owner. */
  uploadId?:string|null;errorMessage?:string|null;
};
export type GalleryPage<T>={
  items:T[];nextCursor:string|null;isOwner:boolean;
  enabled:boolean;usedSlots:number;limit:number;
};
export const GALLERY_PAGE_SIZE=20;
const identifier=(v:unknown):v is string=>
  typeof v==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const record=(v:unknown):Record<string,unknown>|null=>
  v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;
const optionalText=(v:unknown):v is string|null=>v===null||typeof v==="string";
const count=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
const expiryOk=(v:unknown):v is string|null=>v===null||
  typeof v==="string"&&Number.isFinite(Date.parse(v));
/** URL and expiry are API-owned. Missing, stale, http, data/blob, username
 * credentials and browser storage URLs are never rendered. No token logging.
 */
export function signedGalleryImage(url:unknown,expiry:unknown,now=Date.now()):string|null{
  if(typeof url!=="string"||url.length>4096||
    typeof expiry!=="string")return null;
  const expiresAt=Date.parse(expiry);
  if(!Number.isFinite(expiresAt)||expiresAt<=now+15_000)return null;
  try{
    const target=new URL(url);
    if(!((target.protocol==="https:" && !!target.hostname) ||
      isolatedNonprodBrowserS3Url(url,"gallery","signed-get")) ||
      target.username||target.password||target.hash)return null;
    return target.href;
  }catch{return null;}
}
function album(raw:unknown,ownerId:string,username:string):AlbumSummary{
  const d=record(raw);
  if(!d||!identifier(d.id)||d.ownerId!==ownerId||
    d.ownerUsername!==username||typeof d.name!=="string"||!d.name.trim()||
    !optionalText(d.description)||typeof d.isVisible!=="boolean"||
    typeof d.canEdit!=="boolean"||d.canEdit!==true||
    !count(d.photoCount)||!expiryOk(d.urlsExpireAt)||
    !(d.coverThumbUrl==null||typeof d.coverThumbUrl==="string")||
    !(d.coverPhotoId==null||identifier(d.coverPhotoId)))
    throw Error("GALLERY_OWNER_OR_SHAPE_MISMATCH");
  return {id:d.id,ownerId,ownerUsername:username,name:d.name,
    description:d.description,isVisible:d.isVisible,canEdit:d.canEdit,
    photoCount:d.photoCount,urlsExpireAt:d.urlsExpireAt,
    coverThumbUrl:signedGalleryImage(d.coverThumbUrl,d.urlsExpireAt),
    coverPhotoId:typeof d.coverPhotoId==="string"?d.coverPhotoId:null};
}
function basePage(raw:unknown){
  const d=record(raw);
  if(!d||!Array.isArray(d.items)||d.items.length>50||
    !(d.nextCursor===null||
      typeof d.nextCursor==="string"&&d.nextCursor.length>0&&d.nextCursor.length<=512)||
    typeof d.isOwner!=="boolean"||typeof d.enabled!=="boolean"||
    !count(d.usedSlots)||!count(d.limit))
    throw Error("INVALID_GALLERY_PAGE");
  return d;
}
export function projectOwnerAlbums(raw:unknown,ownerId:string,username:string)
:GalleryPage<AlbumSummary>{
  if(!identifier(ownerId)||!/^[A-Za-z0-9_-]{1,128}$/.test(username))
    throw Error("INVALID_GALLERY_PRINCIPAL");
  const d=basePage(raw);
  if(d.isOwner!==true)throw Error("GALLERY_OWNER_NOT_CONFIRMED");
  const seen=new Set<string>();
  const items=(d.items as unknown[]).map((value:unknown)=>{
    const a=album(value,ownerId,username);
    if(seen.has(a.id))throw Error("DUPLICATE_GALLERY_ALBUM");
    seen.add(a.id);return a;
  });
  return {items,nextCursor:d.nextCursor as string|null,
    isOwner:true,enabled:d.enabled as boolean,
    usedSlots:d.usedSlots as number,limit:d.limit as number};
}
function photo(raw:unknown,albumId:string,owner=false):AlbumPhoto{
  const d=record(raw);
  if(!d||!identifier(d.id)||d.albumId!==albumId||
    !optionalText(d.caption)||!["pending","processing","ready","moving","failed"]
      .includes(String(d.status))||
    !expiryOk(d.urlsExpireAt)||
    !(d.thumbUrl==null||typeof d.thumbUrl==="string")||
    !(d.fullUrl==null||typeof d.fullUrl==="string")||
    !(d.width===null||count(d.width))||
    !(d.height===null||count(d.height)))
    throw Error("INVALID_GALLERY_PHOTO");
  return {id:d.id,albumId,caption:d.caption,
    status:d.status as AlbumPhoto["status"],
    thumbUrl:d.status==="ready"?signedGalleryImage(d.thumbUrl,d.urlsExpireAt):null,
    fullUrl:d.status==="ready"?signedGalleryImage(d.fullUrl,d.urlsExpireAt):null,
    urlsExpireAt:d.urlsExpireAt,width:d.width,height:d.height,
    ...(owner&&d.status==="failed"?{
      uploadId:d.uploadId==null?null:identifier(d.uploadId)?d.uploadId:null,
      errorMessage:typeof d.errorMessage==="string"&&d.errorMessage.length<=300?
        d.errorMessage:null,
    }:{}),
  };
}
export function projectOwnerPhotos(raw:unknown,albumId:string):GalleryPage<AlbumPhoto>{
  const d=basePage(raw);
  if(d.isOwner!==true)throw Error("GALLERY_OWNER_NOT_CONFIRMED");
  const seen=new Set<string>();
  const items=(d.items as unknown[]).map((value:unknown)=>{
    const p=photo(value,albumId,true);
    if(seen.has(p.id))throw Error("DUPLICATE_GALLERY_PHOTO");
    seen.add(p.id);return p;
  });
  return {items,nextCursor:d.nextCursor as string|null,
    isOwner:true,enabled:d.enabled as boolean,
    usedSlots:d.usedSlots as number,limit:d.limit as number};
}
const cursorPart=(cursor:string|null):string=>{
  if(cursor===null)return "";
  if(cursor.length===0||cursor.length>512)throw Error("INVALID_GALLERY_CURSOR");
  return "&cursor="+encodeURIComponent(cursor);
};
/** Own gallery only for first migration slice; other people's public albums
 * and cross-profile sharing remain separate gated slices.
 */
export async function listMyAlbums(userId:string,username:string,cursor:string|null=null):
Promise<GalleryPage<AlbumSummary>>{
  if(!identifier(userId)||!/^[A-Za-z0-9_-]{1,128}$/.test(username))
    throw Error("INVALID_GALLERY_PRINCIPAL");
  const raw=await apiRequest<unknown>(
    "/api/v1/gallery/profiles/"+encodeURIComponent(username)+
      "/albums?pageSize=20"+cursorPart(cursor),
    {method:"GET",browserAuth:true});
  return projectOwnerAlbums(raw,userId,username);
}
export async function getMyAlbum(albumId:string,userId:string,username:string):
Promise<AlbumSummary>{
  if(!identifier(albumId)||!identifier(userId))throw Error("INVALID_GALLERY_ID");
  const raw=await apiRequest<unknown>("/api/v1/gallery/albums/"+albumId,
    {method:"GET",browserAuth:true});
  return album(raw,userId,username);
}
/** Server-authorized Cloud.ru recovery is opt-in on the server and must be
 * invoked only after a verified signed CDN 5xx. Never derive private S3 keys. */
export async function requestGalleryMediaFallback(photoId:string,variant:"thumb"|"full"):
Promise<string>{
  if(!identifier(photoId))throw Error("INVALID_GALLERY_ID");
  const result=await apiRequest<unknown>(
    "/api/v1/gallery/photos/"+encodeURIComponent(photoId)+"/fallback",
    {method:"POST",browserAuth:true,json:{variant}});
  const data=record(result);
  if(data?.source!=="cloudru"||typeof data.url!=="string"||
    !data.url.startsWith("https://s3.cloud.ru/")||
    !signedGalleryImage(data.url,data.expiresAt))
    throw Error("INVALID_GALLERY_FALLBACK");
  return data.url;
}

export async function listMyPhotos(albumId:string,cursor:string|null=null):
Promise<GalleryPage<AlbumPhoto>>{
  if(!identifier(albumId))throw Error("INVALID_GALLERY_ID");
  const raw=await apiRequest<unknown>(
    "/api/v1/gallery/albums/"+albumId+"/photos?pageSize=20"+cursorPart(cursor),
    {method:"GET",browserAuth:true,signal:AbortSignal.timeout(15_000)});
  return projectOwnerPhotos(raw,albumId);
}

/** Next /profile/albums?username=<other>: server-owned public visibility
 * only. This projection never accepts a foreign owner/edit permission, even
 * when a test transport returns forged canEdit or a hidden album. */
function publicAlbum(raw:unknown,viewerId:string,username:string):AlbumSummary{
  const d=record(raw);
  if(!identifier(viewerId)||!/^[A-Za-z0-9_-]{1,128}$/.test(username)||
    !d||!identifier(d.id)||!identifier(d.ownerId)||d.ownerId===viewerId||
    d.ownerUsername!==username||typeof d.name!=="string"||!d.name.trim()||
    !optionalText(d.description)||d.isVisible!==true||d.canEdit!==false||
    !count(d.photoCount)||!expiryOk(d.urlsExpireAt)||
    !(d.coverThumbUrl==null||typeof d.coverThumbUrl==="string")||
    !(d.coverPhotoId==null||identifier(d.coverPhotoId)))
    throw Error("GALLERY_PUBLIC_SCOPE_MISMATCH");
  return {id:d.id,ownerId:d.ownerId,ownerUsername:username,name:d.name,
    description:d.description,isVisible:true,canEdit:false,
    photoCount:d.photoCount,urlsExpireAt:d.urlsExpireAt,
    coverThumbUrl:signedGalleryImage(d.coverThumbUrl,d.urlsExpireAt),
    coverPhotoId:typeof d.coverPhotoId==="string"?d.coverPhotoId:null};
}
export function projectPublicAlbums(raw:unknown,viewerId:string,username:string):
GalleryPage<AlbumSummary>{
  const d=basePage(raw);
  if(d.isOwner!==false)throw Error("GALLERY_PUBLIC_OWNER_MISMATCH");
  const seen=new Set<string>();
  const items=(d.items as unknown[]).map(item=>{
    const value=publicAlbum(item,viewerId,username);
    if(seen.has(value.id))throw Error("GALLERY_PUBLIC_DUPLICATE");
    seen.add(value.id);return value;
  });
  return {items,nextCursor:d.nextCursor as string|null,isOwner:false,
    usedSlots:0,limit:d.limit as number,enabled:d.enabled as boolean};
}
export function projectPublicPhotos(raw:unknown,albumId:string):GalleryPage<AlbumPhoto>{
  const d=basePage(raw);
  if(d.isOwner!==false||!identifier(albumId))
    throw Error("GALLERY_PUBLIC_PHOTO_OWNER_MISMATCH");
  const seen=new Set<string>();
  const items=(d.items as unknown[]).map(item=>{
    const value=photo(item,albumId);
    // Original Core returns only published ready/moving photos for others.
    // Never render pending/failed or an unprocessed private thumbnail.
    if(value.status!=="ready"||seen.has(value.id))
      throw Error("GALLERY_PUBLIC_UNPUBLISHED_PHOTO");
    seen.add(value.id);return value;
  });
  return {items,nextCursor:d.nextCursor as string|null,isOwner:false,
    usedSlots:0,limit:d.limit as number,enabled:d.enabled as boolean};
}
export async function listPublicAlbums(viewerId:string,username:string,
  cursor:string|null=null):Promise<GalleryPage<AlbumSummary>>{
  if(!identifier(viewerId)||!/^[A-Za-z0-9_-]{1,128}$/.test(username))
    throw Error("GALLERY_PUBLIC_ID_INVALID");
  const raw=await apiRequest<unknown>(
    "/api/v1/gallery/profiles/"+encodeURIComponent(username)+
      "/albums?pageSize=20"+cursorPart(cursor),
    {method:"GET",browserAuth:true,expectedStatus:200});
  return projectPublicAlbums(raw,viewerId,username);
}
export async function getPublicAlbum(albumId:string,viewerId:string,
  username:string):Promise<AlbumSummary>{
  if(!identifier(albumId)||!identifier(viewerId))throw Error("GALLERY_PUBLIC_ID_INVALID");
  const raw=await apiRequest<unknown>("/api/v1/gallery/albums/"+albumId,
    {method:"GET",browserAuth:true,expectedStatus:200});
  const parsed=publicAlbum(raw,viewerId,username);
  if(parsed.id!==albumId)throw Error("GALLERY_PUBLIC_ID_MISMATCH");
  return parsed;
}
export async function listPublicPhotos(albumId:string,cursor:string|null=null):
Promise<GalleryPage<AlbumPhoto>>{
  if(!identifier(albumId))throw Error("GALLERY_PUBLIC_ID_INVALID");
  const raw=await apiRequest<unknown>(
    "/api/v1/gallery/albums/"+albumId+"/photos?pageSize=20"+cursorPart(cursor),
    {method:"GET",browserAuth:true,expectedStatus:200});
  return projectPublicPhotos(raw,albumId);
}

/** Existing original Hono write routes; only ACK + fresh owner GET counts as
 * confirmed persistence. Every value returned to the UI is owner-projected.
 * A transport error may follow a committed write: never blind-resubmit it.
 */
const pathId=(id:string)=>{
  if(!identifier(id))throw Error("INVALID_GALLERY_ID");
  return encodeURIComponent(id);
};
const write=<T>(path:string,method:"POST"|"PATCH"|"PUT"|"DELETE",json?:unknown)=>
  apiRequest<T>(path,{method,browserAuth:true,...(json===undefined?{}:{json})});

export type AlbumDraft={name:string;description:string|null;isVisible:boolean};
export type GalleryAlbumCommands={
  create:(draft:AlbumDraft)=>Promise<unknown>;
  update:(id:string,draft:AlbumDraft)=>Promise<unknown>;
  remove:(id:string)=>Promise<unknown>;
  updateCaption:(id:string,caption:string|null)=>Promise<unknown>;
  removePhoto:(id:string)=>Promise<unknown>;
  setCover:(id:string,photoId:string|null)=>Promise<unknown>;
  movePhoto:(id:string,targetAlbumId:string,requestId:string)=>Promise<unknown>;
};
export const galleryAlbumCommands:GalleryAlbumCommands={
  create:(draft)=>write("/api/v1/gallery/albums","POST",draft),
  update:(id,draft)=>write("/api/v1/gallery/albums/"+pathId(id),"PATCH",draft),
  remove:(id)=>write("/api/v1/gallery/albums/"+pathId(id),"DELETE"),
  updateCaption:(id,caption)=>write("/api/v1/gallery/photos/"+pathId(id),"PATCH",{caption}),
  removePhoto:(id)=>write("/api/v1/gallery/photos/"+pathId(id),"DELETE"),
  setCover:(id,photoId)=>write("/api/v1/gallery/albums/"+pathId(id)+"/cover","PUT",{photoId}),
  movePhoto:(id,albumId,requestId)=>write("/api/v1/gallery/photos/"+pathId(id)+"/move",
    "POST",{albumId: pathId(albumId),clientRequestId:requestId}),
};

export function albumWriteAck(raw:unknown,ownerId:string,username:string,id?:string){
  const data=album(raw,ownerId,username);
  if(id!==undefined&&data.id!==id)throw Error("GALLERY_WRITE_ACK_MISMATCH");
  return data;
}
export function albumDraftMatches(actual:AlbumSummary,draft:AlbumDraft){
  return actual.name===draft.name.trim()&&
    actual.description===draft.description&&actual.isVisible===draft.isVisible;
}
export function deleteAckMatches(raw:unknown,id:string){
  return record(raw)?.id===id;
}
/** Short-lived upload reservation stays only in component memory. No signed
 * S3 URLs, private keys or form fields go into logs, telemetry or storage.
 */
export async function reserveGalleryPhoto(albumId:string,file:File,caption:string|null,
  requestId:string):Promise<GalleryUploadDto>{
  if(!identifier(albumId)||
    !GALLERY_MIME_TYPES.includes(file.type as typeof GALLERY_MIME_TYPES[number])||
    file.size<=0||file.size>GALLERY_LIMITS.photoBytes||
    !file.name||
    file.name.length>255||!(/^[a-f0-9-]{36}$/i.test(requestId)))
    throw Error("INVALID_GALLERY_FILE");
  return write<GalleryUploadDto>(
    "/api/v1/gallery/albums/"+pathId(albumId)+"/uploads","POST",{
      albumId,filename:file.name,declaredMime:file.type,
      declaredBytes:file.size,caption,clientRequestId:requestId,
    });
}
export function uploadReservationValid(raw:unknown,albumId:string):raw is GalleryUploadDto {
  const d=record(raw);
  if(!d||!identifier(d.uploadId)||d.albumId!==albumId||
    d.status!=="reserved"||typeof d.reservationExpiresAt!=="string"||
    Date.parse(d.reservationExpiresAt)<=Date.now()+15_000||
    typeof d.postUrl!=="string"||!record(d.postFields))return false;
  try{
    const u=new URL(d.postUrl);
    return ((u.protocol==="https:" && !!u.hostname) ||
      isolatedNonprodBrowserS3Url(d.postUrl,"gallery","form-post")) &&
      !u.username&&!u.password&&!u.hash;
  }catch{return false;}
}
export async function uploadGalleryForm(reservation:GalleryUploadDto,file:File,
  signal:AbortSignal):Promise<void>{
  if(!reservation.postUrl||!reservation.postFields||
    !uploadReservationValid(reservation,reservation.albumId))
    throw Error("GALLERY_UPLOAD_RESERVATION_EXPIRED");
  const body=new FormData();
  for(const [key,value] of Object.entries(reservation.postFields))body.append(key,value);
  body.append("file",file,file.name);
  // Signed external POST is the ONLY non-relative request; destination comes
  // from the validated reservation, never from untrusted form input.
  const response=await fetch(reservation.postUrl,{method:"POST",body,signal,
    credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer"});
  if(!response.ok)throw Error("GALLERY_STORAGE_WRITE_UNCONFIRMED");
}
/** Browser upload transport with genuine byte progress, matching the Next
 * gallery queue. It never retries external multipart POST after uncertain ACK. */
export function uploadGalleryFormWithProgress(
  reservation:GalleryUploadDto,file:File,signal:AbortSignal,
  onProgress:(percentage:number)=>void,
):Promise<void>{
  if(!reservation.postUrl||!reservation.postFields||
    !uploadReservationValid(reservation,reservation.albumId))
    return Promise.reject(Error("GALLERY_UPLOAD_RESERVATION_EXPIRED"));
  if(signal.aborted)return Promise.reject(Error("GALLERY_UPLOAD_ABORTED"));
  return new Promise<void>((resolve,reject)=>{
    const request=new XMLHttpRequest();
    let settled=false;
    const abort=()=>request.abort();
    const done=(error?:Error)=>{
      if(settled)return;
      settled=true;
      signal.removeEventListener("abort",abort);
      if(error)reject(error);else resolve();
    };
    signal.addEventListener("abort",abort,{once:true});
    request.open("POST",reservation.postUrl!);
    request.timeout=120_000;
    request.withCredentials=false;
    request.upload.onprogress=(event)=>{
      if(settled||signal.aborted||!event.lengthComputable||event.total<=0)return;
      onProgress(Math.max(0,Math.min(99,Math.floor(100*event.loaded/event.total))));
    };
    request.onload=()=>{
      if(request.status>=200&&request.status<300){onProgress(100);done();}
      else done(Error("GALLERY_STORAGE_WRITE_UNCONFIRMED"));
    };
    request.onerror=()=>done(Error("GALLERY_STORAGE_NETWORK_UNCONFIRMED"));
    request.ontimeout=()=>done(Error("GALLERY_STORAGE_TIMEOUT_UNCONFIRMED"));
    request.onabort=()=>done(Error("GALLERY_UPLOAD_ABORTED_UNCONFIRMED"));
    const form=new FormData();
    for(const [key,value] of Object.entries(reservation.postFields!))form.append(key,value);
    form.append("file",file,file.name);
    try{request.send(form);}catch{done(Error("GALLERY_STORAGE_SEND_UNCONFIRMED"));}
  });
}

export const confirmGalleryPhoto=(id:string)=>
  write<GalleryUploadDto>("/api/v1/gallery/uploads/"+pathId(id)+"/complete","POST",{});
export const galleryUploadStatus=(id:string)=>
  apiRequest<GalleryUploadDto>("/api/v1/gallery/uploads/"+pathId(id),
    {method:"GET",browserAuth:true,signal:AbortSignal.timeout(15_000)});
/** Server tombstone must be verified by a subsequent owner-only GET.
 * DELETE is not blindly replayed when the transport acknowledgement is lost. */
export const cancelGalleryUpload=(id:string)=>
  write<GalleryUploadDto>("/api/v1/gallery/uploads/"+pathId(id),"DELETE");
/** Create a distinct retried upload from a server-confirmed terminal failure.
 * Caller MUST keep requestId stable on an uncertain acknowledgement. */
export const retryGalleryUpload=(id:string,requestId:string)=>{
  if(!/^[a-f0-9-]{36}$/i.test(requestId))throw Error("INVALID_GALLERY_RETRY_ID");
  return write<GalleryUploadDto>("/api/v1/gallery/uploads/"+pathId(id)+"/retry",
    "POST",{clientRequestId:requestId});
};

export const getMyPhoto=(id:string,albumId:string)=>
  apiRequest<unknown>("/api/v1/gallery/photos/"+pathId(id),
    {method:"GET",browserAuth:true}).then(value=>photo(value,albumId,true));


// Cover ID is internal control-plane data: validate it only inside this
// one-shot ACK/readback check, never in cached AlbumSummary or page DOM.
export function galleryCoverAckMatches(raw:unknown,ownerId:string,
  username:string,albumId:string,photoId:string|null){
  try{
    const projected=albumWriteAck(raw,ownerId,username,albumId);
    return projected.canEdit&&record(raw)?.coverPhotoId===photoId;
  }catch{return false;}
}
export async function verifiedGalleryCover(albumId:string,ownerId:string,
  username:string,photoId:string|null){
  const raw=await apiRequest<unknown>("/api/v1/gallery/albums/"+pathId(albumId),
    {method:"GET",browserAuth:true});
  return galleryCoverAckMatches(raw,ownerId,username,albumId,photoId);
}
