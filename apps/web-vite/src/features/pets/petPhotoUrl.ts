/** Original public pet CDN and strictly project-local short-lived signed S3 reads.
 * Never accept a private storage marker, arbitrary hosts or unsigned HTTP. */
import { isolatedNonprodBrowserS3Url } from "../../shared/api/client";

const petPath = new RegExp(
  String.raw`^[A-Za-z0-9_-]{1,128}/pets/[A-Za-z0-9_-]{1,128}/` +
  String.raw`[A-Za-z0-9_-]{1,150}\.(?:jpg|jpeg|png|webp|gif)$`, "i",
);

/** Signed S3 URLs rotate independently of the immutable object key. */
export function sameTrustedPetPhotoObject(left: unknown, right: unknown,
  pageOrigin?: string): boolean {
  if (!trustedPetPhotoUrl(left,pageOrigin) || !trustedPetPhotoUrl(right,pageOrigin)) return false;
  const a = new URL(left as string);
  const b = new URL(right as string);
  return a.origin === b.origin && a.pathname === b.pathname;
}

export function trustedPetPhotoUrl(value:unknown,pageOrigin?:string):string|null{
  if(typeof value==="string" &&
      isolatedNonprodBrowserS3Url(value,"documents","signed-get",pageOrigin)){
    try{
      const signed=new URL(value);
      const root="/gafus-refactor-documents-test/documents/uploads/users/";
      if(!signed.pathname.startsWith(root)||
        !petPath.test(signed.pathname.slice(root.length)))return null;
      const issued=signed.searchParams.get("X-Amz-Date");
      const ttl=Number(signed.searchParams.get("X-Amz-Expires"));
      if(!issued||!/^[0-9]{8}T[0-9]{6}Z$/.test(issued)||
        !Number.isInteger(ttl)||ttl<60||ttl>3600)return null;
      const t=Date.UTC(Number(issued.slice(0,4)),Number(issued.slice(4,6))-1,
        Number(issued.slice(6,8)),Number(issued.slice(9,11)),
        Number(issued.slice(11,13)),Number(issued.slice(13,15)));
      if(!Number.isFinite(t)||t+ttl*1000<Date.now()+15000)return null;
      return value;
    }catch{return null;}
  }
  if(typeof value!=="string"||!value||value.length>2048||
      value.includes("%")||value.includes("\\")||value.includes("..")||
      Array.from(value).some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127))
    return null;
  let url:URL;
  try{url=new URL(value);}catch{return null;}
  if(url.protocol!=="https:"||url.username||url.password||url.port||url.search||url.hash)
    return null;
  const prefix=url.hostname==="storage.yandexcloud.net"?
    "/gafus-media/uploads/users/":
    url.hostname==="gafus-media.storage.yandexcloud.net"?"/uploads/users/":null;
  if(!prefix||!url.pathname.startsWith(prefix))return null;
  const [owner,folder,pet,image,...extra]=url.pathname.slice(prefix.length).split("/");
  const identifier=/^[A-Za-z0-9_-]{1,128}$/;
  if(extra.length||folder!=="pets"||!identifier.test(owner)||!identifier.test(pet)||
    !/^[A-Za-z0-9_-]{1,150}\.(?:jpg|jpeg|png|webp|gif)$/i.test(image))
    return null;
  return value;
}
