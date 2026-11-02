/** AG1 G16: execute genuine Core Gallery ownership guards with injected
 * in-memory GalleryTx port. No Prisma Client, no database, no cloud/Redis. */
import { describe, it, expect, vi } from "vitest";
import { albumFor, photoFor, uploadFor } from "../../../../../packages/core/src/services/gallery/persistence";
import { GalleryError } from "../../../../../packages/core/src/services/gallery/errors";
import { photoDto, albumDto, uploadDto } from "../../../../../packages/core/src/services/gallery/dto";

const A="actor-a", B="actor-b";
const album=(isVisible:boolean)=>({id:"album-a",ownerId:A,owner:{username:"actor-a"},isVisible,deletedAt:null});
const photo=(status:string)=>({id:"photo-a",albumId:"album-a",ownerId:A,status,deletedAt:null});
const uploaded=()=>({id:"upload-a",ownerId:A,photo:{albumId:"album-a",deletedAt:null}});
function txStore(opts:{visible:boolean,photoStatus?:string|null,hasUpload?:boolean}) {
 const albumFind=vi.fn().mockResolvedValue(album(opts.visible));
 const photoFind=vi.fn().mockResolvedValue(opts.photoStatus===null?null:photo(opts.photoStatus??"ready"));
 const uploadFind=vi.fn().mockResolvedValue(opts.hasUpload===false?null:uploaded());
 const tx={galleryAlbum:{findFirst:albumFind},galleryPhoto:{findFirst:photoFind},galleryUpload:{findUnique:uploadFind}};
 return {tx:tx as never,albumFind,photoFind,uploadFind};
}
describe("G16 Core ownership/privacy proofs with genuine persistence guards",()=>{
 it("GAL-CORE-01 private album foreign read gives 404; public album read allowed, foreign edit gives 403",async()=>{
  const privateStore=txStore({visible:false});
  await expect(albumFor(privateStore.tx,B,"album-a")).rejects.toMatchObject({code:"NOT_FOUND",status:404});
  expect(privateStore.albumFind).toHaveBeenCalledTimes(1);
  await expect(albumFor(privateStore.tx,A,"album-a")).resolves.toMatchObject({ownerId:A});
  const publicStore=txStore({visible:true});
  await expect(albumFor(publicStore.tx,B,"album-a")).resolves.toMatchObject({ownerId:A});
  await expect(albumFor(publicStore.tx,B,"album-a",true)).rejects.toMatchObject({code:"FORBIDDEN",status:403});
 });
 it("GAL-CORE-02 private photo and pending photo cannot be seen by B; ready public photo read only",async()=>{
  const privateStore=txStore({visible:false});
  await expect(photoFor(privateStore.tx,B,"photo-a")).rejects.toMatchObject({code:"NOT_FOUND",status:404});
  const pending=txStore({visible:true,photoStatus:"pending"});
  await expect(photoFor(pending.tx,B,"photo-a")).rejects.toMatchObject({code:"NOT_FOUND",status:404});
  const publicReady=txStore({visible:true,photoStatus:"ready"});
  await expect(photoFor(publicReady.tx,B,"photo-a")).resolves.toMatchObject({status:"ready"});
  await expect(photoFor(publicReady.tx,B,"photo-a",true)).rejects.toMatchObject({code:"FORBIDDEN",status:403});
 });
 it("GAL-CORE-03 owner-bound upload reservation read rejects foreign B even on public album",async()=>{
  const publicStore=txStore({visible:true});
  await expect(uploadFor(publicStore.tx,B,"upload-a")).rejects.toMatchObject({code:"NOT_FOUND",status:404});
  await expect(uploadFor(publicStore.tx,A,"upload-a")).resolves.toMatchObject({ownerId:A});
  const noUpload=txStore({visible:true,hasUpload:false});
  await expect(uploadFor(noUpload.tx,A,"upload-a")).rejects.toMatchObject({code:"NOT_FOUND",status:404});
 });
 it("GAL-CORE-04 real signed-url DTO TTL and cover replacement follow 300s stable slots, never 180s JSON cache",async()=>{
  const at=new Date("2026-10-16T00:00:15.000Z");
  const signCdn=vi.fn(async ({key,expiresAt}:{key:string,expiresAt:Date})=>`https://signed-mock.example/${key}?expires=${expiresAt.toISOString()}`);
  const ctx={now:()=>new Date(at),storage:{enabled:true,signCdn}} as never;
  const ready={...photo("ready"),thumbKey:"A-thumb",fullKey:"A-full",width:640,height:480,caption:null,createdAt:at,reservationExpiresAt:new Date(at.getTime()+900000)};
  const tx={galleryUpload:{findUnique:vi.fn()},galleryPhoto:{findMany:vi.fn().mockResolvedValue([ready])}} as never;
  const dto=await photoDto(ctx,tx,ready as never,B);
  expect(dto.canEdit).toBe(false);
  // Stable expiry floors to a 90-second slot: the 300-second signing
  // budget is intentionally NOT a fixed 300-second wire expiry.
  expect(dto.urlsExpireAt).toBe("2026-10-16T00:04:30.000Z");
  expect(new Date(dto.urlsExpireAt!).getTime() - at.getTime()).toBeGreaterThan(180_000);
  expect(dto.thumbUrl).toContain("A-thumb");
  expect(dto.fullUrl).toContain("A-full");
  const older={...album(true),createdAt:at,updatedAt:at,name:"album",description:null,coverPhotoId:ready.id};
  const coverA=await albumDto(ctx,tx,older as never,A);
  expect(coverA.coverThumbUrl).toContain("A-thumb");
  expect(coverA.urlsExpireAt).toBe(dto.urlsExpireAt);
  (tx as {galleryPhoto:{findMany:ReturnType<typeof vi.fn>}}).galleryPhoto.findMany.mockResolvedValue([{...ready,id:"photo-new",thumbKey:"B-thumb",fullKey:"B-full"}]);
  const coverB=await albumDto(ctx,tx,{...older,coverPhotoId:"photo-new"} as never,A);
  expect(coverB.coverThumbUrl).toContain("B-thumb");
  expect(coverB.urlsExpireAt).toBe(dto.urlsExpireAt);
  expect(coverB.coverThumbUrl).not.toBe(coverA.coverThumbUrl);
  expect(signCdn).toHaveBeenCalled();
 });
 it("GAL-CORE-05 real uploadDto grants POST only while reserved, never after uploaded",async()=>{
  const at=new Date("2026-10-16T00:00:00.000Z");
  const postExpiresAt=new Date(at.getTime()+600000);
  const reservationExpiresAt=new Date(at.getTime()+900000);
  const presignPost=vi.fn(async({key}:{key:string})=>({url:"https://presigned-mock.example",fields:{key}}));
  const ctx={now:()=>new Date(at),storage:{enabled:true,presignPost}} as never;
  const row={id:"upload-a",ownerId:A,albumId:"album-a",status:"reserved",sourceKey:"source-private",postExpiresAt,reservationExpiresAt,declaredMime:"image/jpeg",errorCode:null,
   photo:{...photo("pending"),caption:null,width:null,height:null,thumbKey:null,fullKey:null,createdAt:at,reservationExpiresAt,deletedAt:null}};
  const tx={galleryUpload:{findUnique:vi.fn()}} as never;
  const reserved=await uploadDto(ctx,tx,row as never,A,true);
  expect(reserved.status).toBe("reserved");expect(reserved.postUrl).toBe("https://presigned-mock.example");expect(reserved.expiresAt).toBe(postExpiresAt.toISOString());
  expect(reserved.reservationExpiresAt).toBe(reservationExpiresAt.toISOString());
  const after=await uploadDto(ctx,tx,{...row,status:"uploaded"} as never,A,true);
  expect(after.status).toBe("uploaded");expect(after.postUrl).toBeNull();expect(after.expiresAt).toBeNull();
  expect(presignPost).toHaveBeenCalledTimes(1);
 });

});
