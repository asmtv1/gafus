import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileTypeFromFile } from "file-type";
import { prisma } from "@gafus/prisma";
import { CHAT_LIMITS, chatAttachmentKind } from "@gafus/consultation-shared";
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

/** Server-owned temporary file; HTTP decoding and lifetime belong to the adapter. */
export interface ChatAttachmentFile {
  path: string;
  name: string;
  declaredMime: string;
}
export async function uploadChatAttachment(
  userId: string,
  file: ChatAttachmentFile,
  chatId?: string,
  community = false,
) {
  const chat = community
    ? await requireCommunityCanSend(userId)
    : await requireCanSend(userId, chatId);
  const channelType = community ? COMMUNITY_CHANNEL_TYPE : CHAT_CHANNEL_TYPE;
  const filePath = file.path;
  const declaredMime = file.declaredMime;
  const originalName = file.name.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 100) || "Вложение";
  let uploaded: { kind: string; url: string } | undefined;
  try {
    const type = await fileTypeFromFile(filePath);
    const size = (await stat(filePath)).size;
    if (
      type &&
      declaredMime &&
      declaredMime !== "application/octet-stream" &&
      declaredMime !== type.mime
    )
      throw new ChatError("CHAT_MIME_MISMATCH", "Формат файла не соответствует его содержимому");
    const kind = type ? chatAttachmentKind(type.mime) : null;
    const image = kind === "image";
    const video = kind === "video";
    if (!size || (!image && !video))
      throw new ChatError(
        "CHAT_UNSUPPORTED_FILE",
        "Поддерживаются JPG, PNG, WebP и видео MP4/MOV H.264",
      );
    if ((image && size > CHAT_LIMITS.imageBytes) || (video && size > CHAT_LIMITS.videoBytes))
      throw new ChatError(
        "CHAT_FILE_TOO_LARGE",
        image ? "Фото должно быть не больше 10 МБ" : "Видео должно быть не больше 100 МБ",
      );
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
    return await prisma.$transaction(async (tx) => {
      const owners = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      if (!owners.length) throw new ChatError("CHAT_FORBIDDEN", "Профиль удалён", 403);
      if (!community) {
        const chats = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "CynologistChat" WHERE "id" = ${chat.id} FOR UPDATE`;
        if (!chats.length) throw new ChatError("CHAT_FORBIDDEN", "Диалог удалён", 403);
      }
      const channel = streamServer().channel(channelType, chat.streamChannelId);
      const attachmentKind = image ? "image" : "video";
      const request = { timeout: 60_000, signal: AbortSignal.timeout(60_000) };
      const response = image
        ? await channel.sendImage(createReadStream(filePath), originalName, type!.mime, {
            id: `gafus-${userId}`,
          }, request)
        : await channel.sendFile(createReadStream(filePath), originalName, type!.mime, {
            id: `gafus-${userId}`,
          }, request);
      uploaded = { kind: attachmentKind, url: response.file };
      const data = {
        ownerUserId: userId,
        kind: attachmentKind,
        url: response.file,
        mime: type!.mime,
        size,
        name: originalName,
      };
      if (community) return await tx.communityChatAttachment.create({ data });
      return await tx.chatAttachment.create({
        data: {
          chatId: chat.id,
          ...data,
        },
      });
    }, { timeout: 90_000 });
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
