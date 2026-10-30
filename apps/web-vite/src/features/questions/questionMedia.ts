import { QUESTION_LIMITS } from "@gafus/types";
import { ApiError, isolatedNonprodBrowserS3Url } from "../../shared/api/client";

const BASE = "/api/v1/questions/photos";
const VALID_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export type PendingQuestionPhoto = { id: string; localUrl: string };

export function validateQuestionFiles(files: File[], alreadyUploaded: number): void {
  if (!files.length || !Number.isInteger(alreadyUploaded) ||
      alreadyUploaded < 0 || files.length + alreadyUploaded > QUESTION_LIMITS.photos) {
    throw new Error("Можно добавить не более 5 фотографий");
  }
  for (const file of files) {
    if (!MIME.has(file.type)) {
      throw new Error("Поддерживаются только JPG, PNG и WebP");
    }
    if (!file.size || file.size > QUESTION_LIMITS.photoBytes) {
      throw new Error("Каждое фото должно быть не больше 10 МБ");
    }
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  let data: unknown;
  try { data = await response.json(); } catch {
    throw new ApiError(response.status, "Некорректный ответ загрузки фото");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ApiError(response.status, "Некорректный ответ загрузки фото");
  }
  const envelope = data as { success?: unknown; data?: unknown; error?: unknown };
  if (!response.ok || envelope.success !== true) {
    throw new ApiError(response.status,
      typeof envelope.error === "string" ? envelope.error : "Ошибка загрузки фото");
  }
  return envelope.data as T;
}

/** Cookie auth and trusted-origin verification are enforced by Hono. */
export async function uploadQuestionPhoto(file:File,
  onProgress?:(percent:number)=>void):Promise<string>{
  validateQuestionFiles([file],0);
  const reservation=await fetch(BASE+"/reservations",{
    method:"POST",credentials:"include",cache:"no-store",
    headers:{"Content-Type":"application/json",Accept:"application/json"},
    body:JSON.stringify({mime:file.type,bytes:file.size}),
  });
  const receipt=await parseResponse<{
    id:string;upload:{url:string;fields:Record<string,string>;method:"POST"};
  }>(reservation);
  if(!receipt || !VALID_ID.test(receipt.id) || receipt.upload?.method!=="POST")
    throw new Error("Некорректное подтверждение загрузки");
  let target:URL;
  try{target=new URL(receipt.upload.url);}
  catch{throw new Error("Некорректный адрес хранилища");}
  // No arbitrary http cross-origin upload. The exact MinIO dev URL is
  // guarded by the shared isolated S3 helper, not a production allowance.
  if(!(target.protocol==="https:" ||
       isolatedNonprodBrowserS3Url(target.href,"questions","form-post")))
    throw new Error("Небезопасный адрес загрузки");
  try{
    await new Promise<void>((resolve,reject)=>{
      const xhr=new XMLHttpRequest();
      const timer=window.setTimeout(()=>xhr.abort(),120_000);
      xhr.open("POST",target.href);
      xhr.withCredentials=false;
      xhr.upload.onprogress=event=>{
        if(event.lengthComputable&&event.total)
          onProgress?.(Math.min(99,Math.round(event.loaded/event.total*100)));
      };
      xhr.onload=()=>{
        window.clearTimeout(timer);
        if(xhr.status===200||xhr.status===201||xhr.status===204)resolve();
        else reject(new Error("Не удалось отправить фото в хранилище"));
      };
      xhr.onerror=()=>{window.clearTimeout(timer);reject(new Error("Соединение с хранилищем потеряно"));};
      xhr.onabort=()=>{window.clearTimeout(timer);reject(new Error("Время загрузки истекло"));};
      const form=new FormData();
      for(const [name,value] of Object.entries(receipt.upload.fields))form.append(name,value);
      form.append("file",file,file.name);
      xhr.send(form);
    });
    onProgress?.(100);
    const confirm=await fetch(BASE+"/"+receipt.id+"/confirm",{
      method:"POST",credentials:"include",cache:"no-store",
      headers:{Accept:"application/json"},
    });
    const confirmed=await parseResponse<{id:string;status:string}>(confirm);
    if(confirmed.id!==receipt.id || !["QUEUED","PROCESSING","READY"].includes(confirmed.status))
      throw new Error("Сервер не подтвердил обработку");
    return receipt.id;
  }catch(error){
    // Deletion may race with an S3 POST; the durable abandoned-upload sweep
    // independently cleans any object that arrives after this request.
    await discardUnusedQuestionPhoto(receipt.id).catch(()=>undefined);
    throw error;
  }
}

/** Only an unbound own photo can be removed by Core. Never discard attached photos. */
export async function discardUnusedQuestionPhoto(id: string): Promise<void> {
  if (!VALID_ID.test(id)) throw new Error("Некорректная фотография");
  const response = await fetch(BASE + "/" + id, {
    method: "DELETE", credentials: "include", cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload = await parseResponse<unknown>(response);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      (payload as Record<string, unknown>).id !== id) {
    throw new Error("Сервер не подтвердил удаление фотографии");
  }
}
