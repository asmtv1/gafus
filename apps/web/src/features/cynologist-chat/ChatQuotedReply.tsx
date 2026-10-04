"use client";
import { useChannelActionContext, useMessageContext } from "stream-chat-react";
import styles from "./chat.module.css";
export function ChatQuotedReply() {
  const { message } = useMessageContext();
  const { jumpToMessage } = useChannelActionContext();
  const quote = message.quoted_message;
  if (!quote) return null;
  const deleted = !!quote.deleted_at || quote.type === "deleted";
  const attachment = quote.attachments?.[0];
  const thumbnail = attachment?.image_url || attachment?.thumb_url;
  const excerpt = deleted
    ? "Сообщение удалено"
    : quote.text ||
      (attachment?.type === "video"
        ? "Видео"
        : attachment?.type === "image"
          ? "Фото"
          : attachment?.title || "Вложение");
  return (
    <button
      type="button"
      className={styles.quotedReply}
      aria-label={`Перейти к сообщению ${quote.user?.name || "Пользователь"}: ${excerpt}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void jumpToMessage(quote.id);
      }}
    >
      {!deleted && !!thumbnail && <img src={thumbnail} alt="" width={36} height={36} />}
      <span>
        <strong>{quote.user?.name || "Пользователь"}</strong>
        <span className={styles.quotedExcerpt}>{excerpt}</span>
      </span>
    </button>
  );
}
