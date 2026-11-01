import {afterEach,describe,expect,it,vi} from "vitest";
import {getMyAlbum,listMyAlbums,listMyPhotos,projectOwnerAlbums,
  projectOwnerPhotos,projectPublicPhotos,signedGalleryImage,galleryRequiresOpaquePost,uploadGalleryFormWithProgress} from "./galleryApi";
const future="2099-10-17T18:00:00.000Z";
const album=(overrides:Record<string,unknown>={})=>({
  id:"album_01",ownerId:"A",ownerUsername:"ownerA",name:"Прогулки",
  description:"Описание",isVisible:false,canEdit:true,photoCount:2,
  coverPhotoId:"photo_01",coverDisplayPhotoId:"photo_01",
  coverThumbUrl:"https://cdn.example.com/cover.jpg?sig=secret",
  urlsExpireAt:future,createdAt:"2026-10-17T12:00:00Z",
  updatedAt:"2026-10-17T12:00:00Z",secretToken:"KEEP_PRIVATE",
  ...overrides,
});
const photo=(overrides:Record<string,unknown>={})=>({
  id:"photo_01",albumId:"album_01",caption:"Фото собаки",status:"ready",
  thumbUrl:"https://cdn.example.com/thumb.jpg?sig=secret",
  fullUrl:"https://cdn.example.com/full.jpg?sig=secret",
  urlsExpireAt:future,expiresAt:null,width:640,height:480,
  createdAt:"2026-10-17T12:00:00Z",canEdit:true,
  signedStorageKey:"s3_private_bucket",...overrides,
});
const page=(items:unknown[],nextCursor:string|null=null)=>({
  items,nextCursor,isOwner:true,enabled:true,usedSlots:2,limit:200,
});
const ok=(data:unknown)=>new Response(JSON.stringify({success:true,data}),
  {status:200});
