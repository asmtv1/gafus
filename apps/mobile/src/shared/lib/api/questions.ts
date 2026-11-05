import {
  createQuestionsClient,
  type QuestionPhotoDto,
  type QuestionsTransport,
} from "@gafus/types";
import { apiClient } from "./client";
import type { SignedClientPhotoPost } from "@/shared/lib/media/directPhotoUpload";
const transport: QuestionsTransport = async <T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {},
) => {
  const response = await apiClient<T>(
    `/api/v1/questions${path && !path.startsWith("?") ? "/" : ""}${path}`,
    { ...options, suppressSubscriptionPaywall: true },
  );
  if (!response.success || response.data === undefined) {
    const error = new Error(response.error ?? "Не удалось выполнить запрос") as Error & {
      code?: string;
      details?: Record<string, unknown>;
    };
    error.code = response.code;
    error.details = response.details;
    throw error;
  }
  return response.data;
};
export const questionsApi = createQuestionsClient(transport);
/** Zero-Job photo path: device generates 360/1440 WebP files, S3 copies
 * verified staging objects to immutable public keys, API commits READY.
 */
export async function uploadClientQuestionsPhoto(
  source: { uri: string; width: number; height: number },
  onProgress?: (percent: number) => void,
): Promise<{ id: string; status: "READY"; url: string }> {
  const [{ prepareUploadWebpVariants }, { postClientWebp }] = await Promise.all([
    import("@/shared/lib/media/prepareUploadWebp"),
    import("@/shared/lib/media/directPhotoUpload"),
  ]);
  const versions = await prepareUploadWebpVariants(source, { small: 360, medium: 1440 });
  let reservationId: string | undefined;
  try {
    const reservation = await apiClient<{ id: string; upload: SignedClientPhotoPost;
      smallUpload: SignedClientPhotoPost }>("/api/v1/questions/photos/client-reservations", {
      method: "POST", body: { mediumBytes: versions.medium.bytes },
      suppressSubscriptionPaywall: true,
    });
    if (!reservation.success || !reservation.data) {
      const failure = new Error(reservation.error ?? "Ускоренная загрузка фото недоступна") as Error & { code?: string };
      failure.code = reservation.code;
      throw failure;
    }
    const item = reservation.data;
    reservationId = item.id;
    const hosts = ["gafus-questions-public.s3.cloud.ru", "s3.cloud.ru",
      "127.0.0.1", "localhost", "10.0.2.2"];
    await Promise.all([
      postClientWebp(item.smallUpload, versions.small, hosts, p => onProgress?.(Math.round(p / 2))),
      postClientWebp(item.upload, versions.medium, hosts, p => onProgress?.(50 + Math.round(p / 2))),
    ]);
    const confirmation = await apiClient<{ id: string; status: "READY" }>(
      `/api/v1/questions/photos/${item.id}/client-confirm`, {
        method: "POST", suppressSubscriptionPaywall: true,
      });
    if (!confirmation.success || confirmation.data?.status !== "READY" ||
        confirmation.data.id !== item.id)
      throw new Error(confirmation.error ?? "Готовая фотография не подтверждена");
    onProgress?.(100);
    return { id: item.id, status: "READY", url: source.uri };
  } catch (error) {
    if (reservationId) void apiClient(`/api/v1/questions/photos/${reservationId}`, {
      method: "DELETE", suppressSubscriptionPaywall: true,
    }).catch(() => undefined);
    throw error;
  } finally {
    versions.small.dispose();
    versions.medium.dispose();
  }
}

/** Direct signed S3 POST; bearer tokens/cookies never go to the S3 host. */
export async function uploadQuestionPhoto(uri:string,
  mime:"image/jpeg"|"image/png"|"image/webp",
  onProgress?:(percent:number)=>void) {
  const file=await fetch(uri).then(r=>r.blob());
  if(!file.size || file.size>10*1024*1024)
    throw Error("Фото должно быть не больше 10 МБ");
  const reservation=await apiClient<{id:string;upload:{
    url:string;fields:Record<string,string>;method:"POST";
  }}>("/api/v1/questions/photos/reservations",{
    method:"POST",body:{mime,bytes:file.size},suppressSubscriptionPaywall:true,
  });
  if(!reservation.success||!reservation.data)
    throw Error(reservation.error??"Не удалось подготовить фото");
  const received=reservation.data;
  const target=new URL(received.upload.url);
  if(received.upload.method!=="POST" ||
     !(target.protocol==="https:" ||
       (target.protocol==="http:" &&
       (["127.0.0.1","localhost","10.0.2.2"].includes(target.hostname)) &&
       ["9000","9500"].includes(target.port))))
    throw Error("Некорректный адрес загрузки");
  try{
    await new Promise<void>((resolve,reject)=>{
      const xhr=new XMLHttpRequest();
      xhr.open("POST",target.toString());
      xhr.timeout=120_000;
      xhr.withCredentials=false;
      xhr.upload.onprogress=e=>{
        if(e.lengthComputable&&e.total)
          onProgress?.(Math.min(99,Math.round(e.loaded/e.total*100)));
      };
      xhr.onload=()=>xhr.status===200||xhr.status===201||xhr.status===204
        ? resolve():reject(Error("S3 отклонил фотографию"));
      xhr.onerror=()=>reject(Error("Нет соединения с S3"));
      xhr.ontimeout=()=>reject(Error("Время загрузки фото истекло"));
      xhr.onabort=()=>reject(Error("Загрузка отменена"));
      const form=new FormData();
      for(const [key,value] of Object.entries(received.upload.fields))form.append(key,value);
      const name=mime==="image/png"?"photo.png":
        mime==="image/webp"?"photo.webp":"photo.jpg";
      form.append("file",{uri,name,type:mime} as unknown as Blob);
      xhr.send(form);
    });
    onProgress?.(100);
    const confirmation=await apiClient<{id:string;status:string}>(
      "/api/v1/questions/photos/"+received.id+"/confirm",{
        method:"POST",suppressSubscriptionPaywall:true,
      });
    if(!confirmation.success||confirmation.data?.id!==received.id||
       !["QUEUED","PROCESSING","READY"].includes(confirmation.data.status))
      throw Error(confirmation.error??"Обработка фото не подтверждена");
    // Local file URI shows immediately. The detail endpoint later supplies
    // authorized, fresh S3 GET URLs once the media is READY.
    return {id:received.id,url:uri,status:confirmation.data.status as "QUEUED"|"PROCESSING"|"READY"};
  }catch(error){
    void apiClient("/api/v1/questions/photos/"+received.id,{
      method:"DELETE",suppressSubscriptionPaywall:true,
    }).catch(()=>undefined);
    throw error;
  }
}
export const discardQuestionPhoto = (id: string) => transport(`photos/${id}`, { method: "DELETE" });
