import { ZodError } from "zod";
import { createWebLogger } from "@gafus/logger";
import { VET_VISIT_MAX_FILE_BYTES } from "@gafus/types";
import {
  addPetVetAttachment,
  deletePetVetAttachment,
  deletePetVetVisit,
  getPetVetMedia,
  listPetVetVisits,
  savePetVetVisit,
  VetVisitError,
} from "./petVetVisitService";

const logger = createWebLogger("pet-vet-visits");
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
async function limitedBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new VetVisitError("Размер запроса превышает допустимый", 413);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (reader) {
    try {
      for (;;) {
        const item = await reader.read();
        if (item.done) break;
        total += item.value.byteLength;
        if (total > limit) {
          await reader.cancel();
          throw new VetVisitError("Размер запроса превышает допустимый", 413);
        }
        chunks.push(item.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(bytes, {
    headers: { "Content-Type": request.headers.get("content-type") ?? "application/json" },
  });
}
/** Shared transport for Next session auth and the mobile bearer API. Owner is supplied only by their auth middleware. */
export async function handlePetVetVisitRequest(
  request: Request,
  petId: string,
  ownerId: string,
  parts: string[],
) {
  try {
    const method = request.method;
    const [visitId, section, attachmentId, media] = parts;
    let data: unknown;
    if (!parts.length && method === "GET") data = await listPetVetVisits(petId, ownerId);
    else if ((!parts.length && method === "POST") || (parts.length === 1 && method === "PUT")) {
      let body: unknown;
      try {
        body = await (await limitedBody(request, 150_000)).json();
      } catch (e) {
        if (e instanceof VetVisitError) throw e;
        throw new VetVisitError("Некорректные данные записи");
      }
      data = await savePetVetVisit(petId, ownerId, body, visitId);
    } else if (parts.length === 1 && method === "DELETE")
      await deletePetVetVisit(petId, ownerId, visitId!);
    else if (parts.length === 2 && section === "attachments" && method === "POST") {
      let form: FormData;
      try {
        form = await (await limitedBody(request, VET_VISIT_MAX_FILE_BYTES + 64_000)).formData();
      } catch (e) {
        if (e instanceof VetVisitError) throw e;
        throw new VetVisitError("Не удалось прочитать вложение");
      }
      const file = form.get("file");
      if (!file || typeof file === "string") throw new VetVisitError("Выберите файл");
      data = await addPetVetAttachment(petId, ownerId, visitId!, file);
    } else if (parts.length === 3 && section === "attachments" && method === "DELETE")
      await deletePetVetAttachment(petId, ownerId, visitId!, attachmentId!);
    else if (
      parts.length === 4 &&
      section === "attachments" &&
      media === "media" &&
      method === "GET"
    ) {
      const query = new URL(request.url).searchParams;
      const result = await getPetVetMedia(
        petId,
        ownerId,
        visitId!,
        attachmentId!,
        query.get("variant") ?? "preview",
      );
      if (query.get("redirect") === "1")
        return new Response(null, { status: 302, headers: { ...headers, Location: result.url } });
      data = result;
    } else return json({ success: false, error: "Страница не найдена" }, 404);
    return json({ success: true, data }, method === "POST" ? 201 : 200);
  } catch (error) {
    if (error instanceof VetVisitError)
      return json({ success: false, error: error.message }, error.status);
    if (error instanceof ZodError)
      return json(
        { success: false, error: error.issues[0]?.message ?? "Проверьте поля записи" },
        400,
      );
    logger.error(
      "Не удалось выполнить действие с посещением врача",
      new Error("VET_VISIT_REQUEST_FAILED"),
    );
    return json(
      { success: false, error: "Не удалось выполнить действие. Повторите попытку позже" },
      500,
    );
  }
}
