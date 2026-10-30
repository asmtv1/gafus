import { ApiError, isolatedNonprodBrowserS3Url } from "../../shared/api/client";

const ID = /^[a-zA-Z0-9_-]{1,128}$/;
const validId = (value: string) => ID.test(value);

export type QuestionPhotoRendition = {
  small:string; medium:string;
  fallbackSmall?:string; fallbackMedium?:string;
  status?:string;
  smallWidth?:number; smallHeight?:number;
  width?:number; height?:number;
};
export type PhotoLocation = {
  questionId: string;
  photoIds: string[];
  answerId?: string;
  rootId?: string;
  page?: number;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** Signed photo URLs are ephemeral; never insert them into React Query. */
export async function fetchQuestionPhotoRenditions(
  location: PhotoLocation, signal?: AbortSignal,
): Promise<QuestionPhotoRendition[]> {
  const { questionId, answerId, rootId, page = 1, photoIds } = location;
  if (!validId(questionId) || (answerId && !validId(answerId)) ||
      (rootId && !validId(rootId)) || (rootId && !answerId) ||
      !Number.isInteger(page) || page < 1 || page > 10000 ||
      !Array.isArray(photoIds) || photoIds.length > 5 ||
      !photoIds.every(validId) || new Set(photoIds).size !== photoIds.length) {
    throw new Error("Некорректный запрос фотографий");
  }
  const path = rootId
    ? `/api/v1/questions/answers/${rootId}/replies?page=${page}`
    : `/api/v1/questions/${questionId}?page=${page}`;
  const response = await fetch(path, {
    method: "GET", credentials: "include", cache: "no-store",
    headers: { Accept: "application/json" }, signal,
  });
  const envelope = object(await response.json());
  if (!response.ok || !envelope || envelope.success !== true) {
    throw new ApiError(response.status, "Не удалось получить фотографии");
  }
  const payload = object(envelope.data);
  if (!payload) throw new Error("Сервер вернул некорректные фотографии");
  const candidates = answerId
    ? (rootId ? payload.items : payload.answers)
    : payload.photos;
  const media = answerId && Array.isArray(candidates)
    ? object(candidates.find(item => object(item)?.id === answerId))?.photos
    : candidates;
  if (!Array.isArray(media)) throw new Error("Фотографии недоступны");
  const byId = new Map<string, QuestionPhotoRendition>();
  for (const entry of media) {
    const photo = object(entry);
    if (!photo || typeof photo.id !== "string" || !validId(photo.id) ||
        typeof photo.url !== "string") {
      throw new Error("Сервер вернул некорректные фотографии");
    }
    if (photo.url === "" &&
        ["AWAITING_UPLOAD","QUEUED","PROCESSING","FAILED","UNAVAILABLE"].includes(String(photo.status))) {
      byId.set(photo.id,{small:"",medium:"",status:String(photo.status)});
      continue;
    }
    const rawUrl = photo.url;
    let url: URL;
    try { url = new URL(rawUrl, window.location.origin); } catch {
      throw new Error("Сервер вернул недопустимый адрес фотографии");
    }
    // HTTPS CDN and same-origin API are valid everywhere. Strictly in local
    // development, also admit actual signed GETs from the isolated Questions
    // bucket on 127.0.0.1:9000. Never grant arbitrary cross-origin HTTP.
    if (!(url.protocol === "https:" ||
      (url.protocol === "http:" && url.origin === window.location.origin) ||
      isolatedNonprodBrowserS3Url(rawUrl, "questions", "signed-get"))) {
      throw new Error("Сервер вернул недопустимый адрес фотографии");
    }
    const smallRaw=typeof photo.smallUrl==="string"?photo.smallUrl:rawUrl;
    let smallUrl:URL;
    try{smallUrl=new URL(smallRaw,window.location.origin);}
    catch{throw new Error("Сервер вернул недопустимый адрес миниатюры");}
    if(!(smallUrl.protocol==="https:" ||
      (smallUrl.protocol==="http:" && smallUrl.origin===window.location.origin) ||
      isolatedNonprodBrowserS3Url(smallRaw,"questions","signed-get")))
      throw new Error("Сервер вернул недопустимый адрес миниатюры");
    const natural=(v:unknown)=>typeof v==="number" && Number.isSafeInteger(v) && v>0
      ? v:undefined;
    const direct=(field:string)=> {
      const candidate=photo[field];
      if(typeof candidate!=="string")return undefined;
      try {
        const parsed=new URL(candidate);
        return parsed.protocol==="https:" &&
          parsed.hostname==="gafus-questions-public.s3.cloud.ru" &&
          parsed.username==="" && parsed.password==="" && !parsed.search && !parsed.hash
          ?parsed.toString():undefined;
      }catch{return undefined;}
    };
    byId.set(photo.id,{small:smallUrl.toString(),medium:url.toString(),
      fallbackSmall:direct("fallbackSmallUrl"),fallbackMedium:direct("fallbackUrl"),
      smallWidth:natural(photo.smallWidth),smallHeight:natural(photo.smallHeight),
      width:natural(photo.width),height:natural(photo.height)});
  }
  return photoIds.map(id => {
    const item=byId.get(id);
    if(item===undefined)throw new Error("Ожидаемая фотография недоступна");
    return item;
  });
}
/** Compatibility read helper; never cache signed URLs. */
export async function fetchQuestionPhotoUrls(location:PhotoLocation,
  signal?:AbortSignal,size:"small"|"medium"="small"):Promise<string[]> {
  return (await fetchQuestionPhotoRenditions(location,signal)).map(item=>item[size]);
}
