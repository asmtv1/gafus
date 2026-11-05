import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FEED_LIMITS,
  FEED_PHOTO_MIME_TYPES,
  FEED_VIDEO_MIME_TYPES,
  countFeedCharacters,
} from "@gafus/types";
import {
  uploadMomentPhoto,
  uploadMomentVideo,
  validateMomentPhoto,
  validateMomentVideo,
} from "./feedMediaTransfer";
import { MomentAlbumPhotoPicker } from "./MomentAlbumPhotoPicker";
import { momentUploadPool } from "./momentUploadPool";
import { feedClient } from "./feedClient";
import {
  getPublishedMomentEditor,
  publishPublishedMomentText,
  savePublishedMomentText,
  type PublishedMomentEditor,
} from "./momentPublishedEditor";
import { PrimaryButton, SecondaryButton, Loading } from "../../shared/ui";
import styles from "./MomentEditPublishedText.module.css";

type Attempt = { fingerprint: string; uuid: string };
type NewMedia = { file: File; requestId: string };
const photoMimes: readonly string[] = FEED_PHOTO_MIME_TYPES;
const videoMimes: readonly string[] = FEED_VIDEO_MIME_TYPES;

/** Core owns author rights, edit window, version conflicts and publication. */
type PublishedTextProps = {
  userId: string;
  postId: string;
  /** Legacy Next /feed/create?edit=... opens directly into this editor. */
  initiallyOpen?: boolean;
  onClose?: () => void;
};

export function MomentEditPublishedText(props: PublishedTextProps) {
  return (
    <MomentEditPublishedTextTarget
      key={JSON.stringify([props.userId, props.postId, props.initiallyOpen ?? false])}
      {...props}
    />
  );
}

