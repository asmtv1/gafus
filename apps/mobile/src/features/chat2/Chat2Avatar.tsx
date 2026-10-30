/* eslint-disable @gafus/require-client-catch-tracer -- malformed avatar URL is expected external data; never log signed links. */
import { useState, type ReactNode } from "react";
import { Image, type ImageStyle } from "react-native";
import type { Conversation } from "./api";

/** Validate profile picture links just like conversation avatar links.
 * The backend resolves private object keys into signed read URLs.
 */
function safeChat2AvatarUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 4096) return null;
  try {
    const parsed = new URL(raw);
    return ((parsed.protocol === "https:" || parsed.protocol === "http:") &&
      !!parsed.hostname && !parsed.username && !parsed.password) ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Profile photo of a particular sender in a group, course or direct chat. */
export function chat2MessageAuthorAvatarUrl(
  room: Pick<Conversation, "members"> | null,
  authorId: string,
): string | null {
  return safeChat2AvatarUrl(room?.members.find((member) => member.userId === authorId)?.avatarUrl);
}

/** Message avatars never use the group icon or another member's portrait. */
export function Chat2MessageAuthorAvatar({
  room, authorId, children,
}: {
  room: Pick<Conversation, "members"> | null;
  authorId: string;
  children?: ReactNode;
}) {
  const avatarUrl = chat2MessageAuthorAvatarUrl(room, authorId);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return avatarUrl && avatarUrl !== failedUrl ? (
    <Image
      source={{ uri: avatarUrl }}
      accessibilityIgnoresInvertColors
      accessible={false}
      style={avatarStyle}
      resizeMode="cover"
      onError={() => setFailedUrl(avatarUrl)}
    />
  ) : <>{children}</>;
}

/** Direct chats use the other member photo; groups use their own uploaded avatar. */
export function chat2ParticipantAvatarUrl(
  room: Pick<Conversation, "kind" | "members"> & Partial<Pick<Conversation, "avatarUrl">> | null,
  ownerId: string,
): string | null {
  if (!room) return null;
  const raw = room.kind === "DIRECT" || room.kind === "CYNOLOGIST"
    ? room.members.find((member) => member.userId !== ownerId)?.avatarUrl
    : room.avatarUrl;
  return safeChat2AvatarUrl(raw);
}

export function Chat2Avatar({
  room, ownerId, children,
}: {
  room: Pick<Conversation, "kind" | "members"> & Partial<Pick<Conversation, "avatarUrl">> | null;
  ownerId: string;
  children?: ReactNode;
}) {
  const avatarUrl = chat2ParticipantAvatarUrl(room, ownerId);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return avatarUrl && avatarUrl !== failedUrl ? (
    <Image
      source={{ uri: avatarUrl }}
      accessibilityIgnoresInvertColors
      accessible={false}
      style={avatarStyle}
      resizeMode="cover"
      onError={() => setFailedUrl(avatarUrl)}
    />
  ) : <>{children}</>;
}

const avatarStyle: ImageStyle = { width: "100%", height: "100%", borderRadius: 999 };
