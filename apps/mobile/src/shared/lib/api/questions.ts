import {
  createQuestionsClient,
  type QuestionsTransport,
} from "@gafus/types";
import { apiClient } from "./client";
import { postClientWebp, type SignedClientPhotoPost } from "@/shared/lib/media/directPhotoUpload";
import { prepareUploadWebpVariants, type PreparedWebpVariant } from "@/shared/lib/media/prepareUploadWebp";
import { PhotoUploadStageError, type PhotoUploadStage } from "@/shared/lib/media/photoUploadStage";
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
export type PreparedQuestionPhotoVariants = Record<"small" | "medium", PreparedWebpVariant>;
export async function uploadClientQuestionsPhoto(
  source: { uri: string; width: number; height: number },
  onProgress?: (percent: number) => void,
  preparedVariants?: PreparedQuestionPhotoVariants,
): Promise<{ id: string; status: "READY"; url: string }> {
  // Expo 55 / RN 0.83 can throw HMRClient.setup() on on-demand import()
  // chunks in native development builds. Static imports avoid Metro's broken
  // secondary HMR bundle while retaining the existing client-only pipeline.
  const versions = preparedVariants ?? await prepareUploadWebpVariants(
    source, { small: 360, medium: 1440 },
  ).catch(error => { throw new PhotoUploadStageError("webp", error); });
  let reservationId: string | undefined;
  let stage: PhotoUploadStage = "reserve";
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
    stage = "transfer";
    // Let *both* requests settle before releasing local WebP bytes. With
    // Promise.all a failed thumbnail could delete the full image while the
    // second XHR was still reading it.
    const uploads = await Promise.allSettled([
      postClientWebp(item.smallUpload, versions.small, hosts, p => onProgress?.(Math.round(p / 2))),
      postClientWebp(item.upload, versions.medium, hosts, p => onProgress?.(50 + Math.round(p / 2))),
    ]);
    const failure = uploads.find(result => result.status === "rejected");
    if (failure && failure.status === "rejected") throw failure.reason;
    stage = "confirm";
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
    throw new PhotoUploadStageError(stage, error);
  } finally {
    if (!preparedVariants) {
      versions.small.dispose();
      versions.medium.dispose();
    }
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
