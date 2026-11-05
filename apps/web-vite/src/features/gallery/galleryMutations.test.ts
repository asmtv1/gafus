import {afterEach,describe,expect,it,vi} from "vitest";
import {isolatedNonprodBrowserS3Url} from "../../shared/api/client";
import {
  albumWriteAck,deleteAckMatches,galleryAlbumCommands,galleryCoverAckMatches,
  uploadReservationValid,verifiedGalleryCover,uploadGalleryForm,
  reserveGalleryPhoto,confirmGalleryPhoto,galleryUploadStatus,
} from "./galleryApi";
const album={id:"album_01",ownerId:"owner_A",ownerUsername:"ownerA",
 name:"Наши прогулки",description:null,isVisible:false,canEdit:true,
 photoCount:1,coverPhotoId:"photo_01",coverThumbUrl:null,urlsExpireAt:null,
 internalStorageKey:"PRIVATE_NEVER_EXPOSE"};
const ok=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200});
afterEach(()=>vi.unstubAllGlobals());
describe("original Hono Gallery owner command transport boundaries",()=>{
 it("create/edit/delete send only relative owner-cookie POST/PATCH/DELETE",async()=>{
  const fetch=vi.fn().mockImplementation(async()=>ok(album));
  vi.stubGlobal("fetch",fetch);
  const draft={name:"Наши прогулки",description:null,isVisible:false};
  await galleryAlbumCommands.create(draft);
  await galleryAlbumCommands.update("album_01",draft);
  await galleryAlbumCommands.remove("album_01");
  const paths=fetch.mock.calls.map(([path])=>path);
  expect(paths).toEqual([
    "/api/v1/gallery/albums",
    "/api/v1/gallery/albums/album_01",
    "/api/v1/gallery/albums/album_01",
  ]);
  const methods=fetch.mock.calls.map(([,init])=>init.method);
  expect(methods).toEqual(["POST","PATCH","DELETE"]);
  for(const [,init] of fetch.mock.calls)expect(init).toMatchObject({
    credentials:"include",cache:"no-store",
    headers:{"X-Gafus-Auth-Transport":"cookie"},
  });
  expect(fetch.mock.calls[2][1].body).toBeUndefined();
 });
 it("owner ACK preserves public cover ID but removes private keys",()=>{
  expect(albumWriteAck(album,"owner_A","ownerA")).toHaveProperty("coverPhotoId","photo_01");
  expect(JSON.stringify(albumWriteAck(album,"owner_A","ownerA")))
    .not.toContain("PRIVATE_NEVER_EXPOSE");
  expect(()=>albumWriteAck({...album,ownerId:"owner_B"},
    "owner_A","ownerA")).toThrow();
  expect(deleteAckMatches({id:"album_01"},"album_01")).toBe(true);
  expect(deleteAckMatches({id:"album_B"},"album_01")).toBe(false);
 });
 it("cover change uses raw owner-scoped ephemeral server readback, not cached DTO",async()=>{
  const fetch=vi.fn().mockResolvedValue(ok(album));
  vi.stubGlobal("fetch",fetch);
  expect(galleryCoverAckMatches(album,"owner_A","ownerA",
    "album_01","photo_01")).toBe(true);
  expect(galleryCoverAckMatches({...album,ownerId:"owner_B"},
    "owner_A","ownerA","album_01","photo_01")).toBe(false);
  expect(await verifiedGalleryCover("album_01","owner_A","ownerA","photo_01")).toBe(true);
  expect(fetch.mock.calls[0][0]).toBe("/api/v1/gallery/albums/album_01");
  expect(fetch.mock.calls[0][1].method).toBe("GET");
 });
 it("opt-in local browser only permits exact private loopback MinIO buckets",()=>{
  const origin="http://127.0.0.1:5173";
  const gallery="http://127.0.0.1:9000/gafus-refactor-gallery-test";
  const feed="http://127.0.0.1:9000/gafus-refactor-feed-test";
  const documents="http://127.0.0.1:9000/gafus-refactor-documents-test";
  const signed=documents+"/documents/test.pdf?X-Amz-Signature=synthetic&X-Amz-Expires=60";
  expect(isolatedNonprodBrowserS3Url(gallery,"gallery","form-post",origin)).toBe(true);
  expect(isolatedNonprodBrowserS3Url(feed,"feed","form-post",origin)).toBe(true);
  expect(isolatedNonprodBrowserS3Url(signed,"documents","signed-get",origin)).toBe(true);
  for(const unsafe of [gallery.replace("127.0.0.1","localhost"),
    gallery.replace("9000","9001"),gallery.replace("test","prod"),
    gallery+"/private",gallery+"?debug=1",gallery+"#fragment",
    gallery.replace("127.0.0.1","evil.invalid"),
    "http://user:pass@127.0.0.1:9000/gafus-refactor-gallery-test"]){
    expect(isolatedNonprodBrowserS3Url(unsafe,"gallery","form-post",origin)).toBe(false);
  }
  expect(isolatedNonprodBrowserS3Url(gallery,"gallery","form-post","https://gafus.ru"))
    .toBe(false);
  expect(isolatedNonprodBrowserS3Url(signed,"documents","signed-get","https://gafus.ru"))
    .toBe(false);
  expect(isolatedNonprodBrowserS3Url(documents+"/x.pdf","documents","signed-get",origin))
    .toBe(false);
  expect(isolatedNonprodBrowserS3Url(gallery,"documents","form-post",origin))
    .toBe(false);
 });
 it("signed upload reservation refuses HTTP, different album and expired form",()=>{
  const future=new Date(Date.now()+600_000).toISOString();
  const res={uploadId:"upload_01",albumId:"album_01",status:"reserved",
    postUrl:"https://storage.example.test/private?signature=synthetic",
    postFields:{policy:"synthetic"},reservationExpiresAt:future};
  expect(uploadReservationValid(res,"album_01")).toBe(true);
  expect(uploadReservationValid({...res,albumId:"other"},"album_01")).toBe(false);
  expect(uploadReservationValid({...res,postUrl:"http://127.0.0.1:9000/"},
    "album_01")).toBe(false);
  expect(uploadReservationValid({...res,postUrl:"https://user:password@host/path"},
    "album_01")).toBe(false);
  expect(uploadReservationValid({...res,reservationExpiresAt:"2020-01-01T00:00:00Z"},
    "album_01")).toBe(false);
 });
 it("client WebP reserve uses owner-scoped cookie POST and hides storage keys",async()=>{
  const reservation={uploadId:"upload_01",albumId:"album_01",status:"reserved",
    postUrl:"https://storage.example.test/private?sig=synthetic",
    postFields:{policy:"synthetic"},reservationExpiresAt:new Date(Date.now()+600_000).toISOString()};
  const fetch=vi.fn().mockImplementation(async()=>ok(reservation));
  vi.stubGlobal("fetch",fetch);
  const file=new File(["synthetic"],"photo.webp",{type:"image/webp"});
  const id="4f77e329-caf1-4e59-b5ae-49f06f354c28";
  const result=await reserveGalleryPhoto("album_01",file,null,id);
  expect(result.uploadId).toBe("upload_01");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe("/api/v1/gallery/uploads/client-reserve");
  expect(fetch.mock.calls[0][1].method).toBe("POST");
  expect(fetch.mock.calls[0][1].credentials).toBe("include");
  const submitted=JSON.parse(fetch.mock.calls[0][1].body as string);
  expect(submitted).toMatchObject({albumId:"album_01",
    filename:"photo.webp",declaredMime:"image/webp",declaredBytes:file.size,
    clientRequestId:id});
 });
 it("signed S3 FormData upload is one POST, no cookie and no blind automatic retry",async()=>{
  const reservation={uploadId:"upload_01",albumId:"album_01",status:"reserved" as const,
    postUrl:"https://storage.example.test/private?sig=synthetic",
    postFields:{policy:"synthetic"},reservationExpiresAt:new Date(Date.now()+600_000).toISOString(),
    expiresAt:null,errorCode:null,errorMessage:null,photo:null};
  const fetch=vi.fn().mockResolvedValue(new Response(null,{status:204}));
  vi.stubGlobal("fetch",fetch);
  const file=new File(["synthetic"],"photo.jpg",{type:"image/jpeg"});
  await uploadGalleryForm(reservation,file,new AbortController().signal);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe(reservation.postUrl);
  expect(fetch.mock.calls[0][1]).toMatchObject({method:"POST",credentials:"omit",
    cache:"no-store",referrerPolicy:"no-referrer"});
  expect(fetch.mock.calls[0][1].body).toBeInstanceOf(FormData);
  expect(fetch.mock.calls[0][1].body.get("policy")).toBe("synthetic");
 });
 it("confirm and readback use exact original Hono routes and cookie session",async()=>{
  const payload={uploadId:"upload_01",albumId:"album_01",status:"uploaded"};
  const fetch=vi.fn().mockImplementation(async()=>ok(payload));
  vi.stubGlobal("fetch",fetch);
  expect(await confirmGalleryPhoto("upload_01")).toMatchObject(payload);
  expect(await galleryUploadStatus("upload_01")).toMatchObject(payload);
  expect(fetch.mock.calls.map(([path])=>path)).toEqual([
    "/api/v1/gallery/uploads/upload_01/client-complete",
    "/api/v1/gallery/uploads/upload_01",
  ]);
  expect(fetch.mock.calls.map(([,opt])=>opt.method)).toEqual(["POST","GET"]);
  expect(fetch.mock.calls.every(([,opt])=>
    opt.headers["X-Gafus-Auth-Transport"]==="cookie")).toBe(true);
 });
});
