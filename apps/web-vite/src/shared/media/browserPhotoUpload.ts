import { isolatedNonprodBrowserS3Url } from "../api/client";
import { browserStorageUploadUrl } from "./browserStorageUploadUrl";

/** Signed POST from the authenticated API; auth cookies must never reach S3. */
export type WebpPost={url:string;fields:Record<string,string>;method:"POST"};
export type PhotoBucket="feed"|"gallery"|"questions"|"chat2";
const allowedHosts:Record<PhotoBucket,readonly string[]>={
  feed:["s3.cloud.ru","gafus-feed-public.s3.cloud.ru"],
  gallery:["s3.cloud.ru","gafus-gallery-private.s3.cloud.ru"],
  questions:["s3.cloud.ru","gafus-questions-public.s3.cloud.ru"],
  chat2:["s3.cloud.ru","gafus-chat2-media-2026.s3.cloud.ru"],
};
function galleryProxy(url:URL){
  return url.protocol==="https:" && url.hostname==="s3.cloud.ru" &&
    /^\/gafus-gallery-private\/?$/.test(url.pathname) && !url.search;
}
export function browserPhotoPostUrl(post:WebpPost,bucket:PhotoBucket):string{
  if(post.method!=="POST"||!post.fields||Object.keys(post.fields).length>32)
    throw Error("Неверная подписанная форма фотографии");
  let url:URL;
  try{url=new URL(post.url);}catch{throw Error("Некорректный адрес загрузки фотографии");}
  if(url.username||url.password||url.hash||
      !(url.protocol==="https:"&&allowedHosts[bucket].includes(url.hostname)&&!url.port ||
        bucket!=="chat2"&&isolatedNonprodBrowserS3Url(post.url,bucket,"form-post")))
    throw Error("Небезопасный адрес хранилища фотографий");
  if(url.protocol==="https:"&&url.hostname==="s3.cloud.ru"){
    const path=url.pathname.replace(/\/$/,"");
    const expected:Record<PhotoBucket,string>={
      feed:"/gafus-feed-private",gallery:"/gafus-gallery-private",
      questions:"/gafus-questions-public",chat2:"/gafus-chat2-media-2026",
    };
    if(path!==expected[bucket]||url.search)
      throw Error("Подписанная форма указывает на другой S3-бакет");
    if((bucket==="questions"||bucket==="chat2")&&
       ["https://gafus.ru","https://www.gafus.ru"].includes(location.origin))
      return `/__cloudru-upload/${bucket}`;
  }
  if(bucket==="gallery"&&galleryProxy(url))return "/__cloudru-upload/gallery";
  if(bucket==="feed")return browserStorageUploadUrl(url.href,"feed");
  if(bucket==="chat2"&&import.meta.env.VITE_CHAT2_LOCAL_S3_RELAY==="true"&&
      location.hostname==="127.0.0.1"&&location.port==="5174"&&
      url.hostname==="s3.cloud.ru"&&url.pathname==="/gafus-chat2-media-2026")
    return "/chat2-qa-s3-upload";
  return url.href;
}
export async function uploadBrowserPhotoWebp(post:WebpPost,file:File,bucket:PhotoBucket,
  onProgress?:(percent:number)=>void,signal?:AbortSignal):Promise<void>{
  const endpoint=browserPhotoPostUrl(post,bucket);
  if(file.type!=="image/webp"||!file.size||file.size>1_750_000)
    throw Error("Вариант фотографии превышает размер WebP");
  if(signal?.aborted)throw Error("Загрузка фотографии отменена");
  await new Promise<void>((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    let settled=false;
    const abort=()=>xhr.abort();
    const settle=(error?:Error)=>{
      if(settled)return;
      settled=true;
      signal?.removeEventListener("abort",abort);
      if(error)reject(error);else resolve();
    };
    signal?.addEventListener("abort",abort,{once:true});
    xhr.open("POST",endpoint);
    xhr.withCredentials=false;
    xhr.timeout=120_000;
    xhr.upload.onprogress=event=>{
      if(event.lengthComputable&&event.total>0)
        onProgress?.(Math.min(99,Math.round(event.loaded/event.total*100)));
    };
    xhr.onload=()=>xhr.status>=200&&xhr.status<300
      ? settle() : settle(Error("S3 отклонил фотографию"));
    xhr.onerror=()=>settle(Error("Соединение с S3 потеряно"));
    xhr.ontimeout=()=>settle(Error("Время загрузки фотографии истекло"));
    xhr.onabort=()=>settle(Error("Загрузка фотографии отменена"));
    const body=new FormData();
    for(const [key,value] of Object.entries(post.fields)){
      if(typeof value!=="string"||key.length>128||value.length>8192){
        settle(Error("Неверная подписанная форма фотографии"));return;
      }
      body.append(key,value);
    }
    body.append("file",file,file.name);
    try{xhr.send(body);}catch{settle(Error("Не удалось отправить фотографию"));}
  });
  onProgress?.(100);
}
