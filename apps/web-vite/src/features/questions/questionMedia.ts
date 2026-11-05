import { QUESTION_LIMITS } from "@gafus/types";
import { ApiError } from "../../shared/api/client";
import { prepareBrowserPhotoWebp, type BrowserWebpVariant } from "../../shared/media/browserPhotoWebp";
import { uploadBrowserPhotoWebp, type WebpPost } from "../../shared/media/browserPhotoUpload";

const BASE = "/api/v1/questions/photos";
const VALID_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export type PendingQuestionPhoto = { id: string; localUrl: string };
export type PreparedQuestionBrowserPhoto = { small: BrowserWebpVariant; medium: BrowserWebpVariant };

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

/** Web always sends ready WebP variants; no server photo processing jobs. */
export async function uploadQuestionPhoto(file:File,
  onProgress?:(percent:number)=>void,
  prepared?: PreparedQuestionBrowserPhoto):Promise<string>{
  validateQuestionFiles([file],0);
  const variants=prepared ?? await prepareBrowserPhotoWebp(file,{small:360,medium:1440});
  const reservation=await fetch(BASE+"/client-reservations",{
    method:"POST",credentials:"include",cache:"no-store",
    headers:{"Content-Type":"application/json",Accept:"application/json"},
    body:JSON.stringify({mediumBytes:variants.medium.file.size}),
  });
  const receipt=await parseResponse<{
    id:string;upload:WebpPost;smallUpload:WebpPost;
  }>(reservation);
  if(!receipt||!VALID_ID.test(receipt.id)||
     receipt.upload?.method!=="POST"||receipt.smallUpload?.method!=="POST")
    throw Error("Сервер не подтвердил резервирование готовых фото");
  try{
    await Promise.all([
      uploadBrowserPhotoWebp(receipt.smallUpload,variants.small.file,"questions",
        p=>onProgress?.(Math.min(49,Math.round(p/2)))),
      uploadBrowserPhotoWebp(receipt.upload,variants.medium.file,"questions",
        p=>onProgress?.(50+Math.min(49,Math.round(p/2)))),
    ]);
    const confirm=await fetch(BASE+"/"+receipt.id+"/client-confirm",{
      method:"POST",credentials:"include",cache:"no-store",
      headers:{Accept:"application/json"},
    });
    const confirmed=await parseResponse<{id:string;status:string}>(confirm);
    if(confirmed.id!==receipt.id||confirmed.status!=="READY")
      throw Error("Сервер не подтвердил готовую фотографию");
    onProgress?.(100);
    return receipt.id;
  }catch(error){
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
