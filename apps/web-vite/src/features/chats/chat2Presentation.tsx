import { chat2RoomName, chat2RoomAvatar } from "@gafus/core-client/chat2/room-presentation";
import { useEffect, useState } from "react";
import { type Chat2Conversation, type Chat2Kind } from "./chat2Api";
import css from "./Chat2Messenger.module.css";
import { publicImageUrl } from "../profile/publicProfileApi";
import { isolatedNonprodBrowserS3Url } from "../../shared/api/client";
export const timestamp = (raw: string) =>
  new Date(raw).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

export const kindEmoji: Record<Chat2Kind, string> = {
  DIRECT: "👤",
  CYNOLOGIST: "🐕",
  COMMUNITY: "🐾",
  COURSE: "🎓",
  COURSE_TOPIC: "📚",
  CITY: "🏙️",
  BREED: "🐶",
  GROUP: "👥",
};

export const roomName = (room: Pick<Chat2Conversation, "kind" | "name" | "members">, me: string) =>
  chat2RoomName(room, me, "Личная переписка");

/** Only a room-scoped signed Refactor image URL may bypass the public avatar filter. */
export function chat2ImageUrl(raw: string | null): string | null {
  if (!raw) return null;
  if (isolatedNonprodBrowserS3Url(raw, "documents", "signed-get")) {
    const url = new URL(raw);
    if (
      // eslint-disable-next-line max-len -- Security: keep the exact allowlist regex auditable.
      /^\/gafus-refactor-documents-test\/chat2\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/.test(
        url.pathname,
      )
    )
      return url.href;
  }
  return publicImageUrl(raw);
}

/** Direct chats show the other participant's photo; groups show the room avatar. */
export function Chat2Avatar({
  room,
  ownerId,
}: {
  room: Pick<Chat2Conversation, "kind" | "members" | "avatarUrl"> | undefined;
  ownerId: string;
}) {
  const raw = chat2RoomAvatar(room, ownerId);
  const url = chat2ImageUrl(raw);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <span className={css.avatar}>
      {url && !failed ? (
        <img
          className={css.avatarImage}
          src={url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : room ? (
        kindEmoji[room.kind]
      ) : (
        "💬"
      )}
    </span>
  );
}

/** Show the actual author's profile photo in message threads, with a safe fallback. */
export function Chat2MessageAvatar({ avatarUrl }: { avatarUrl?: string | null }) {
  const src = chat2ImageUrl(avatarUrl ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <span className={css.miniAvatar} aria-hidden="true">
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        "👤"
      )}
    </span>
  );
}


export const errorText = (e: unknown) => (e instanceof Error ? e.message : "Операция не выполнена");
