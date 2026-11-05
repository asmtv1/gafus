import { useEffect, useId, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { QUESTION_LIMITS } from "@gafus/types";
import {
  discardUnusedQuestionPhoto, uploadQuestionPhoto, validateQuestionFiles,
  type PendingQuestionPhoto, type PreparedQuestionBrowserPhoto,
} from "./questionMedia";
import { SecondaryButton } from "../../shared/ui";
import { photoRetryMessage } from "../../shared/media/photoRetryMessage";
import { prepareBrowserPhotoWebp } from "../../shared/media/browserPhotoWebp";
import "./QuestionPhotoPickerNext.css";

type LocalPreview = { key: number; file: File; localUrl: string; progress: number;
  phase: "queued" | "uploading" | "failed"; failure?: string };

/** Device-only WebP conversion on selection; server IDs only after an explicit submit. */
export function QuestionPhotoPicker({ photos, onChange, onBusy, existingCount = 0,
  submitUploadsRef }: {
  photos: PendingQuestionPhoto[];
  onChange: (photos: PendingQuestionPhoto[]) => void;
  onBusy: (busy: boolean) => void;
  /** Already-bound photos share the same five-image limit. */
  existingCount?: number;
  submitUploadsRef?: RefObject<(() => Promise<PendingQuestionPhoto[]>) | null>;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [previews, setPreviews] = useState<LocalPreview[]>([]);
  const [uploadFailures, setUploadFailures] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const urls = useRef(new Set<string>());
  const serial = useRef(0);
  const mounted = useRef(true);
  const current = useRef(photos);
  const busyRef = useRef(false);
  const prepared = useRef(new Map<string, { source: File; variants: PreparedQuestionBrowserPhoto }>());
  const confirmed = useRef(new Map<string, string>());
  current.current = photos;
  const previewsRef = useRef<LocalPreview[]>([]);
  const changePreviews = (change: (items: LocalPreview[]) => LocalPreview[]) => {
    previewsRef.current = change(previewsRef.current);
    if (mounted.current) setPreviews(previewsRef.current);
  };
  useEffect(() => {
    mounted.current = true;
    const allocated = urls.current;
    const local = prepared.current;
    const uploaded = confirmed.current;
    return () => {
      mounted.current = false;
      for (const url of allocated) URL.revokeObjectURL(url);
      allocated.clear();
      local.clear();
      uploaded.clear();
    };
  }, []);
  async function preparePhoto(preview: LocalPreview) {
    changePreviews(items => items.map(item => item.key === preview.key
      ? { ...item, phase: "uploading", failure: undefined } : item));
    try {
      // User has only selected a file: WebP conversion runs locally, no S3 request.
      const variants = await prepareBrowserPhotoWebp(preview.file, { small: 360, medium: 1440 });
      if (!mounted.current || !previewsRef.current.some(item => item.key === preview.key)) return;
      const id = `local-${crypto.randomUUID()}`;
      prepared.current.set(id, { source: preview.file, variants });
      const next = [...current.current, { id, localUrl: preview.localUrl }];
      current.current = next;
      onChange(next);
      changePreviews(items => items.filter(item => item.key !== preview.key));
    } catch (cause) {
      changePreviews(items => items.map(item => item.key === preview.key
        ? { ...item, phase: "failed", failure: photoRetryMessage(cause) } : item));
      if (mounted.current) setError("Не удалось обработать одно из фото. Нажмите стрелку на нём.");
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
    try { await preparePhoto(preview); }
    finally {
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusy(previewsRef.current.some(item => item.phase === "failed"));
      }
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
        queued.push({ key: ++serial.current, file, localUrl, progress: 0, phase: "queued" });
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
      for (const item of queued) {
        if (!mounted.current) break;
        await preparePhoto(item);
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusy(previewsRef.current.some(item => item.phase === "failed"));
      }
    }
  }
  async function uploadOneLocal(photo: PendingQuestionPhoto): Promise<string> {
    const done = confirmed.current.get(photo.id);
    if (done) return done;
    const draft = prepared.current.get(photo.id);
    if (!draft) throw Error("Фотография недоступна. Добавьте её заново.");
    setUploadFailures(previous => { const next = { ...previous }; delete next[photo.id]; return next; });
    try {
      const id = await uploadQuestionPhoto(draft.source, undefined, draft.variants);
      confirmed.current.set(photo.id, id);
      return id;
    } catch {
      setUploadFailures(previous => ({ ...previous,
        [photo.id]: "Ошибка отправки · повторите загрузку этого фото",
      }));
      throw Error("Не удалось загрузить фото. Проверьте интернет и нажмите отправку ещё раз.");
    }
  }
  async function flushDraftUploads(): Promise<PendingQuestionPhoto[]> {
    if (busyRef.current || removing) throw Error("Подготовка фотографий ещё не завершена.");
    busyRef.current = true;
    setBusy(true);
    onBusy(true);
    const selected = [...current.current];
    const ready: PendingQuestionPhoto[] = [];
    setError("");
    try {
      for (const photo of selected) {
        if (!photo.id.startsWith("local-")) { ready.push(photo); continue; }
        try {
          const id = await uploadOneLocal(photo);
          ready.push({ ...photo, id });
        } catch (reason) {
          if (mounted.current) setError(reason instanceof Error ? reason.message : "Ошибка отправки фото");
          throw reason;
        }
      }
      // Real server IDs may enter the question/answer only after every upload is confirmed.
      if (mounted.current) {
        current.current = ready;
        onChange(ready);
      }
      return ready;
    } finally {
      busyRef.current = false;
      if (mounted.current) { setBusy(false); onBusy(previewsRef.current.some(item => item.phase === "failed")); }
    }
  }
  useEffect(() => {
    if (!submitUploadsRef) return;
    submitUploadsRef.current = flushDraftUploads;
    return () => { submitUploadsRef.current = null; };
  });
  async function retryFailedUpload(photo: PendingQuestionPhoto) {
    if (busyRef.current || removing) return;
    busyRef.current = true;
    setBusy(true);
    onBusy(true);
    try {
      await uploadOneLocal(photo);
      if (mounted.current) {
        setUploadFailures(previous => { const next = { ...previous }; delete next[photo.id]; return next; });
        setError("");
      }
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : "Не удалось повторить загрузку");
    } finally {
      busyRef.current = false;
      if (mounted.current) { setBusy(false); onBusy(false); }
    }
  }
  async function removePhoto(photo: PendingQuestionPhoto) {
    if (busyRef.current || removing) return;
    setRemoving(photo.id);
    onBusy(true);
    setError("");
    try {
      // Never send an S3 DELETE for a never-submitted local photo.
      const remoteId = photo.id.startsWith("local-")
        ? confirmed.current.get(photo.id) : photo.id;
      if (remoteId) await discardUnusedQuestionPhoto(remoteId);
      if (mounted.current) {
        const next = current.current.filter(item => item.id !== photo.id);
        current.current = next;
        onChange(next);
        prepared.current.delete(photo.id);
        confirmed.current.delete(photo.id);
        setUploadFailures(previous => { const nextFailures = { ...previous };
          delete nextFailures[photo.id]; return nextFailures; });
        URL.revokeObjectURL(photo.localUrl);
        urls.current.delete(photo.localUrl);
      }
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : "Не удалось удалить фото");
    } finally {
      if (mounted.current) { setRemoving(null); onBusy(false); }
    }
  }
  const count = existingCount + photos.length + previews.length;
  const atLimit = count >= QUESTION_LIMITS.photos;
  return <div className="question-photo-picker question-photo-picker-next">
    <div className="question-photo-picker-grid" aria-label="Фотографии к публикации">
      {photos.map((photo, index) =>
        <div key={photo.id} className="question-photo-slot">
          <img src={photo.localUrl} alt={`Фото ${index + 1}`} />
          {uploadFailures[photo.id] && <button type="button" className="question-photo-retry"
            aria-label={`Повторить загрузку фото ${index + 1}`} title="Повторить отправку этого фото"
            disabled={busy || Boolean(removing)} onClick={() => void retryFailedUpload(photo)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 11a8 8 0 1 0-2.3 6M20 4v7h-7" />
            </svg>
          </button>}
          {photo.id.startsWith("local-") && <span className="question-photo-uploading" role="status">
            {uploadFailures[photo.id] ? "Ошибка отправки · повторить" : "Готово к отправке"}
          </span>}
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
              title="Повторить локальную обработку этой фотографии"
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
            {preview.phase === "queued" ? "В очереди" : "Подготавливаем на устройстве…"}
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
