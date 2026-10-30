import { ZodError } from "zod/v3";
import { getOwnVetVisitDetail, VetVisitDetailNotFoundError } from "./g1VetVisitDetailRead.review";
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
// Match pet/profile fieldErrors shape without echoing diagnosis, clinical notes or input.
function vetVisitFieldErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.map(String).join(".") || "body";
    if (Object.prototype.hasOwnProperty.call(fields, field)) continue;
    if (issue.code === "invalid_type") fields[field] = "INVALID_TYPE";
    else if (issue.code === "too_small") fields[field] = "REQUIRED";
    else if (issue.code === "too_big") fields[field] = "OUT_OF_RANGE";
    else fields[field] = "INVALID_VALUE";
  }
  return fields;
}
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
    if (!parts.length && method === "GET") {
      // Existing history list stays 200 data: [] for owned pets without visits.
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(petId)) {
        return json({ success: false, code: "VET_VISIT_NOT_FOUND" }, 404);
      }
      data = await listPetVetVisits(petId, ownerId);
    } else if (parts.length === 1 && method === "GET") {
      // One shared implementation for both Next and Hono; owner from JWT only.
      if (new URL(request.url).search) {
        return json({ success: false, code: "VET_VISIT_NOT_FOUND" }, 404);
      }
      data = await getOwnVetVisitDetail(ownerId, petId, visitId!);
    }
    else if ((!parts.length && method === "POST") || (parts.length === 1 && method === "PUT")) {
      let body: unknown;
      try {
        body = await (await limitedBody(request, 150_000)).json();
      } catch (e) {
        if (e instanceof VetVisitError) throw e;
        // Parsing failed before any Core transaction; keep details off the wire.
        return json({ success: false, code: "VET_VISIT_INVALID_JSON",
          error: "Некорректный JSON", fieldErrors: { body: "INVALID_JSON" } }, 400);
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
    if (error instanceof VetVisitDetailNotFoundError)
      return json({ success: false, code: "VET_VISIT_NOT_FOUND" }, 404);
    // For both GET surfaces, nonexistent and foreign owned pet/visit are identical.
    if (request.method === "GET" && error instanceof VetVisitError && error.status === 404)
      return json({ success: false, code: "VET_VISIT_NOT_FOUND" }, 404);
    if (error instanceof VetVisitError) {
      if (error.status === 404) {
        // Never reveal whether the pet, visit or attachment exists to another owner.
        return json({ success: false, code: "VET_VISIT_NOT_FOUND",
          error: "Запись не найдена" }, 404);
      }
      if (error.status === 400) {
        return json({ success: false, code: "VET_VISIT_VALIDATION_ERROR",
          error: error.message, fieldErrors: { body: "INVALID_VALUE" } }, 400);
      }
      return json({ success: false, error: error.message }, error.status);
    }
    if (error instanceof ZodError)
      return json({ success: false, code: "VET_VISIT_VALIDATION_ERROR",
        error: "Некорректные поля", fieldErrors: vetVisitFieldErrors(error) }, 400);
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
