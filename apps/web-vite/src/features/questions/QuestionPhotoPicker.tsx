import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { QUESTION_LIMITS } from "@gafus/types";
import {
  discardUnusedQuestionPhoto, uploadQuestionPhoto, validateQuestionFiles,
  type PendingQuestionPhoto,
} from "./questionMedia";
import { SecondaryButton } from "../../shared/ui";
import "./QuestionPhotoPickerNext.css";

type LocalPreview = { key: number; localUrl: string; progress: number };

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

  async function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!files.length || busyRef.current || removing) return;
    setError("");
    try {
      validateQuestionFiles(files, existingCount + current.current.length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Некорректные фотографии");
      return;
    }

    // Immediately show every chosen thumbnail before the first network ACK.
    // Keep the local URL so the successful item does not flash/reload.
    const queued: LocalPreview[] = [];
    try {
      for (const file of files) {
        const localUrl = URL.createObjectURL(file);
        urls.current.add(localUrl);
        queued.push({ key: ++serial.current, localUrl, progress: 0 });
      }
    } catch (cause) {
      for (const preview of queued) {
        URL.revokeObjectURL(preview.localUrl);
        urls.current.delete(preview.localUrl);
      }
      setError(cause instanceof Error ? cause.message : "Не удалось показать фотографии");
      return;
    }

    setPreviews(queued);
    busyRef.current = true;
    setBusy(true);
    onBusy(true);
    let confirmed = 0;
    try {
      for (const [index, file] of files.entries()) {
        const preview=queued[index]!;
        const id = await uploadQuestionPhoto(file, progress=>{
          if(mounted.current)setPreviews(current=>current.map(item=>
            item.key===preview.key?{...item,progress}:item));
        });
        if (!mounted.current) {
          // Never adopt media into an unmounted author/editor. Core's 24h
          // orphan cleanup remains the fallback if this DELETE also fails.
          await discardUnusedQuestionPhoto(id).catch(() => undefined);
          break;
        }
        const item = queued[index];
        const next = [...current.current, { id, localUrl: item.localUrl }];
        current.current = next;
        onChange(next);
        confirmed = index + 1;
        setPreviews(queued.slice(confirmed));
      }
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : "Не удалось загрузить фото");
      }
    } finally {
      // Only confirmed photos survive; failed/unprocessed previews are revoked.
      for (const item of queued.slice(confirmed)) {
        if (!urls.current.delete(item.localUrl)) continue;
        URL.revokeObjectURL(item.localUrl);
      }
      busyRef.current = false;
      if (mounted.current) {
        setPreviews([]);
        setBusy(false);
        onBusy(false);
      }
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

  const count = existingCount + photos.length;
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
          aria-label={`Фото ${count + index + 1} загружается`}>
          <img src={preview.localUrl} alt={`Фото ${count + index + 1}`} />
          <span className="question-photo-uploading" role="status">
            {preview.progress>=100?"Обрабатываем фото…":"Загружаем "+preview.progress+"%"}
          </span>
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
