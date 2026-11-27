import { useSyncExternalStore, type FormEvent } from "react";
import type { Chat2Draft } from "@gafus/core-client/chat2/draft";
import css from "./Chat2Messenger.module.css";

/** Only the composer subscribes to keystrokes. History, media players and
 * realtime subscriptions stay mounted and do not rerender on draft edits. */
export function Chat2Composer({
  draftState, onDraftChange, onSubmit, onFiles, editing, busy, uploading,
  mediaCount, hasUnpreparedMedia,
}: {
  draftState: Chat2Draft;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFiles: (files: FileList | null) => void;
  editing: boolean;
  busy: boolean;
  uploading: boolean;
  mediaCount: number;
  hasUnpreparedMedia: boolean;
}) {
  const draft = useSyncExternalStore(draftState.subscribe, draftState.getSnapshot, draftState.getSnapshot);
  return (
  <form className={css.composer} onSubmit={onSubmit}>
    <div className={css.composerField}>
      {!editing && (
        <label className={css.attachButton} title="Добавить фото, видео MP4 или PDF">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m20.8 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
          </svg>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf"
            multiple
            disabled={busy || uploading || mediaCount >= 8}
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = "";
            }}
            aria-label="Прикрепить фото, видео или PDF"
          />
        </label>
      )}
      <textarea
        aria-label="Текст сообщения"
        rows={1}
        maxLength={8000}
        value={draft}
        placeholder="Напишите сообщение…"
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
    </div>
    <button
      className={css.send}
      type="submit"
      disabled={
        busy ||
        uploading ||
        (!draft.trim() && !mediaCount) ||
        hasUnpreparedMedia
      }
      aria-label={editing ? "Сохранить сообщение" : "Отправить сообщение"}
    >
      {editing ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m5 12 4 4L19 6" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m22 2-7 20-4-9-9-4L22 2ZM22 2 11 13" />
        </svg>
      )}
    </button>
  </form>
  );
}
