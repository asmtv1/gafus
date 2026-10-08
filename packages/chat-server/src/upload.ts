import { createWriteStream } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import busboy from "busboy";
import { CHAT_LIMITS } from "@gafus/consultation-shared";
import {
  ChatError,
  requireCanSend,
  requireCommunityCanSend,
} from "@gafus/core/services/cynologistChat";
import { uploadChatAttachment } from "@gafus/core/services/cynologistChat/upload";
let activeUploads = 0;
/** One file per request, backpressure, byte cap and bounded temporary storage. */
export async function uploadChatAttachmentRequest(
  userId: string,
  request: Request,
  chatId?: string,
  community = false,
) {
  if (community) await requireCommunityCanSend(userId);
  else await requireCanSend(userId, chatId);
  if (activeUploads >= 2)
    throw new ChatError("CHAT_UPLOAD_BUSY", "Загрузки заняты, повторите через минуту", 429);
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data;") || !request.body)
    throw new ChatError("CHAT_INVALID_FILE", "Нужен файл");
  activeUploads++;
  let dir: string | undefined;
  let fileTask: Promise<void> | undefined;
  try {
    // Reclaim directories left by a killed process, without touching uploads still in progress.
    for (const entry of await readdir(tmpdir())) {
      if (!entry.startsWith("gafus-chat-")) continue;
      const path = join(tmpdir(), entry);
      const info = await stat(path).catch(() => null);
      if (info?.isDirectory() && info.mtimeMs < Date.now() - 3600_000)
        await rm(path, { recursive: true, force: true });
    }
    dir = await mkdtemp(join(tmpdir(), "gafus-chat-"));
    const filePath = join(dir, "upload");
    let invalid = false;
    let originalName = "Вложение";
    let declaredMime = "";
    const parser = busboy({
      headers: { "content-type": contentType },
      limits: { files: 1, fields: 0, parts: 2, fileSize: CHAT_LIMITS.videoBytes },
    });
    parser.on("file", (field, file, info) => {
      if (field !== "file") invalid = true;
      declaredMime = info.mimeType;
      originalName = info.filename;
      file.on("limit", () => {
        invalid = true;
      });
      fileTask = pipeline(file, createWriteStream(filePath, { flags: "wx", mode: 0o600 }));
      // Prevent an unhandled rejection while the multipart pipeline is completing.
      void fileTask.catch(() => {
        invalid = true;
      });
    });
    for (const event of ["filesLimit", "fieldsLimit", "partsLimit"])
      parser.on(event, () => {
        invalid = true;
      });
    let bytes = 0;
    const cap = new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        callback(
          bytes > CHAT_LIMITS.videoBytes + 65536
            ? new ChatError("CHAT_FILE_TOO_LARGE", "Файл слишком большой")
            : null,
          chunk,
        );
      },
    });
    const signal = AbortSignal.timeout(180_000);
    await pipeline(
      Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]),
      cap,
      parser,
      { signal },
    );
    await fileTask;
    if (invalid || !fileTask)
      throw new ChatError("CHAT_INVALID_FILE", "Выберите одно фото до 10 МБ или видео до 100 МБ");
    return await uploadChatAttachment(
      userId,
      { path: filePath, name: originalName, declaredMime },
      chatId,
      community,
    );
  } finally {
    await fileTask?.catch(() => undefined);
    if (dir) await rm(dir, { recursive: true, force: true });
    activeUploads--;
  }
}