function MomentEditPublishedTextTarget({
  userId,
  postId,
  initiallyOpen = false,
  onClose,
}: PublishedTextProps) {
  // A connected trigger survives opening and can receive focus after closing.
  const baseId = useId();
  const panelId = baseId + "-editor";
  const headingId = baseId + "-heading";
  const fieldId = baseId + "-text";
  const countId = baseId + "-count";
  const saveErrorId = baseId + "-save-error";
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const denialRef = useRef<HTMLParagraphElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const publishButtonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const initialFocusIntent = useRef(false);
  const publishFocusIntent = useRef(false);
  const returnFocusIntent = useRef(false);
  const writeFlight = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [open, setOpen] = useState(initiallyOpen);
  const [text, setText] = useState("");
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [newMedia, setNewMedia] = useState<NewMedia[]>([]);
  const [albumPhotoIds, setAlbumPhotoIds] = useState<string[]>([]);
  const copiedAlbums = useRef(new Map<string, { requestId: string; mediaId?: string }>());
  const [mediaError, setMediaError] = useState("");
  const [uploadProgress, setUploadProgress] = useState("");
  const confirmedUploads = useRef(new Map<string, string>());
  const [editorOverride, setEditorOverride] = useState<PublishedMomentEditor | null>(null);
  const [sent, setSent] = useState(false);
  const [publishingOneClick, setPublishingOneClick] = useState(false);
  const [oneClickError, setOneClickError] = useState("");
  const saveAttempt = useRef<Attempt | null>(null);
  const publishAttempt = useRef<string | null>(null);
  const initialized = useRef(false);
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["moments", "published-editor", userId, postId],
    queryFn: () => getPublishedMomentEditor(postId),
    enabled: open,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  useEffect(() => {
    if (query.data && !initialized.current) {
      setText(query.data.pendingRevision?.text ?? query.data.text);
      setMediaIds(query.data.pendingRevision?.attachmentIds ?? query.data.attachmentIds);
      initialized.current = true;
    }
  }, [query.data]);
  const latest = query.data;
  const editor = editorOverride?.version === latest?.version ? latest : (editorOverride ?? latest);
  const save = useMutation({
    mutationFn: async ({
      body,
      orderedIds,
      additions,
      albums,
    }: {
      body: string;
      orderedIds: string[];
      additions: NewMedia[];
      albums: string[];
    }) => {
      if (!editor) throw new Error("Редактор недоступен");
      const fingerprint = JSON.stringify([
        editor.id,
        editor.version,
        editor.attachmentIds,
        orderedIds,
        body,
        additions.map((item) => item.requestId),
        albums,
      ]);
      if (saveAttempt.current?.fingerprint !== fingerprint) {
        saveAttempt.current = { fingerprint, uuid: crypto.randomUUID() };
      }
      // Upload originals directly to signed private S3 first. A successful POST
      // is NOT a published asset; Core activates the revision only after READY.
      // S3 transfers are independent and can run five at once; the final
      // versioned revision write remains a single ordered Core CAS.
      const uploadedIds = await momentUploadPool(additions, async (item, index) => {
        let mediaId = confirmedUploads.current.get(item.requestId);
        if (!mediaId) {
          const transfer = photoMimes.includes(item.file.type)
            ? uploadMomentPhoto
            : uploadMomentVideo;
          mediaId = await transfer({
            postId: editor.id,
            file: item.file,
            clientRequestId: item.requestId,
            existingCount: orderedIds.length + index,
            onProgress: (percent) => {
              if (active.current)
                setUploadProgress(
                  `Загружаем вложение ${index + 1} из ${additions.length}: ${percent}%`,
                );
            },
          });
          confirmedUploads.current.set(item.requestId, mediaId);
        }
        return mediaId;
      });
      for (const photoId of albums) {
        let copy = copiedAlbums.current.get(photoId);
        if (!copy) {
          copy = { requestId: crypto.randomUUID() };
          copiedAlbums.current.set(photoId, copy);
        }
        if (!copy.mediaId) {
          if (active.current) setUploadProgress("Копируем фотографию из альбома…");
          const copied = await feedClient.copyAlbumPhoto(editor.id, {
            photoId,
            clientRequestId: copy.requestId,
          });
          if (copied?.kind !== "photo" || !/^[A-Za-z0-9_-]{1,128}$/.test(copied.id))
            throw new Error("Сервер не подтвердил копирование фото из альбома");
          copy.mediaId = copied.id;
        }
        uploadedIds.push(copy.mediaId);
      }
      if (active.current)
        setUploadProgress(additions.length || albums.length ? "Обрабатываем публикацию…" : "");
      return savePublishedMomentText({
        editor,
        text: body,
        clientRequestId: saveAttempt.current.uuid,
        attachmentIds: [...orderedIds, ...uploadedIds],
        uploadedMediaIds: uploadedIds,
      });
    },
    onSuccess: async (updated) => {
      if (active.current) {
        setEditorOverride(updated);
        publishAttempt.current = null;
        saveAttempt.current = null;
        setUploadProgress("");
      }
      await cache.invalidateQueries({ queryKey: ["moments", "published-editor", userId, postId] });
    },
  });
  const publish = useMutation({
    mutationFn: () => {
      if (!editor) throw new Error("Редактор недоступен");
      publishAttempt.current ??= crypto.randomUUID();
      return publishPublishedMomentText(editor, publishAttempt.current);
    },
    onSuccess: async (updated) => {
      if (active.current) {
        setSent(true);
        setEditorOverride(updated);
      }
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["moments", "published-editor", userId, postId] }),
        cache.invalidateQueries({ queryKey: ["moments", "post", userId, postId] }),
        cache.invalidateQueries({ queryKey: ["moments", "list", userId] }),
        cache.invalidateQueries({ queryKey: ["moments", "profile", userId] }),
      ]);
    },
  });
  const busy = save.isPending || publish.isPending || publishingOneClick || query.isFetching;
  const pending = editor?.pendingRevision;
  // Initial keyboard entry: announce loading and, once ready, move into the
  // edit control. A later background GET never triggers another focus move.
  useEffect(() => {
    if (!open || !initialFocusIntent.current) return;
    const current = document.activeElement;
    if (
      current !== document.body &&
      current !== triggerRef.current &&
      !panelRef.current?.contains(current)
    ) {
      initialFocusIntent.current = false;
      return;
    }
    if (query.isPending) {
      loadingRef.current?.focus();
      return;
    }
    if (busy) return;
    const target =
      textareaRef.current ?? publishButtonRef.current ?? denialRef.current ?? closeRef.current;
    if (target) {
      target.focus();
      initialFocusIntent.current = false;
    }
  }, [open, query.isPending, busy, editor, pending]);
  // After a successful save, the textarea is replaced by the published
  // revision controls. Only focus the new publish action if this editor owned
  // keyboard focus and the user has not switched to an external control.
  useEffect(() => {
    if (
      !open ||
      !publishFocusIntent.current ||
      busy ||
      !pending ||
      !["draft", "failed"].includes(pending.status)
    )
      return;
    const current = document.activeElement;
    if (current !== document.body && !panelRef.current?.contains(current)) {
      publishFocusIntent.current = false;
      return;
    }
    if (publishButtonRef.current) {
      publishButtonRef.current.focus();
      publishFocusIntent.current = false;
    }
  }, [open, busy, pending]);
  useEffect(() => {
    if (open || !returnFocusIntent.current) return;
    returnFocusIntent.current = false;
    // Closing a focused inline editor unmounts its active control, leaving
    // body focused. Do not steal focus when a different control owns it.
    if (document.activeElement === document.body) triggerRef.current?.focus();
  }, [open]);
  function openEditor() {
    initialFocusIntent.current = document.activeElement === triggerRef.current;
    publishFocusIntent.current = false;
    setOpen(true);
    initialized.current = false;
    setEditorOverride(null);
    setText("");
    setMediaIds([]);
    setNewMedia([]);
    setAlbumPhotoIds([]);
    confirmedUploads.current.clear();
    copiedAlbums.current.clear();
    setMediaError("");
    setUploadProgress("");
    setSent(false);
    setPublishingOneClick(false);
    setOneClickError("");
  }
  function closeEditor() {
    if (save.isPending || publish.isPending || writeFlight.current) return;
    returnFocusIntent.current = !!panelRef.current?.contains(document.activeElement);
    initialFocusIntent.current = false;
    publishFocusIntent.current = false;
    initialized.current = false;
    setOpen(false);
    setEditorOverride(null);
    onClose?.();
  }
  function selectMedia(files: FileList | null) {
    const additions = Array.from(files ?? []);
    if (!editor || !additions.length) return;
    try {
      if (
        mediaIds.length + newMedia.length + albumPhotoIds.length + additions.length >
        FEED_LIMITS.maxAttachments
      )
        throw new Error("Всего можно добавить не более 10 вложений");
      const alreadyVideo =
        mediaIds.filter((id) => {
          const index = editor.attachmentIds.indexOf(id);
          return editor.attachmentKinds?.[index] === "video";
        }).length + newMedia.filter((item) => videoMimes.includes(item.file.type)).length;
      if (
        alreadyVideo + additions.filter((file) => videoMimes.includes(file.type)).length >
        FEED_LIMITS.maxVideos
      )
        throw new Error("В публикации может быть не более 3 видео");
      for (const [index, file] of additions.entries()) {
        if (photoMimes.includes(file.type))
          validateMomentPhoto(file, mediaIds.length + newMedia.length + index);
        else validateMomentVideo(file, mediaIds.length + newMedia.length + index);
      }
      setNewMedia((items) => [
        ...items,
        ...additions.map((file) => ({
          file,
          requestId: crypto.randomUUID(),
        })),
      ]);
      saveAttempt.current = null;
      setMediaError("");
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Недопустимое вложение");
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !editor ||
      !editor.canEdit ||
      busy ||
      writeFlight.current ||
      pending ||
      mediaError ||
      (!text.trim() &&
        !mediaIds.length &&
        !newMedia.length &&
        !albumPhotoIds.length &&
        !editor.hasPoll) ||
      countFeedCharacters(text.trim()) > FEED_LIMITS.postCharacters
    )
      return;
    writeFlight.current = true;
    publishFocusIntent.current = !!panelRef.current?.contains(document.activeElement);
    void save
      .mutateAsync({
        body: text.trim(),
        orderedIds: [...mediaIds],
        additions: [...newMedia],
        albums: [...albumPhotoIds],
      })
      .catch(() => undefined)
      .finally(() => {
        writeFlight.current = false;
      });
  }
  /** Next-compatible single intent: upload/copy → CAS save → publish.
   * A committed revision with an uncertain publish ACK is recoverable via the
   * existing explicit same-UUID publish action; never issue another revision. */
  function submitAndPublish() {
    if (
      !editor ||
      !editor.canEdit ||
      pending ||
      busy ||
      writeFlight.current ||
      mediaError ||
      (!text.trim() &&
        !mediaIds.length &&
        !newMedia.length &&
        !albumPhotoIds.length &&
        !editor.hasPoll) ||
      mediaIds.length + newMedia.length + albumPhotoIds.length > FEED_LIMITS.maxAttachments ||
      countFeedCharacters(text.trim()) > FEED_LIMITS.postCharacters
    )
      return;
    writeFlight.current = true;
    setPublishingOneClick(true);
    setOneClickError("");
    const input = {
      body: text.trim(),
      orderedIds: [...mediaIds],
      additions: [...newMedia],
      albums: [...albumPhotoIds],
    };
    void (async () => {
      try {
        const saved = await save.mutateAsync(input);
        // An old owner's successful save must never publish after unmount.
        if (!active.current) return;
        publishAttempt.current ??= crypto.randomUUID();
        const confirmed = await publishPublishedMomentText(saved, publishAttempt.current);
        if (active.current) {
          setSent(true);
          setEditorOverride(confirmed);
        }
        await Promise.all([
          cache.invalidateQueries({ queryKey: ["moments", "published-editor", userId, postId] }),
          cache.invalidateQueries({ queryKey: ["moments", "post", userId, postId] }),
          cache.invalidateQueries({ queryKey: ["moments", "list", userId] }),
          cache.invalidateQueries({ queryKey: ["moments", "profile", userId] }),
        ]);
      } catch {
        if (active.current)
          setOneClickError(
            "Изменения не подтверждены полностью. Проверьте редакцию и повторите только незавершённый этап.",
          );
      } finally {
        writeFlight.current = false;
        if (active.current) setPublishingOneClick(false);
      }
    })();
  }
  function submitPublish() {
    if (
      !editor ||
      !pending ||
      !["draft", "failed"].includes(pending.status) ||
      busy ||
      writeFlight.current
    )
      return;
    writeFlight.current = true;
    void publish
      .mutateAsync()
      .catch(() => undefined)
      .finally(() => {
        writeFlight.current = false;
      });
  }
  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        hidden={open || initiallyOpen}
        className={styles.trigger}
        title="Редактировать текст и вложения"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={openEditor}
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m14 5 5 5-9 9H5v-5l9-9Z" />
        </svg>
        Редактировать текст
      </button>
      {open && (
        <section
          ref={panelRef}
          id={panelId}
          className={`moment-published-editor ${styles.editor}`}
          aria-labelledby={headingId}
        >
          <header className={styles.header}>
            <h3 id={headingId}>Редактирование публикации</h3>
            <p>Измените текст или вложения и сохраните результат.</p>
          </header>
          {query.isPending && (
            <Loading ref={loadingRef} tabIndex={-1} message="Проверяем право редактирования…" />
          )}
          {query.isError && (
            <p ref={denialRef} tabIndex={-1} role="alert">
              Редактор недоступен. Возможно, истекло время редактирования.
            </p>
          )}
          {editor && (
            <>
              {!editor.canEdit && (
                <p ref={denialRef} tabIndex={-1} role="status">
                  Право редактирования больше недоступно.
                </p>
              )}
              {!pending && editor.canEdit && (
                <>
                  <form className={styles.form} onSubmit={submit} aria-labelledby={headingId}>
                    <label className={styles.label} htmlFor={fieldId}>
                      Текст публикации
                    </label>
                    <textarea
                      className={styles.textarea}
                      ref={textareaRef}
                      id={fieldId}
                      rows={5}
                      required={
                        !mediaIds.length &&
                        !newMedia.length &&
                        !albumPhotoIds.length &&
                        !editor.hasPoll
                      }
                      aria-describedby={save.isError ? countId + " " + saveErrorId : countId}
                      maxLength={FEED_LIMITS.postCharacters * 2}
                      value={text || ""}
                      disabled={busy}
                      onChange={(event) => {
                        setText(event.target.value);
                        saveAttempt.current = null;
                        setSent(false);
                      }}
                    />
                    <p className={styles.counter} id={countId}>
                      {countFeedCharacters(text)} / {FEED_LIMITS.postCharacters} символов
                    </p>
                    {editor.attachmentIds.length > 0 && (
                      <fieldset
                        className={`moment-edit-attachments ${styles.existingMedia}`}
                        disabled={busy}
                      >
                        <legend>Вложения публикации</legend>
                        <p>
                          Можно изменить порядок или убрать вложение из новой версии. Оригиналы не
                          перезаписываются.
                        </p>
                        <ol>
                          {mediaIds.map((id, index) => (
                            <li key={id}>
                              <span>Вложение {index + 1}</span>
                              <button
                                type="button"
                                disabled={index === 0}
                                aria-label={`Переместить вложение ${index + 1} вверх`}
                                onClick={() => {
                                  setMediaIds((ids) => {
                                    const next = [...ids];
                                    [next[index - 1], next[index]] = [
                                      next[index]!,
                                      next[index - 1]!,
                                    ];
                                    return next;
                                  });
                                  saveAttempt.current = null;
                                }}
                              >
                                Выше
                              </button>
                              <button
                                type="button"
                                disabled={index === mediaIds.length - 1}
                                aria-label={`Переместить вложение ${index + 1} вниз`}
                                onClick={() => {
                                  setMediaIds((ids) => {
                                    const next = [...ids];
                                    [next[index], next[index + 1]] = [
                                      next[index + 1]!,
                                      next[index]!,
                                    ];
                                    return next;
                                  });
                                  saveAttempt.current = null;
                                }}
                              >
                                Ниже
                              </button>
                              <SecondaryButton
                                variant="red"
                                className="gafus-inline-red-action"
                                type="button"
                                aria-label={`Убрать вложение ${index + 1}`}
                                onClick={() => {
                                  setMediaIds((ids) => ids.filter((mediaId) => mediaId !== id));
                                  saveAttempt.current = null;
                                }}
                              >
                                Убрать
                              </SecondaryButton>
                            </li>
                          ))}
                        </ol>
                        {mediaIds.length < editor.attachmentIds.length && (
                          <button
                            type="button"
                            onClick={() => {
                              setMediaIds([...editor.attachmentIds]);
                              saveAttempt.current = null;
                            }}
                          >
                            Восстановить состав вложений
                          </button>
                        )}
                      </fieldset>
                    )}
                    <fieldset disabled={busy} className={styles.newMedia}>
                      <legend>Фото и видео</legend>
                      <label className={styles.filePicker}>
                        <svg
                          aria-hidden="true"
                          width="19"
                          height="19"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="3" />
                          <path d="M7 16l3.5-3.5 2.5 2.5 3-4L20 16" />
                          <circle cx="8" cy="8" r="1.2" />
                        </svg>
                        <span>Добавить фото или видео</span>
                        <input
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                          aria-label="Добавить вложения к публикации"
                          onChange={(event) => {
                            selectMedia(event.currentTarget.files);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                      <p className={styles.mediaHint}>
                        До 10 вложений · фото до 10 МБ · видео до 200 МБ и 120 секунд
                      </p>
                      {newMedia.map((item) => (
                        <div key={item.requestId} className={styles.newMediaItem}>
                          <span title={item.file.name}>{item.file.name}</span>
                          <SecondaryButton
                            variant="red"
                            className="gafus-inline-red-action"
                            type="button"
                            onClick={() => {
                              setNewMedia((files) =>
                                files.filter((asset) => asset.requestId !== item.requestId),
                              );
                              setMediaError("");
                              saveAttempt.current = null;
                            }}
                          >
                            Убрать новый файл
                          </SecondaryButton>
                        </div>
                      ))}
                    </fieldset>
                    <MomentAlbumPhotoPicker
                      userId={userId}
                      selectedPhotoIds={albumPhotoIds}
                      onSelectLocal={(photoId) => {
                        setAlbumPhotoIds((ids) =>
                          ids.includes(photoId)
                            ? ids.filter((id) => id !== photoId)
                            : [...ids, photoId],
                        );
                        saveAttempt.current = null;
                        setMediaError("");
                      }}
                      onBusy={() => undefined}
                      disabled={busy}
                    />
                    {mediaIds.length + newMedia.length + albumPhotoIds.length >
                      FEED_LIMITS.maxAttachments && (
                      <p role="alert">Всего можно добавить не более 10 вложений</p>
                    )}
                    {mediaError && <p role="alert">{mediaError}</p>}
                    {uploadProgress && <p role="status">{uploadProgress}</p>}
                    <div className={styles.actions}>
                      <PrimaryButton
                        className={styles.publish}
                        onClick={submitAndPublish}
                        disabled={
                          busy ||
                          Boolean(mediaError) ||
                          mediaIds.length + newMedia.length + albumPhotoIds.length >
                            FEED_LIMITS.maxAttachments ||
                          (!text.trim() &&
                            !mediaIds.length &&
                            !newMedia.length &&
                            !albumPhotoIds.length &&
                            !editor.hasPoll)
                        }
                      >
                        {publishingOneClick ? "Публикуем…" : "Опубликовать изменения сейчас"}
                      </PrimaryButton>
                      <SecondaryButton
                        className={styles.save}
                        type="submit"
                        disabled={
                          busy ||
                          Boolean(mediaError) ||
                          mediaIds.length + newMedia.length + albumPhotoIds.length >
                            FEED_LIMITS.maxAttachments ||
                          (!text.trim() &&
                            !mediaIds.length &&
                            !newMedia.length &&
                            !albumPhotoIds.length &&
                            !editor.hasPoll)
                        }
                      >
                        {save.isPending ? "Сохраняем редакцию…" : "Сохранить текст"}
                      </SecondaryButton>
                    </div>
                  </form>
                </>
              )}
              {pending?.status === "draft" || pending?.status === "failed" ? (
                <div
                  className={styles.review}
                  role="region"
                  aria-label="Сохранённая редакция публикации"
                >
                  <p>Новая редакция сохранена, но ещё не опубликована.</p>
                  <p>Текст: {pending.text}</p>
                  <PrimaryButton
                    ref={publishButtonRef}
                    type="button"
                    disabled={busy}
                    onClick={submitPublish}
                  >
                    {publish.isPending ? "Отправляем…" : "Опубликовать изменения"}
                  </PrimaryButton>
                </div>
              ) : null}
              {pending?.status === "pending" && (
                <p role="status">
                  Новая редакция обрабатывается сервером. Старая публикация остаётся доступна до
                  завершения обработки.
                </p>
              )}
              {pending?.status === "ready" && (
                <p role="status">Новая редакция готова; обновите публикацию.</p>
              )}
              {sent && !pending && <p role="status">Изменения подтверждены сервером.</p>}
              {oneClickError && <p role="alert">{oneClickError}</p>}
              {save.isError && (
                <p id={saveErrorId} role="alert">
                  Не удалось сохранить изменения. Повтор использует прежний запрос.
                </p>
              )}
              {publish.isError && (
                <p role="alert">Публикация редакции не подтверждена. Повторите запрос.</p>
              )}
              <button
                className={styles.refresh}
                type="button"
                disabled={busy}
                onClick={() => void query.refetch()}
              >
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 11a8 8 0 1 0-2.2 5.5M20 4v7h-7" />
                </svg>
                Проверить изменения
              </button>
            </>
          )}
          <SecondaryButton
            variant="red"
            className={styles.close}
            ref={closeRef}
            type="button"
            disabled={save.isPending || publish.isPending}
            onClick={closeEditor}
          >
            Закрыть редактор
          </SecondaryButton>
        </section>
      )}
    </>
  );
}
