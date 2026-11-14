import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { fileTypeFromBuffer } from "file-type";
import {
 isVetVisitDbError,lockVetPetRowTx,listOwnPetVetRows,
 upsertOwnPetVetVisit,removeOwnPetVetVisit,requireOwnPetVetVisit,
 reservePetVetAttachment,commitPetVetAttachment,removeOwnPetVetAttachment,
 readOwnPetVetAttachment,enqueueOwnPetVetCleanupTx,
 type VetVisitDbRow,type VetVisitDbTx,
} from "./vetVisitRowsPort";
import { uploadVetVisitFile, vetVisitFileKeys, vetVisitMediaUrl } from "@gafus/cdn-upload";
import {
  VET_VISIT_MAX_FILE_BYTES,
  VET_VISIT_MIME_TYPES,
  type PetVetVisit,
} from "@gafus/types";
import { enqueueDelete } from "../gallery/persistence";

export class VetVisitError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409 | 413 = 400,
  ) {
    super(message);
  }
}
const text = (max: number) =>
  z.string().trim().max(max, `Допустимо не более ${max} символов`).default("");
export const petVetVisitSchema = z.object({
  visitedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату посещения")
    .refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return (
        Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value &&
        value >= "1900-01-01" &&
        date.getTime() <= Date.now() + 14 * 60 * 60 * 1000
      );
    }, "Проверьте дату посещения"),
  specialty: z
    .string()
    .trim()
    .min(1, "Укажите специальность врача")
    .max(200, "Специальность: не более 200 символов"),
  doctorName: text(200),
  clinic: text(300),
  diagnosis: text(10_000),
  conclusion: text(10_000),
  notes: text(10_000),
});
type VisitRow = VetVisitDbRow;
function dto(row: VisitRow, pending = new Set<string>()): PetVetVisit {
  return {
    id: row.id,
    petId: row.petId,
    visitedOn: row.visitedOn.toISOString().slice(0, 10),
    specialty: row.specialty,
    doctorName: row.doctorName,
    clinic: row.clinic,
    diagnosis: row.diagnosis,
    conclusion: row.conclusion,
    notes: row.notes,
    attachments: row.attachments.map((a) => ({
      id: a.id,
      name: a.name,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      hasPreview: !!a.previewKey,
      previewProcessing: !a.previewKey && pending.has(`vet-preview:${a.id}`),
    })),
  };
}
/** Public API error boundary stays in Core, never leaks SQL or clinical PII. */
async function vetDb<T>(action:()=>Promise<T>):Promise<T>{
 try{return await action();}
 catch(error){
  if(isVetVisitDbError(error)){
   switch(error.kind){
    case "pet":throw new VetVisitError("Питомец не найден",404);
    case "visit":throw new VetVisitError("Посещение не найдено",404);
    case "attachment":throw new VetVisitError("Вложение не найдено",404);
    case "limit":throw new VetVisitError("На одно посещение можно добавить до 5 вложений",409);
    case "reservation":throw new VetVisitError("Загрузка заняла слишком много времени. Повторите попытку",409);
   }
  }
  throw error;
 }
}

export async function lockVetPet(tx:VetVisitDbTx,petId:string,ownerId:string){
 await vetDb(()=>lockVetPetRowTx(tx,petId,ownerId));
}
export async function listPetVetVisits(petId:string,ownerId:string){
 const {rows,pending}=await vetDb(()=>listOwnPetVetRows(petId,ownerId));
 return rows.map(row=>dto(row,pending));
}
export async function savePetVetVisit(petId:string,ownerId:string,input:unknown,id?:string){
 const parsed=petVetVisitSchema.parse(input);
 const data={...parsed,visitedOn:new Date(`${parsed.visitedOn}T00:00:00Z`)};
 const row=await vetDb(()=>upsertOwnPetVetVisit(petId,ownerId,data,id));
 return dto(row);
}
export async function deletePetVetVisit(petId:string,ownerId:string,id:string){
 await vetDb(()=>removeOwnPetVetVisit(petId,ownerId,id,enqueueDelete));
}
export async function addPetVetAttachment(
  petId: string,
  ownerId: string,
  visitId: string,
  file: File,
) {
  await vetDb(()=>requireOwnPetVetVisit(petId,ownerId,visitId));
  if (!file.size || file.size > VET_VISIT_MAX_FILE_BYTES)
    throw new VetVisitError("Размер файла должен быть от 1 байта до 10 МБ", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(bytes);
  if (
    !detected ||
    !VET_VISIT_MIME_TYPES.includes(detected.mime as (typeof VET_VISIT_MIME_TYPES)[number])
  )
    throw new VetVisitError("Разрешены фотографии JPEG, PNG, WebP и документы PDF");
  const id = randomUUID();
  const keys = vetVisitFileKeys(ownerId, petId, visitId, id, detected.mime);
  // All veterinary image thumbnails are committed synchronously with their
  // original. Never enqueue a Cloud.ru vetPreview Job: those photo jobs retire.
  // PDF attachments intentionally have no image preview.
  const asyncPreview = false;
  const dedupeKey = `vet-upload:${id}`;
  // Durable cleanup is reserved BEFORE storage I/O. It survives crashes, partial uploads and owner deletion.
  await vetDb(()=>reservePetVetAttachment(petId,ownerId,visitId,keys,dedupeKey,enqueueDelete));
  await uploadVetVisitFile(bytes, detected.mime, keys, { asyncPreview });
  const rawName = file.name
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127 && char !== "/" && char !== "\\";
    })
    .join("")
    .trim()
    .slice(0, 200);
  await vetDb(()=>commitPetVetAttachment(petId,ownerId,visitId,{
   id,keys,dedupeKey,
   name:rawName||`Медкарта.${detected.ext}`,
   mimeType:detected.mime,sizeBytes:bytes.byteLength,
  }));
  return { id };
}
export async function deletePetVetAttachment(
 petId:string,ownerId:string,visitId:string,id:string,
){
 await vetDb(()=>removeOwnPetVetAttachment(petId,ownerId,visitId,id,enqueueDelete));
}
export async function getPetVetMedia(
  petId: string,
  ownerId: string,
  visitId: string,
  id: string,
  variant: string,
) {
  const attachment=await vetDb(()=>readOwnPetVetAttachment(petId,ownerId,visitId,id));
  if (!["preview", "original", "download"].includes(variant))
    throw new VetVisitError("Неизвестный вид вложения");
  if (variant === "preview" && !attachment.previewKey)
    throw new VetVisitError("Предпросмотр недоступен", 404);
  return {
    url: await vetVisitMediaUrl(
      variant === "preview" ? attachment.previewKey! : attachment.originalKey,
      variant === "download" ? attachment.name : undefined,
    ),
  };
}

export async function enqueuePetVetCleanup(tx:VetVisitDbTx,petId:string,ownerId:string){
 await vetDb(()=>enqueueOwnPetVetCleanupTx(tx,petId,ownerId,enqueueDelete));
}
