import { chat2SignedPrivateMedia, getSignedDownloadUrl } from "@gafus/cdn-upload";

export function createChatAvatars(
  prisma: Pick<typeof import("@gafus/prisma").prisma, "chat2Media">,
  signRoomAvatar: typeof chat2SignedPrivateMedia = chat2SignedPrivateMedia,
) {
  // Signed pictures expire after 10 minutes. Reuse their URLs for eight to
  // avoid forcing a new image download on every 12-15s chat-list refresh.
  // Ephemeral and bounded: no signed links are persisted to DB or logs.
  const avatarSignCache = new Map<string, { url: string; until: number }>();

  const avatarCacheTtlMs = 8 * 60 * 1000;

  const avatarCacheMax = 512;

  /** Never send private S3 object keys or untrusted URL schemes to chat clients. */
  async function chat2MemberAvatarUrl(raw: string | null): Promise<string | null> {
    if (!raw) return null;
    if (raw.startsWith("isodev-avatar:")) {
      const now = Date.now();
      const cached = avatarSignCache.get(raw);
      if (cached && cached.until > now) return cached.url;
      if (cached) avatarSignCache.delete(raw);
      try {
        const signed = await getSignedDownloadUrl(raw, 600);
        if (avatarSignCache.size >= avatarCacheMax) {
          const oldestKey = avatarSignCache.keys().next().value;
          if (oldestKey) avatarSignCache.delete(oldestKey);
        }
        avatarSignCache.set(raw, { url: signed, until: now + avatarCacheTtlMs });
        return signed;
      } catch {
        // A missing isolated S3 endpoint cannot block the conversation itself.
        return null;
      }
    }
    if (raw.startsWith("/") && !raw.startsWith("//") &&
        ![...raw].some((char) => {
          const code = char.charCodeAt(0);
          return code <= 31 || code === 127 || code === 92;
        })) return raw;
    try {
      const url = new URL(raw);
      return (url.protocol === "https:" || url.protocol === "http:") &&
        !!url.hostname && !url.username && !url.password ? url.href : null;
    } catch {
      return null;
    }
  }

  /** Never expose private keys; signed URLs are short-lived and membership-scoped. */
  const roomAvatarCache = new Map<string, { url: string; until: number }>();

  async function roomAvatarUrl(avatarMediaId: string | null): Promise<string | null> {
    if (!avatarMediaId) return null;
    const media = await prisma.chat2Media.findFirst({
      where: { id: avatarMediaId, status: "AVATAR" },
      select: { objectKey: true },
    });
    return media ? signedRoomAvatar(media.objectKey) : null;
  }

  async function roomAvatarUrls(mediaIds: (string | null)[]) {
    const ids = [...new Set(mediaIds.filter((id): id is string => Boolean(id)))];
    const rows = ids.length ? await prisma.chat2Media.findMany({
      where: { id: { in: ids }, status: "AVATAR" },
      select: { id: true, objectKey: true },
    }) : [];
    return new Map(await Promise.all(rows.map(async row =>
      [row.id, await signedRoomAvatar(row.objectKey)] as const)));
  }

  async function signedRoomAvatar(objectKey: string): Promise<string | null> {
    const now = Date.now();
    const cached = roomAvatarCache.get(objectKey);
    if (cached?.until && cached.until > now) return cached.url;
    if (cached) roomAvatarCache.delete(objectKey);
    try {
      const url = await signRoomAvatar(objectKey, 60);
      if (roomAvatarCache.size >= 512) {
        const first = roomAvatarCache.keys().next().value;
        if (first) roomAvatarCache.delete(first);
      }
      roomAvatarCache.set(objectKey, { url, until: now + 40_000 });
      return url;
    } catch { return null; }
  }

  return { chat2MemberAvatarUrl, roomAvatarUrl, roomAvatarUrls };
}
