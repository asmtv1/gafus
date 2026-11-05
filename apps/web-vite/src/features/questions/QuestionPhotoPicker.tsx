import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { QUESTION_LIMITS } from "@gafus/types";
import {
  discardUnusedQuestionPhoto, uploadQuestionPhoto, validateQuestionFiles,
  type PendingQuestionPhoto,
} from "./questionMedia";
import { SecondaryButton } from "../../shared/ui";
import { photoRetryMessage } from "../../shared/media/photoRetryMessage";
import "./QuestionPhotoPickerNext.css";

type LocalPreview = { key: number; file: File; localUrl: string; progress: number;
  phase: "queued" | "uploading" | "failed"; failure?: string };

/** Next's image-tile picker, with early local previews and safe server ACKs.
 * The parent receives only confirmed IDs; local preview tokens never enter DTO. */
export function QuestionPhotoPicker({ photos, onChange, onBusy, existingCount = 0 }: {
  photos: PendingQuestionPhoto[];
  onChange: (photos: PendingQuestionPhoto[]) => void;
  onBusy: (busy: boolean) => void;
  /** Already-bound photos share the same five-image limit. */
  existingCount?: number;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [previews, setPreviews] = useState<LocalPreview[]>([]);
  const [error, setError] = useState("");
  const urls = useRef(new Set<string>());
  const serial = useRef(0);
  const mounted = useRef(true);
  const current = useRef(photos);
  const busyRef = useRef(false);
  current.current = photos;

  useEffect(() => {
    mounted.current = true;
    const allocated = urls.current;
    return () => {
      mounted.current = false;
      for (const url of allocated) URL.revokeObjectURL(url);
      allocated.clear();
    };
  }, []);

  const previewsRef = useRef<LocalPreview[]>([]);
  const changePreviews = (change: (items: LocalPreview[]) => LocalPreview[]) => {
    previewsRef.current = change(previewsRef.current);
    if (mounted.current) setPreviews(previewsRef.current);
  };
  async function sendPhoto(preview: LocalPreview) {
    changePreviews(items => items.map(item => item.key === preview.key
      ? {...item, phase:"uploading", progress:0, failure:undefined} : item));
    try {
      const id = await uploadQuestionPhoto(preview.file, progress => {
        changePreviews(items => items.map(item => item.key === preview.key
          ? {...item, progress} : item));
      });
      if (!mounted.current) {
        await discardUnusedQuestionPhoto(id).catch(() => undefined);
        return;
      }
      const next = [...current.current, {id, localUrl: preview.localUrl}];
      current.current = next;
      onChange(next);
      changePreviews(items => items.filter(item => item.key !== preview.key));
    } catch (cause) {
      const failure = photoRetryMessage(cause);
      changePreviews(items => items.map(item => item.key === preview.key
        ? {...item, phase:"failed", failure} : item));
      if (mounted.current) setError("Не удалось загрузить одно из фото. Нажмите круглую стрелку на нём — другие фото повторно не отправятся.");
    }
  }
  async function retryPhoto(key: number) {
    if (busyRef.current || removing) return;
    const preview = previewsRef.current.find(item => item.key === key && item.phase === "failed");
    if (!preview) return;
    busyRef.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try { await sendPhoto(preview); }
    finally {
      busyRef.current = false;
      if (mounted.current) { setBusy(false); onBusy(previewsRef.current.some(item => item.phase === "failed")); }
    }
  }
  function removeFailed(key: number) {
    if (busyRef.current) return;
    const preview = previewsRef.current.find(item => item.key === key && item.phase === "failed");
    if (!preview) return;
    changePreviews(items => items.filter(item => item.key !== key));
    onBusy(previewsRef.current.some(item => item.phase === "failed"));
    URL.revokeObjectURL(preview.localUrl);
    urls.current.delete(preview.localUrl);
  }
  async function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!files.length || busyRef.current || removing) return;
    setError("");
    try { validateQuestionFiles(files, existingCount + current.current.length + previewsRef.current.length); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : "Некорректные фотографии");
      return;
    }
    const queued: LocalPreview[] = [];
    try {
      for (const file of files) {
        const localUrl = URL.createObjectURL(file);
        urls.current.add(localUrl);
        queued.push({key: ++serial.current, file, localUrl, progress: 0, phase:"queued"});
      }
    } catch {
      for (const item of queued) {
        URL.revokeObjectURL(item.localUrl); urls.current.delete(item.localUrl);
      }
      setError("Не удалось показать выбранное фото. Выберите файл заново.");
      return;
    }
    changePreviews(items => [...items, ...queued]);
    busyRef.current = true;
    setBusy(true);
    onBusy(true);
    try {
      // One failed image must not prevent the remaining selected images from
      // processing. Failed local File+preview stay until retry or removal.
      for (const item of queued) {
        if (!mounted.current) break;
        await sendPhoto(item);
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) { setBusy(false); onBusy(previewsRef.current.some(item => item.phase === "failed")); }
    }
  }

  async function removePhoto(photo: PendingQuestionPhoto) {
    if (busyRef.current || removing) return;
    setRemoving(photo.id);
    onBusy(true);
    setError("");
    try {
      // Keep the thumbnail until Core acknowledges deletion of the orphan.
      await discardUnusedQuestionPhoto(photo.id);
      if (mounted.current) {
        const next = current.current.filter(item => item.id !== photo.id);
        current.current = next;
        onChange(next);
        URL.revokeObjectURL(photo.localUrl);
        urls.current.delete(photo.localUrl);
      }
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : "Не удалось удалить фото");
      }
    } finally {
      if (mounted.current) {
        setRemoving(null);
        onBusy(false);
      }
    }
  }

  const count = existingCount + photos.length + previews.length;
  const atLimit = count >= QUESTION_LIMITS.photos;
  return <div className="question-photo-picker question-photo-picker-next">
    <div className="question-photo-picker-grid" aria-label="Фотографии к публикации">
      {photos.map((photo, index) =>
        <div key={photo.id} className="question-photo-slot">
          <img src={photo.localUrl} alt={`Фото ${index + 1}`} />
          <SecondaryButton type="button" className="question-photo-remove"
            aria-label={`Убрать фото ${index + 1}`} title="Убрать фото"
            disabled={busy || Boolean(removing)}
            onClick={() => void removePhoto(photo)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round"><path d="M6 6 18 18M18 6 6 18"/></svg>
          </SecondaryButton>
          {removing === photo.id && <span className="question-photo-uploading">Удаляем…</span>}
        </div>)}
      {previews.map((preview, index) =>
        <div key={preview.key} className="question-photo-slot question-photo-slot-pending"
          aria-label={`Фото ${index + 1}: ${preview.phase === "failed" ? "ошибка" : "загрузка"}`}>
          <img src={preview.localUrl} alt={`Фото ${index + 1}`} />
          {preview.phase === "failed" ? <>
            <button type="button" className="question-photo-retry"
              aria-label={`Повторить обработку фото ${preview.file.name}`}
              title="Повторить обработку и загрузку только этой фотографии"
              disabled={busy || Boolean(removing)} onClick={() => void retryPhoto(preview.key)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 11a8 8 0 1 0-2.3 6M20 4v7h-7"/>
              </svg>
            </button>
            <button type="button" className="question-photo-remove-failed"
              aria-label={`Убрать неудавшееся фото ${preview.file.name}`}
              disabled={busy} onClick={() => removeFailed(preview.key)}>×</button>
            <span className="question-photo-uploading question-photo-failed" title={preview.failure}>Ошибка · повторить</span>
          </> : <span className="question-photo-uploading" role="status">
            {preview.phase === "queued" ? "В очереди" :
              preview.progress>=100 ? "Подтверждаем…" : "Загружаем "+preview.progress+"%"}
          </span>}
          {preview.failure && <span className="question-photo-failure-description" role="alert">
            {preview.failure}
          </span>}
        </div>)}
      {!atLimit && <SecondaryButton className="question-photo-add" type="button"
        disabled={busy || Boolean(removing)}
        onClick={() => inputRef.current?.click()} aria-controls={inputId}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <circle cx="8.5" cy="9" r="1.4" />
          <path d="m5 17 5-5 3 3 3-3 3 3M12 3v5m-2.5-2.5h5" />
        </svg>
        <span>{busy ? "Загружаем…" : "Добавить фото"}</span>
      </SecondaryButton>}
    </div>
    <input ref={inputRef} id={inputId} type="file" multiple hidden
      aria-label="Выбрать фотографии"
      accept="image/jpeg,image/png,image/webp"
      disabled={busy || Boolean(removing) || atLimit}
      onChange={event => void addPhotos(event)} />
    <p className="question-photo-hint">
      {count} из {QUESTION_LIMITS.photos} фото · JPG, PNG, WebP · до 10 МБ каждое
    </p>
    {error && <p role="alert" className="question-photo-error">{error}</p>}
  </div>;
}
