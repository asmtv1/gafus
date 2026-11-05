import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { FEED_LIMITS } from "@gafus/types";
import { appendMomentMediaRevision, canAppendMomentMedia, type MomentEditor } from
  "./momentComposerApi";
import {
  uploadMomentPhoto, uploadMomentVideo,
  validateMomentPhoto, validateMomentVideo,
} from "./feedMediaTransfer";
import {PrimaryButton} from "../../shared/ui";
import { videoRetryMessage } from "../../shared/media/videoRetryMessage";
import { photoRetryMessage } from "../../shared/media/photoRetryMessage";

type Attempt = {
  fingerprint: string;
  requestId: string;
  revisionId: string;
  mediaId: string | null;
};

/** Add one file per versioned Core revision, preserving every prior attachment. */
export function MomentPhotoUpload({
  editor, onSaved, onBusy, disabled = false,
}: {
  editor: MomentEditor;
  disabled?: boolean;
  onSaved: (editor: MomentEditor) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [mediaKind, setMediaKind] = useState<"photo" | "video">("photo");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== "function") {
      setPreview(null); return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, mediaKind]);
  const attempt = useRef<Attempt | null>(null);
  const linked = editor.pendingRevision?.attachmentIds ?? [];
  const available = canAppendMomentMedia(editor);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!file || !available || disabled) {
        throw new Error("Этот черновик недоступен для загрузки");
      }
      if (mediaKind === "photo") validateMomentPhoto(file, linked.length);
      else validateMomentVideo(file, linked.length);
      const fingerprint = JSON.stringify([
        editor.id, editor.version, mediaKind, file.name, file.size,
        file.type, file.lastModified,
      ]);
      if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
        attempt.current = {
          fingerprint, requestId: crypto.randomUUID(),
          revisionId: crypto.randomUUID(), mediaId: null,
        };
      }
      const pending = attempt.current;
      onBusy(true);
      const upload = mediaKind === "photo" ? uploadMomentPhoto : uploadMomentVideo;
      const mediaId = pending.mediaId ?? await upload({
        postId: editor.id, file, clientRequestId: pending.requestId,
        existingCount: linked.length, onProgress: setProgress,
      });
      pending.mediaId = mediaId;
      setMessage("Файл передан. Привязываем к публикации…");
      return appendMomentMediaRevision({
        editor, mediaId, clientRequestId: pending.revisionId,
      });
    },
    onSuccess: updated => {
      attempt.current = null;
      setFile(null);
      setProgress(0);
      setMessage("Медиа добавлено к черновику");
      onSaved(updated);
    },
    onSettled: () => onBusy(false),
  });
  function select(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    try {
      const selectedKind = selected.type.startsWith("video/") ? "video" : "photo";
      if (selectedKind === "photo") validateMomentPhoto(selected, linked.length);
      else validateMomentVideo(selected, linked.length);
      setMediaKind(selectedKind);
      attempt.current = null;
      setMessage("");
      setProgress(0);
      setFile(selected);
      mutation.reset();
    } catch (error) {
      setFile(null);
      setMessage(error instanceof Error ? error.message : "Недопустимое вложение");
    }
    // A subsequent selection of the same photo must trigger onChange.
    event.target.value = "";
  }
  return <section className="moment-photo-upload" aria-label="Фото публикации">
    <div className="moment-photo-upload-heading">
      <h3>Фото и видео</h3>
      <span>{linked.length} из {FEED_LIMITS.maxAttachments}</span>
    </div>
    {available && <>
      <label className="moment-photo-upload-pick" htmlFor={"moment-photo-" + editor.id}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
          strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <circle cx="8.5" cy="9" r="1.5" />
          <path d="m4 17 5-5 3 3 3-3 3 3" />
          <path d="M12 6v6m-3-3h6" />
        </svg>
        Выбрать фото или видео
      </label>
      <input className="moment-photo-upload-input" id={"moment-photo-" + editor.id} type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
        onChange={select}
        disabled={disabled || mutation.isPending} />
      {file && preview && <div className="moment-video-retry-preview">
        {mediaKind === "video" ? <video src={preview} muted playsInline preload="metadata" aria-label={file.name} />
          : <img src={preview} alt={`Предпросмотр фото ${file.name}`} style={{width:160,height:130,objectFit:"cover",borderRadius:12}}/>}
        {mutation.isError && <button type="button" className="moment-video-retry-button"
          disabled={disabled || mutation.isPending} onClick={() => mutation.mutate()}
          aria-label={`Повторить обработку ${mediaKind === "video" ? "видео" : "фото"} ${file.name}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 11a8 8 0 1 0-2.3 6M20 4v7h-7" />
          </svg>
        </button>}
      </div>}
      {file && <p>Выбрано: {file.name}</p>}
      {file && <PrimaryButton type="button"
        disabled={disabled || mutation.isPending}
        onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Загружаем…" : mediaKind === "video"
          ? "Загрузить видео" : "Загрузить фото"}
      </PrimaryButton>}
      {mutation.isPending && <div role="status">
        <label htmlFor={"moment-progress-" + editor.id}>
          {mediaKind === "video" ? "Подготовка и загрузка видео" : "Передача фото"}: {progress}%
        </label>
        <progress id={"moment-progress-" + editor.id} max={100} value={progress} />
      </div>}
    </>}
    {file && mediaKind === "video" && <p className="note">
      Видео: не больше {FEED_LIMITS.videoSeconds} секунд и 200 МиБ. Длительность
      и безопасность файла дополнительно проверяет сервер.
    </p>}
    {message && <p role="status">{message}</p>}
    {mutation.isError && <p role="alert">
      {attempt.current?.mediaId
        ? "Не удалось завершить загрузку: файл уже подготовлен и передан, но сервер не подтвердил привязку к черновику. Повторите подтверждение круглой стрелкой — повторно отправлять файл не нужно."
        : mediaKind === "video" ? videoRetryMessage(mutation.error) : photoRetryMessage(mutation.error)}
      {!attempt.current?.mediaId && " Круглая стрелка повторит подготовку только этого файла."}
    </p>}
  </section>;
}
