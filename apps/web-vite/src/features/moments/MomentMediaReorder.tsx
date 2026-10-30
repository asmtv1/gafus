import { useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  canReorderMomentMedia, reorderMomentMedia, type MomentEditor,
} from "./momentComposerApi";

type Attempt = { fingerprint: string; uuid: string };

/** Reorder only. No media object deletions or local source-of-truth mutation. */
export function MomentMediaReorder({ editor, disabled = false, onBusy, onSaved }: {
  editor: MomentEditor;
  disabled?: boolean;
  onBusy: (busy: boolean) => void;
  onSaved: (editor: MomentEditor) => void;
}) {
  const attempt = useRef<Attempt | null>(null);
  const mutation = useMutation({
    mutationFn: async ({ from, to }: { from: number; to: number }) => {
      if (disabled || !canReorderMomentMedia(editor)) {
        throw new Error("Перестановка недоступна");
      }
      const fingerprint = JSON.stringify([
        editor.id, editor.version, editor.pendingRevision?.attachmentIds, from, to,
      ]);
      if (attempt.current?.fingerprint !== fingerprint) {
        attempt.current = { fingerprint, uuid: crypto.randomUUID() };
      }
      onBusy(true);
      return reorderMomentMedia({
        editor, from, to, clientRequestId: attempt.current.uuid,
      });
    },
    onSuccess: updated => {
      attempt.current = null;
      onSaved(updated);
    },
    onSettled: () => onBusy(false),
  });
  if (!canReorderMomentMedia(editor)) return null;
  const ids = editor.pendingRevision!.attachmentIds;
  return <section className="moment-media-reorder" aria-label="Порядок вложений">
    <h3>Порядок фото и видео</h3>
    <p>Переставляйте вложения перед публикацией.
      Сами медиафайлы не удаляются.</p>
    <ol>{ids.map((id, index) => <li key={id}>
      <span>Вложение {index + 1}</span>
      <button type="button" disabled={disabled || mutation.isPending || index === 0}
        aria-label={"Переместить вложение " + (index + 1) + " вверх"}
        onClick={() => mutation.mutate({ from: index, to: index - 1 })}>
        Выше
      </button>
      <button type="button" disabled={disabled || mutation.isPending ||
        index === ids.length - 1}
        aria-label={"Переместить вложение " + (index + 1) + " вниз"}
        onClick={() => mutation.mutate({ from: index, to: index + 1 })}>
        Ниже
      </button>
    </li>)}</ol>
    {mutation.isPending && <p role="status">Сохраняем новый порядок…</p>}
    {mutation.isError && <p role="alert">
      Не удалось подтвердить порядок вложений. Повтор использует прежний запрос.
    </p>}
  </section>;
}
