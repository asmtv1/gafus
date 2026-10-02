import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import busboy from "busboy";
import { fileTypeFromFile } from "file-type";
import { prisma } from "@gafus/prisma";
import { CHAT_LIMITS } from "@gafus/consultation-shared";
import { chatForActor, requireCanSend } from "./service";
import { communityActor, requireCommunityCanSend } from "./community";
import {
  CHAT_CHANNEL_TYPE,
  COMMUNITY_CHANNEL_TYPE,
  COMMUNITY_CHANNEL_ID,
  ChatError,
  streamServer,
} from "./stream";

const exec = promisify(execFile);
let activeUploads = 0;
/** One file per request, backpressure, byte cap and bounded temporary storage. */
export async function uploadChatAttachment(
  userId: string,
  request: Request,
  chatId?: string,
  community = false,
) {
  const chat = community
    ? await requireCommunityCanSend(userId)
    : await requireCanSend(userId, chatId);
  const channelType = community ? COMMUNITY_CHANNEL_TYPE : CHAT_CHANNEL_TYPE;
  if (activeUploads >= 2)
    throw new ChatError("CHAT_UPLOAD_BUSY", "Загрузки заняты, повторите через минуту", 429);
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data;") || !request.body)
    throw new ChatError("CHAT_INVALID_FILE", "Нужен файл");
  activeUploads++;
  let dir: string | undefined;
  let fileTask: Promise<void> | undefined;
  let uploaded: { kind: string; url: string } | undefined;
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
      originalName = info.filename.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 100) || "Вложение";
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
    const type = await fileTypeFromFile(filePath);
    const size = (await stat(filePath)).size;
    if (
      type &&
      declaredMime &&
      declaredMime !== "application/octet-stream" &&
      declaredMime !== type.mime
    )
      throw new ChatError("CHAT_MIME_MISMATCH", "Формат файла не соответствует его содержимому");
    const image = type && ["image/jpeg", "image/png", "image/webp"].includes(type.mime);
    const video = type && ["video/mp4", "video/quicktime"].includes(type.mime);
    if (!size || (!image && !video))
      throw new ChatError(
        "CHAT_UNSUPPORTED_FILE",
        "Поддерживаются JPG, PNG, WebP и видео MP4/MOV H.264",
      );
    if (image && size > CHAT_LIMITS.imageBytes)
      throw new ChatError("CHAT_FILE_TOO_LARGE", "Фото должно быть не больше 10 МБ");
    if (video) {
      const { stdout } = await exec(
        process.env.FFPROBE_PATH || "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration:stream=codec_type,codec_name",
          "-of",
          "json",
          filePath,
        ],
        { timeout: 15000, maxBuffer: 65536 },
      );
      const probe = JSON.parse(stdout) as {
        format?: { duration?: string };
        streams?: { codec_type: string; codec_name: string }[];
      };
      const seconds = Number(probe.format?.duration);
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > CHAT_LIMITS.videoSeconds)
        throw new ChatError("CHAT_VIDEO_TOO_LONG", "Видео должно быть не длиннее двух минут");
      const streams = probe.streams?.filter((s) => s.codec_type === "video");
      if (!streams?.length || streams.some((s) => s.codec_name !== "h264"))
        throw new ChatError(
          "CHAT_UNSUPPORTED_VIDEO",
          "Выберите видео MP4/MOV H.264; HEVC не поддерживается",
        );
    }
    // Recheck after receiving and inspecting the file, including expiry during upload.
    if (community) await requireCommunityCanSend(userId);
    else await requireCanSend(userId, chat.id);
    const channel = streamServer().channel(channelType, chat.streamChannelId);
    const kind = image ? "image" : "video";
    const response = image
      ? await channel.sendImage(createReadStream(filePath), originalName, type!.mime, {
          id: `gafus-${userId}`,
        })
      : await channel.sendFile(createReadStream(filePath), originalName, type!.mime, {
          id: `gafus-${userId}`,
        });
    uploaded = { kind, url: response.file };
    const data = {
      ownerUserId: userId,
      kind,
      url: response.file,
      mime: type!.mime,
      size,
      name: originalName,
    };
    if (community) return await prisma.communityChatAttachment.create({ data });
    return await prisma.chatAttachment.create({
      data: {
        chatId: chat.id,
        ...data,
      },
    });
  } catch (error) {
    if (uploaded) {
      const channel = streamServer().channel(channelType, chat.streamChannelId);
      await (
        uploaded.kind === "image"
          ? channel.deleteImage(uploaded.url)
          : channel.deleteFile(uploaded.url)
      ).catch(() => undefined);
    }
    throw error;
  } finally {
    await fileTask?.catch(() => undefined);
    if (dir) await rm(dir, { recursive: true, force: true });
    activeUploads--;
  }
}
export async function deleteChatAttachment(
  userId: string,
  attachmentId: string,
  chatId?: string,
  community = false,
) {
  if (community) {
    await communityActor(userId);
    const file = await prisma.communityChatAttachment.findFirst({
      where: { id: attachmentId, ownerUserId: userId, state: "READY" },
    });
    if (!file) throw new ChatError("CHAT_ATTACHMENT_FORBIDDEN", "Вложение недоступно", 403);
    const channel = streamServer().channel(COMMUNITY_CHANNEL_TYPE, COMMUNITY_CHANNEL_ID);
    await (file.kind === "image" ? channel.deleteImage(file.url) : channel.deleteFile(file.url));
    await prisma.communityChatAttachment.delete({ where: { id: file.id } });
    return;
  }
  const chat = await chatForActor(userId, chatId);
  const attachment = await prisma.chatAttachment.findFirst({
    where: { id: attachmentId, chatId: chat.id, ownerUserId: userId, state: "READY" },
  });
  if (!attachment) throw new ChatError("CHAT_ATTACHMENT_FORBIDDEN", "Вложение недоступно", 403);
  const channel = streamServer().channel(CHAT_CHANNEL_TYPE, chat.streamChannelId);
  await (attachment.kind === "image"
    ? channel.deleteImage(attachment.url)
    : channel.deleteFile(attachment.url));
  await prisma.chatAttachment.delete({ where: { id: attachment.id } });
}