afterEach(()=>vi.unstubAllGlobals());
describe("G16 gallery Hono GET-only owner projection",()=>{
  it("G-A01 authenticated GET list own albums cursor-only pagination; no POST",async()=>{
    const fetch=vi.fn().mockImplementation(()=>
      Promise.resolve(ok(page([album()],"some+/=cursor"))));
    vi.stubGlobal("fetch",fetch);
    const result=await listMyAlbums("A","ownerA");
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe("some+/=cursor");
    expect(fetch.mock.calls[0][0]).toBe(
      "/api/v1/gallery/profiles/ownerA/albums?pageSize=20");
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method:"GET",credentials:"include",cache:"no-store",
    });
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
    await listMyAlbums("A","ownerA","some+/=cursor");
    expect(fetch.mock.calls[1][0]).toBe(
      "/api/v1/gallery/profiles/ownerA/albums?pageSize=20&cursor=some%2B%2F%3Dcursor");
    expect(fetch.mock.calls.every(([_,init])=>init.method==="GET")).toBe(true);
  });
  it("G-A02 strips storage/private fields and preserves visibility + server owner",()=>{
    const result=projectOwnerAlbums(page([album()]),"A","ownerA");
    expect(result.items[0]).toMatchObject({
      name:"Прогулки",isVisible:false,canEdit:true,ownerId:"A",
      coverPhotoId:"photo_01",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /KEEP_PRIVATE|signedStorageKey|secretToken|coverDisplayPhotoId/,
    );
  });
  it("G-A03 ownerId/username/canEdit and isOwner spoof fails closed",()=>{
    for(const a of [
      album({ownerId:"B"}),album({ownerUsername:"other"}),
      album({canEdit:false}),
    ])expect(()=>projectOwnerAlbums(page([a]),"A","ownerA")).toThrow();
    expect(()=>projectOwnerAlbums(page([album({coverPhotoId:{id:"bad"}})]),"A","ownerA"))
      .toThrow();
    expect(()=>projectOwnerAlbums({...page([album()]),isOwner:false},"A","ownerA"))
      .toThrow();
  });
  it("G-A04 invalid cursor, excessive page length, duplicate albums blocked",()=>{
    expect(()=>projectOwnerAlbums(page([album(),album()]),"A","ownerA")).toThrow();
    expect(()=>projectOwnerAlbums({...page([]),nextCursor:"a".repeat(513)},
      "A","ownerA")).toThrow();
    expect(()=>projectOwnerAlbums(page(new Array(51).fill(album())),
      "A","ownerA")).toThrow();
  });
  it("G-A05 private signed URLs require valid expiry/HTTPS/no credentials",()=>{
    for(const unsafe of ["http://s3.local/img.jpg","data:image/svg+xml,hi",
      "blob:abc","javascript:alert(1)","//public.example.com/photo.jpg",
      "https://user:pass@example.com/x","https://cdn.example.com/x#anchor"])
      expect(signedGalleryImage(unsafe,future)).toBeNull();
    expect(signedGalleryImage("https://cdn.example.com/x?signature=abc",future))
      .toBe("https://cdn.example.com/x?signature=abc");
    expect(signedGalleryImage("https://cdn.example.com/x",
      "2026-01-01T00:00:00Z")).toBeNull();
    expect(signedGalleryImage("https://cdn.example.com/x",null)).toBeNull();
  });
  it("G-A06 stale cover never rendered, no raw internal S3 URL fallback",()=>{
    const a=projectOwnerAlbums(page([album({
      coverThumbUrl:"http://s3.internal/private",urlsExpireAt:future,
    }),album({id:"album_02",coverThumbUrl:"https://cdn.example.com/old",
      urlsExpireAt:"2020-01-01T00:00:00Z"})]),"A","ownerA");
    expect(a.items.map(x=>x.coverThumbUrl)).toEqual([null,null]);
  });
  it("G-A07 album GET validates owner and only projects public DTO",async()=>{
    const fetch=vi.fn().mockResolvedValue(ok(album()));
    vi.stubGlobal("fetch",fetch);
    const result=await getMyAlbum("album_01","A","ownerA");
    expect(result.id).toBe("album_01");
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/gallery/albums/album_01");
    expect(JSON.stringify(result)).not.toContain("KEEP_PRIVATE");
    await expect(getMyAlbum("../other","A","ownerA")).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("G-A08 photos GET verifies album binding/owner + strips S3 key",async()=>{
    const fetch=vi.fn().mockResolvedValue(ok(page([photo()],"cursor2")));
    vi.stubGlobal("fetch",fetch);
    const result=await listMyPhotos("album_01");
    expect(result.items[0]).toMatchObject({id:"photo_01",albumId:"album_01"});
    expect(JSON.stringify(result)).not.toContain("s3_private_bucket");
    expect(fetch.mock.calls[0][0]).toBe(
      "/api/v1/gallery/albums/album_01/photos?pageSize=20");
    expect(fetch.mock.calls[0][1].method).toBe("GET");
  });
  it("G-A09 photo of B, owner not true, status bad and duplicate rejected",()=>{
    expect(()=>projectOwnerPhotos(page([photo({albumId:"album_B"})]),
      "album_01")).toThrow();
    expect(()=>projectOwnerPhotos({...page([photo()]),isOwner:false},
      "album_01")).toThrow();
    expect(()=>projectOwnerPhotos(page([photo({status:"complete"})]),
      "album_01")).toThrow();
    expect(()=>projectOwnerPhotos(page([photo(),photo()]),"album_01")).toThrow();
  });
  it("G-A10 pending photo never exposes media even if signed URLs exist",()=>{
    const result=projectOwnerPhotos(page([photo({status:"processing"})]),"album_01");
    expect(result.items[0].thumbUrl).toBeNull();
    expect(result.items[0].fullUrl).toBeNull();
  });
  it("G-A12 retains failed upload retry metadata for owner, never for public photo",()=>{
    const failed={...photo({status:"failed"}),uploadId:"upload_01",
      errorMessage:"Обработка фотографии не удалась.",sourceKey:"PRIVATE_S3_KEY"};
    const owner=projectOwnerPhotos(page([failed]),"album_01");
    expect(owner.items[0]).toMatchObject({status:"failed",uploadId:"upload_01",
      errorMessage:"Обработка фотографии не удалась."});
    expect(JSON.stringify(owner)).not.toContain("PRIVATE_S3_KEY");
    const visible={...photo({status:"ready"}),uploadId:"upload_01",
      errorMessage:"INTERNAL_PROVIDER_CODE",sourceKey:"PRIVATE_S3_KEY"};
    const published=projectPublicPhotos({...page([visible]),isOwner:false},"album_01");
    expect(published.items[0]).not.toHaveProperty("uploadId");
    expect(published.items[0]).not.toHaveProperty("errorMessage");
    expect(JSON.stringify(published)).not.toContain("PRIVATE_S3_KEY");
  });
  it("G-A11 reject unsupported owner ID/query before network",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    await expect(listMyAlbums("../B","ownerA")).rejects.toThrow();
    await expect(listMyAlbums("A","https://evil")).rejects.toThrow();
    await expect(listMyPhotos("../album")).rejects.toThrow();
    await expect(listMyAlbums("A","ownerA","x".repeat(513))).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Cloud.ru private Gallery CORS-denied POST transport",()=>{
  const postUrl="https://s3.cloud.ru/gafus-gallery-private/";
  it("selects only the exact private bucket without allowing redirects or other hosts",()=>{
    expect(galleryRequiresOpaquePost(postUrl)).toBe(true);
    expect(galleryRequiresOpaquePost(postUrl.slice(0,-1))).toBe(true);
    for(const url of ["https://s3.cloud.ru/gafus-feed-private/",
      "https://s3.cloud.ru/gafus-gallery-private/other", "http://s3.cloud.ru/gafus-gallery-private/",
      "https://evil.example/gafus-gallery-private/", "https://s3.cloud.ru/gafus-gallery-private/?x=y",
      "https://user@s3.cloud.ru/gafus-gallery-private/"])
      expect(galleryRequiresOpaquePost(url)).toBe(false);
  });
  it("sends one opaque signed multipart POST without XHR preflight and never claims 100%",async()=>{
    const file=new File([new Uint8Array([255,216,255,0])],"photo.jpg",{type:"image/jpeg"});
    const reservation={postUrl,postFields:{key:"test/key","Content-Type":"image/jpeg",policy:"signed"},
      uploadId:"upload-a",albumId:"album-a",status:"reserved",
      reservationExpiresAt:"2099-10-17T18:00:00Z"};
    const sending=vi.fn().mockResolvedValue({type:"opaque",status:0});
    vi.stubGlobal("fetch",sending);
    const progress=vi.fn();
    await uploadGalleryFormWithProgress(reservation as never,file,new AbortController().signal,progress);
    expect(sending).toHaveBeenCalledTimes(1);
    const [url,options]=sending.mock.calls[0];
    expect(url).toBe(postUrl);
    expect(options).toMatchObject({method:"POST",mode:"no-cors",credentials:"omit",
      redirect:"error",cache:"no-store"});
    expect(options.headers).toBeUndefined();
    expect(options.body.get("file")).toMatchObject({
      name:file.name,size:file.size,type:file.type,
    });
    expect(progress).not.toHaveBeenCalledWith(100);
  });
  it("never retries when storage acknowledgement is uncertain",async()=>{
    const file=new File([new Uint8Array([255,216,255,0])],"photo.jpg",{type:"image/jpeg"});
    const reservation={postUrl,postFields:{key:"test/key"},uploadId:"upload-a",albumId:"album-a",
      status:"reserved",reservationExpiresAt:"2099-10-17T18:00:00Z"};
    const send=vi.fn().mockRejectedValue(new TypeError("NetworkError"));
    vi.stubGlobal("fetch",send);
    await expect(uploadGalleryFormWithProgress(reservation as never,file,
      new AbortController().signal,vi.fn())).rejects.toThrow("NetworkError");
    expect(send).toHaveBeenCalledTimes(1);
  });
});
