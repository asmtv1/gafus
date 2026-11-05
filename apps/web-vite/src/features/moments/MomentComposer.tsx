import { Loading } from "../../shared/ui";
import { PrimaryButton, SecondaryButton } from "../../shared/ui";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { MomentLocalMediaPreview } from "./MomentLocalMediaPreview";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  countFeedCharacters, FEED_LIMITS, validateFeedPollDraft,
} from "@gafus/types";
import { navigate, momentDraftPath, RouteLink } from "../../shared/router/location";
import {
  canEditTextOnlyMoment, canEditMomentDraftText,
  saveMomentTextWithMedia, appendMomentMediaRevision,
  createMomentDraft, deleteMomentDraft, getMomentEditor,
  publishMomentDraft, saveMomentText, saveMomentPollOnlyRevision,
  type MomentEditor,
} from "./momentComposerApi";
import { getMomentsStatus } from "./momentsApi";
import { MomentDraftPoll } from "./MomentDraftPoll";
import { MomentInlinePoll, type MomentInlinePollDraft } from "./MomentInlinePoll";
import { uploadMomentPollOptionImages } from "./momentPollOptionUpload";
import { momentUploadPool } from "./momentUploadPool";
import { createTextDraftPoll } from "./momentDraftPollApi";
import { MomentPhotoUpload } from "./MomentPhotoUpload";
import { uploadMomentPhoto, uploadMomentVideo,
  validateMomentPhoto, validateMomentVideo } from "./feedMediaTransfer";
import { videoRetryMessage } from "../../shared/media/videoRetryMessage";
import { photoRetryMessage } from "../../shared/media/photoRetryMessage";
import { MomentAlbumPhotoPicker } from "./MomentAlbumPhotoPicker";
import { feedClient } from "./feedClient";
import { MomentMediaReorder } from "./MomentMediaReorder";
import "../questions/QuestionPhotoPickerNext.css";
import "./web4-social-visual-parity.css";
import "./moment-editor-clean.css";

type RequestKey = { fingerprint: string; id: string };

/** Three explicit Core steps: idempotent draft, versioned revision, publish. */
type MomentComposerProps = { userId: string; draftId?: string | null; embedded?: boolean };

export function MomentComposer(props: MomentComposerProps) {
  return <MomentComposerTarget key={JSON.stringify([
    props.userId, props.draftId ?? null,
  ])} {...props} />;
}

function MomentComposerTarget({ userId, draftId = null, embedded = false }: MomentComposerProps) {
  // A different author/draft cannot inherit an earlier editor or CAS keys.
  const active = useRef(true);
  const writeFlight = useRef(false);
  const instanceId = useId().replace(/:/g, "");
  const fieldId = `moment-draft-text-${instanceId}`;
  const formId = "moment-compose-form-" + instanceId;
  const countId = `moment-draft-count-${instanceId}`;
  const errorId = `moment-draft-error-${instanceId}`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const publishButtonRef = useRef<HTMLButtonElement>(null);
  const quickPublishButtonRef = useRef<HTMLButtonElement>(null);
  const localMediaInputRef = useRef<HTMLInputElement>(null);
  const publishFocusIntent = useRef(false);
  const currentTextRef = useRef("");
  const [confirmedSave, setConfirmedSave] = useState<{
    id: string; version: number; text: string;
  } | null>(null);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [quickPublishing, setQuickPublishing] = useState(false);
  const [quickPublishError, setQuickPublishError] = useState("");
  const [localMedia, setLocalMedia] = useState<File[]>([]);
  const [localAlbumPhotoIds, setLocalAlbumPhotoIds] = useState<string[]>([]);
  const [localPoll, setLocalPoll] = useState<MomentInlinePollDraft | null>(null);
  const [localMediaError, setLocalMediaError] = useState("");
  const [quickMediaProgress, setQuickMediaProgress] = useState("");
  const [videoRetryBusy, setVideoRetryBusy] = useState(false);
  const [videoFailures, setVideoFailures] = useState<Record<string, string>>({});
  const [photoFailures, setPhotoFailures] = useState<Record<string, string>>({});
  const mediaAttempts = useRef<{ file: File; uploadKey: string; revisionKey: string;
    mediaId?: string }[]>([]);
  const albumAttempts = useRef(new Map<string, {
    copyKey: string; revisionKey: string; copiedMediaId: string | null;
  }>());
  const [editor, setEditor] = useState<MomentEditor | null>(null);
  const [text, setText] = useState("");
  currentTextRef.current = text.trim();
  const [pollEditing, setPollEditing] = useState(false);
  const [pollAvailable, setPollAvailable] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const createOnly = useMutation({
    mutationFn: async () => {
      createKey.current ??= crypto.randomUUID();
      return createMomentDraft(createKey.current);
    },
    onSuccess: async updated => {
      if (active.current) setEditor(updated);
      await refreshDraftList();
    },
  });
  const createKey = useRef<string | null>(null);
  const revisionKey = useRef<RequestKey | null>(null);
  const publishKey = useRef<string | null>(null);
  const cache = useQueryClient();
  const status = useQuery({
    queryKey: ["moments", "status", userId],
    queryFn: getMomentsStatus, staleTime: 0, gcTime: 0, retry: false,
  });
  const existing = useQuery({
    queryKey: ["moments", "editor", userId, draftId],
    queryFn: () => getMomentEditor(draftId!),
    enabled: Boolean(draftId) && status.data?.enabled === true,
    staleTime: 0, gcTime: 0, retry: false,
  });
  useEffect(() => {
    if (!draftId || !existing.data) return;
    // Old bookmarks/links into the editor must not reopen a post-processing
    // or completion page. Only an authoritative server editor status redirects.
    if (existing.data.status === "pending" || existing.data.status === "published") {
      navigate("/moments");
      return;
    }
    setEditor(existing.data);
    setText(existing.data.pendingRevision?.text ?? existing.data.text);
  }, [draftId, existing.data]);

  const refreshDraftList = async () => cache.invalidateQueries({
    queryKey: ["moments", "drafts", userId],
  });
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["moments", "drafts", userId] }),
      cache.invalidateQueries({ queryKey: ["moments", "pending-posts", userId] }),
      cache.invalidateQueries({ queryKey: ["moments", "list", userId] }),
    ]);
  };
  const save = useMutation({
    mutationFn: async (body: string): Promise<MomentEditor> => {
      let current = editor;
      if (!current) {
        createKey.current ??= crypto.randomUUID();
        current = await createMomentDraft(createKey.current);
        if (active.current) setEditor(current);
      }
      if (!canEditMomentDraftText(current)) {
        throw new Error("Этот черновик недоступен для текстового редактирования");
      }
      const fingerprint = JSON.stringify([
        current.id, current.version, body, current.pendingRevision?.attachmentIds ?? [],
      ]);
      if (!revisionKey.current || revisionKey.current.fingerprint !== fingerprint) {
        revisionKey.current = { fingerprint, id: crypto.randomUUID() };
      }
      return current.pendingRevision?.attachmentIds.length
        ? saveMomentTextWithMedia({
          editor: current, text: body, clientRequestId: revisionKey.current.id,
        })
        : saveMomentText({
          postId: current.id, expectedVersion: current.version,
          text: body, clientRequestId: revisionKey.current.id,
        });
    },
    onSuccess: async (updated, body) => {
      if (active.current) {
        setEditor(updated);
        revisionKey.current = null;
        publishKey.current = null;
        // Confirm only a versioned, editable, current text revision.
        setConfirmedSave(updated.status === "draft" && updated.pendingRevision?.status === "draft" &&
          updated.pendingRevision.text === body && currentTextRef.current === body
          ? { id: updated.id, version: updated.version, text: body } : null);
      }
      await refresh();
    },
  });
  const pollOnlyRevision = useMutation({
    mutationFn: async (): Promise<MomentEditor> => {
      const current = editor;
      if (!current || !pollAvailable || !canEditTextOnlyMoment(current) ||
          current.version !== 0 || current.pendingRevision || text.trim()) {
        throw new Error("Опрос или черновик недоступны для публикации без текста");
      }
      const fingerprint = JSON.stringify([current.id, current.version, "POLL_ONLY"]);
      if (!revisionKey.current || revisionKey.current.fingerprint !== fingerprint) {
        revisionKey.current = { fingerprint, id: crypto.randomUUID() };
      }
      return saveMomentPollOnlyRevision({
        postId: current.id, expectedVersion: current.version,
        clientRequestId: revisionKey.current.id, pollWasVerified: pollAvailable,
      });
    },
    onSuccess: async updated => {
      if (active.current) {
        setEditor(updated);
        revisionKey.current = null;
        publishKey.current = null;
      }
      await refresh();
    },
  });
  const publish = useMutation({
    mutationFn: async () => {
      if (!editor) throw new Error("Нет сохранённого черновика");
      publishKey.current ??= crypto.randomUUID();
      return publishMomentDraft(editor.id, publishKey.current);
    },
    onSuccess: updated => {
      if (!active.current) return;
      // The accepted publish ACK is authoritative. Do not delay navigation
      // on cache refetch or show an intermediate editor progress/success page.
      if (updated.status === "published" || updated.status === "pending") {
        navigate("/moments");
        void refresh().catch(() => undefined);
      }
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteMomentDraft(editor!.id),
    onSuccess: async () => {
      await refresh();
      if (active.current) navigate("/moments/drafts");
    },
  });
  const busy = createOnly.isPending || save.isPending || pollOnlyRevision.isPending ||
    publish.isPending || quickPublishing || remove.isPending || photoBusy || videoRetryBusy || reorderBusy;
  const current = editor;
  // A network failure can leave a server-created, otherwise untouched draft.
  // Reuse the original upload/revision idempotency keys for this exact state;
  // once any revision exists we must use the owner draft editor instead.
  const canResumeMediaDraft = !draftId && !!current &&
    current.status === "draft" && current.version === 0 &&
    current.attachmentCount === 0 && current.pendingRevision === null &&
    localMedia.length > 0 &&
    mediaAttempts.current.length === localMedia.length &&
    mediaAttempts.current.every((entry, index) => entry.file === localMedia[index]);
  const canSave = (!draftId || existing.isSuccess) &&
    (!current || canEditMomentDraftText(current));
  const savedText = current?.pendingRevision?.text ?? current?.text;
  const readyToPublish = !pollEditing && !photoBusy && !reorderBusy && Boolean(current &&
    current.status === "draft" && current.pendingRevision &&
    current.pendingRevision.status === "draft" && savedText === text.trim() &&
    (Boolean(text.trim()) || pollAvailable ||
      (current.pendingRevision.attachmentIds.length > 0)));

  const announcedSave = !!confirmedSave && !!current &&
    confirmedSave.id === current.id && confirmedSave.version === current.version &&
    confirmedSave.text === text.trim() && current.status === "draft" &&
    current.pendingRevision?.status === "draft" &&
    current.pendingRevision.text === confirmedSave.text;
  useEffect(() => {
    if (!publishFocusIntent.current || !announcedSave || !readyToPublish || busy) return;
    const focused = document.activeElement;
    // Never steal keyboard focus after a new context or unrelated focus target.
    if (focused !== saveButtonRef.current && focused !== textareaRef.current &&
        focused !== document.body) {
      publishFocusIntent.current = false;
      return;
    }
    const publishTarget = publishButtonRef.current ?? quickPublishButtonRef.current;
    if (publishTarget && !publishTarget.disabled) {
      publishTarget.focus();
      publishFocusIntent.current = false;
    }
  }, [announcedSave, readyToPublish, busy]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!status.data?.enabled || busy || writeFlight.current || !canSave ||
        !text.trim() || countFeedCharacters(text.trim()) > FEED_LIMITS.postCharacters) return;
    publishFocusIntent.current = document.activeElement === saveButtonRef.current ||
      document.activeElement === textareaRef.current;
    setConfirmedSave(null);
    writeFlight.current = true;
    void save.mutateAsync(text.trim()).catch(() => undefined).finally(() => {
      writeFlight.current = false;
    });
  }
  // A new Moment can select files before any Core draft is created, like the
  // original Next form. All existing editor/media controls remain available.
  const selectLocalMedia = (files: File[]) => {
    if (busy || current || writeFlight.current) return;
    try {
      if (files.length + localAlbumPhotoIds.length > FEED_LIMITS.maxAttachments ||
          files.filter(file => file.type.startsWith("video/")).length > FEED_LIMITS.maxVideos)
        throw new Error("Слишком много вложений или видео");
      files.forEach((file, i) => {
        if (file.type.startsWith("video/")) validateMomentVideo(file, i);
        else validateMomentPhoto(file, i);
      });
      // Keep successful reservations bound to the SAME original file. Removing
      // a neighboring file must not force a duplicate upload of this video.
      const prior = mediaAttempts.current;
      const next = files.map(file => prior.find(attempt => attempt.file === file) ?? ({
        file, uploadKey: crypto.randomUUID(), revisionKey: crypto.randomUUID(),
      }));
      mediaAttempts.current = next;
      setVideoFailures(previous => Object.fromEntries(Object.entries(previous).filter(([key]) =>
        next.some(item => item.uploadKey === key))));
      setPhotoFailures(previous => Object.fromEntries(Object.entries(previous).filter(([key]) =>
        next.some(item => item.uploadKey === key))));
      setLocalMedia(files);
      setLocalMediaError("");
      setQuickPublishError("");
    } catch (error) {
      // A rejected extra file must not remove previews and upload tokens of
      // previously accepted photos/videos. The invalid addition is discarded.
      setLocalMediaError(error instanceof Error ? error.message : "Недопустимые вложения");
    }
  };
  // Album choice is local until one-action publish, exactly like original Next.
  // The existing owner-only picker revalidates photos as ready and current
  // ownership; Core copy additionally enforces ACL at the actual write.
  const toggleLocalAlbumPhoto = (photoId: string) => {
    if (busy || current || writeFlight.current || !/^[A-Za-z0-9_-]{1,128}$/.test(photoId)) return;
    if (localAlbumPhotoIds.includes(photoId)) {
      setLocalAlbumPhotoIds(items => items.filter(id => id !== photoId));
      albumAttempts.current.delete(photoId);
    } else if (localMedia.length + localAlbumPhotoIds.length < FEED_LIMITS.maxAttachments) {
      albumAttempts.current.set(photoId, {
        copyKey: crypto.randomUUID(), revisionKey: crypto.randomUUID(), copiedMediaId: null,
      });
      setLocalAlbumPhotoIds(items => [...items, photoId]);
    } else {
      setLocalMediaError(`Максимум ${FEED_LIMITS.maxAttachments} вложений.`);
    }
    setQuickPublishError("");
  };
  // Original Next exposes one primary "Опубликовать" action. Keep the Core
  // three-step transaction (idempotent create, CAS revision, publish) behind
  // that action; never optimistically claim a published post or bypass ACL.
  function submitQuickPublish() {
    const targetText = text.trim();
    const files = localMedia.slice();
    const albumIds = localAlbumPhotoIds.slice();
    const selectedPoll = localPoll;
    const optionPhotos = selectedPoll?.options.filter(option => option.imageAsset).length ?? 0;
    const pollError = selectedPoll ? validateFeedPollDraft(selectedPoll) : null;
    if (pollError) { setQuickPublishError(pollError); return; }
    if (!status.data?.enabled || busy || writeFlight.current ||
        (!targetText && !files.length && !albumIds.length &&
          !selectedPoll && !readyToPublish) || localMediaError ||
        // A prior transport error is not a permanent publish prohibition.
        // Only a draft with committed revisions must be resumed elsewhere.
        ((files.length || albumIds.length || selectedPoll) &&
          !!current && !canResumeMediaDraft) ||
        files.length + albumIds.length + optionPhotos > FEED_LIMITS.maxAttachments ||
        countFeedCharacters(targetText) > FEED_LIMITS.postCharacters ||
        (!readyToPublish && !canSave)) return;
    writeFlight.current = true;
    setQuickPublishError("");
    setQuickPublishing(true);
    void (async () => {
      let confirmed: MomentEditor;
      if (files.length || albumIds.length || optionPhotos) {
        // Fail closed if the editor already has server-owned attachments:
        // do not overwrite/recreate revisions from a stale local file picker.
        if ((current && !canResumeMediaDraft) || draftId ||
            mediaAttempts.current.length !== files.length ||
            mediaAttempts.current.some((item, i) => item.file !== files[i]) ||
            albumIds.some(id => !albumAttempts.current.has(id)))
          throw new Error("Этот набор медиа больше не соответствует черновику");
        // Do not create another post after a failed direct-to-S3 transfer.
        // Same draft, same file upload clientRequestIds, no duplicated media.
        if (!current) createKey.current ??= crypto.randomUUID();
        let draft = canResumeMediaDraft && current
          ? current : await createMomentDraft(createKey.current!);
        if (active.current) setEditor(draft);
        // Transfer up to five independent S3 objects concurrently, but keep
        // all Core CAS revision updates sequential and in the chosen order.
        // A failed batch waits for in-flight uploads before any CAS write.
        const acceptedMediaIds = await momentUploadPool(mediaAttempts.current,
          async (attempt, index) => {
            if (!active.current || currentTextRef.current !== targetText)
              throw new Error("Редактор или текст изменился во время загрузки");
            // A retry only re-encodes/uploads the failed file. Successful
            // items return their exact mediaId; no new Core attachment.
            if (attempt.mediaId) return attempt.mediaId;
            const isVideo = attempt.file.type.startsWith("video/");
            const transfer = isVideo ? uploadMomentVideo : uploadMomentPhoto;
            if (isVideo && active.current) setVideoFailures(previous => {
              const next={...previous};delete next[attempt.uploadKey];return next;
            });
            if (!isVideo && active.current) setPhotoFailures(previous => {
              const next={...previous};delete next[attempt.uploadKey];return next;
            });
            try {
              const mediaId = await transfer({
                postId: draft.id, file: attempt.file,
                clientRequestId: attempt.uploadKey, existingCount: index,
                onProgress: percent => { if (active.current)
                  setQuickMediaProgress(`Вложение ${index + 1} из ${files.length}: ${percent}%`); },
              });
              attempt.mediaId=mediaId;
              return mediaId;
            } catch (cause) {
              if (isVideo && active.current) setVideoFailures(previous => ({...previous,
                [attempt.uploadKey]:videoRetryMessage(cause)}));
              if (!isVideo && active.current) setPhotoFailures(previous => ({...previous,
                [attempt.uploadKey]:photoRetryMessage(cause)}));
              throw cause;
            }
          });
        for (const [index, attempt] of mediaAttempts.current.entries()) {
          if (!active.current || currentTextRef.current !== targetText)
            throw new Error("Редактор или текст изменился во время загрузки");
          // Keep the original per-version request IDs for idempotent CAS.
          draft = await appendMomentMediaRevision({
            editor: draft, mediaId: acceptedMediaIds[index]!,
            clientRequestId: attempt.revisionKey,
          });
          if (active.current) setEditor(draft);
        }
        // Album photos are copied into private Feed media by the existing Core
        // owner-gated API, then added via the same revision CAS as uploaded media.
        for (const [index, photoId] of albumIds.entries()) {
          if (!active.current || currentTextRef.current !== targetText)
            throw new Error("Редактор или текст изменился во время копирования");
          const attempt = albumAttempts.current.get(photoId);
          if (!attempt) throw new Error("Альбом был изменён во время копирования");
          setQuickMediaProgress(`Добавляем фото из альбома ${index + 1} из ${albumIds.length}…`);
          if (!attempt.copiedMediaId) {
            const copied = await feedClient.copyAlbumPhoto(draft.id, {
              photoId, clientRequestId: attempt.copyKey,
            });
            if (!/^[A-Za-z0-9_-]{1,128}$/.test(copied?.id ?? "") || copied?.kind !== "photo")
              throw new Error("Копирование фотографии не подтверждено");
            attempt.copiedMediaId = copied.id;
          }
          draft = await appendMomentMediaRevision({
            editor: draft, mediaId: attempt.copiedMediaId,
            clientRequestId: attempt.revisionKey,
          });
          if (active.current) setEditor(draft);
        }
        if (targetText) {
          draft = draft.pendingRevision?.attachmentIds.length
            ? await saveMomentTextWithMedia({
                editor: draft, text: targetText, clientRequestId: crypto.randomUUID(),
              })
            : await saveMomentText({
                postId: draft.id, expectedVersion: draft.version,
                text: targetText, clientRequestId: crypto.randomUUID(),
              });
          if (active.current) setEditor(draft);
        }
        confirmed = draft;
      } else if (selectedPoll && !targetText) {
        createKey.current ??= crypto.randomUUID();
        confirmed = await createMomentDraft(createKey.current);
        if (active.current) setEditor(confirmed);
      } else {
        confirmed = readyToPublish && current
          ? current : await save.mutateAsync(targetText);
      }
      if (!active.current || currentTextRef.current !== targetText) return;
      if (selectedPoll) {
        const pollToSave = optionPhotos
          ? await uploadMomentPollOptionImages({
              postId: confirmed.id, poll: selectedPoll,
              attachmentCount: files.length + albumIds.length,
              onProgress: message => { if (active.current) setQuickMediaProgress(message); },
              active: () => active.current && currentTextRef.current === targetText,
            }) : selectedPoll;
        if (!active.current) return;
        await createTextDraftPoll({ postId: confirmed.id,
          expectedVersion: confirmed.version, poll: pollToSave,
          confirmedProcessedOptionImages: optionPhotos > 0,
          allowInitialVersion: confirmed.version === 0 });
        if (!active.current) return;
        if (confirmed.version === 0 && !confirmed.pendingRevision) {
          confirmed = await saveMomentPollOnlyRevision({
            postId: confirmed.id, expectedVersion: confirmed.version,
            clientRequestId: crypto.randomUUID(), pollWasVerified: true,
          });
          if (active.current) setEditor(confirmed);
        }
        setPollAvailable(true);
      }
      if (confirmed.status !== "draft" ||
          confirmed.pendingRevision?.status !== "draft" ||
          confirmed.pendingRevision.text !== targetText ||
          ((files.length || albumIds.length) &&
            confirmed.pendingRevision.attachmentIds.length !== files.length + albumIds.length))
        throw new Error("Нельзя подтвердить текущую редакцию публикации");
      publishKey.current ??= crypto.randomUUID();
      setQuickMediaProgress("Публикуем…");
      const result = await publishMomentDraft(confirmed.id, publishKey.current);
      if (!active.current) return;
      if (result.status !== "pending" && result.status !== "published")
        throw new Error("Сервер не подтвердил публикацию");
      // The Core ACK confirms the publish request, not media readiness.
      // Immediately show the feed's already existing processing widget.
      navigate("/moments");
      void refresh().catch(() => undefined);
    })().catch(error => {
      if (!active.current) return;
      const message = error instanceof Error ? error.message : "";
      const mediaNetworkError = /Сеть недоступна при передаче фото|Хранилище не подтвердило передачу медиа|Превышено время передачи фото|Failed to fetch|NetworkError|S3 connection lost/i.test(message);
      setQuickPublishError(mediaAttempts.current.some(item =>
        !item.file.type.startsWith("video/") && !item.mediaId) ?
          "Не удалось обработать одно из фото на устройстве или передать его в S3. Нажмите круглую стрелку на проблемной фотографии — остальные файлы не будут повторно отправлены. Проверьте интернет, свободное место и при необходимости выберите JPG или PNG." :
        Object.keys(videoFailures).length ||
        mediaAttempts.current.some(item => item.file.type.startsWith("video/") && !item.mediaId)
        ? "Не удалось обработать или загрузить одно из видео. Исходник сохранён. Нажмите круглую стрелку прямо на проблемном видео — успешно загруженные файлы повторно не отправятся. Если обработка на сервере недоступна, публикация останется черновиком."
        : mediaNetworkError
          ? "Не удалось загрузить фото или видео в хранилище. Проверьте соединение и повторите."
          : "Не удалось подтвердить публикацию. Черновик сохранён; проверьте его статус перед повтором.");
    }).finally(() => {
      writeFlight.current = false;
      if (active.current) {
        setQuickPublishing(false);
        setQuickMediaProgress("");
      }
    });
  }
  async function retrySingleVideo(index: number) {
    // The overlay is scoped to ONE original File and one idempotent S3 upload.
    // A sibling's failed video must not be re-encoded by this action.
    if (busy || writeFlight.current || !current || !canResumeMediaDraft || !active.current) return;
    const attempt = mediaAttempts.current[index];
    if (!attempt || !attempt.file.type.startsWith("video/") || attempt.mediaId ||
        !videoFailures[attempt.uploadKey]) return;
    writeFlight.current = true;
    setVideoRetryBusy(true);
    setQuickPublishError("");
    setVideoFailures(previous => {
      const next = {...previous}; delete next[attempt.uploadKey]; return next;
    });
    try {
      const mediaId = await uploadMomentVideo({ postId: current.id, file: attempt.file,
        clientRequestId: attempt.uploadKey, existingCount: index,
        onProgress: progress => { if (active.current)
          setQuickMediaProgress(`Повторяем видео ${index + 1}: ${progress}%`); },
      });
      attempt.mediaId = mediaId;
    } catch (cause) {
      if (active.current) {
        const failure = videoRetryMessage(cause);
        setVideoFailures(previous => ({...previous, [attempt.uploadKey]: failure}));
        setQuickPublishError(failure);
      }
    } finally {
      writeFlight.current = false;
      if (active.current) {
        setVideoRetryBusy(false);
        setQuickMediaProgress("");
      }
    }
  }
  async function retrySinglePhoto(index:number) {
    if (busy || writeFlight.current || !current || !canResumeMediaDraft ||
        !active.current) return;
    const attempt=mediaAttempts.current[index];
    if(!attempt || attempt.file.type.startsWith("video/") || attempt.mediaId ||
       !photoFailures[attempt.uploadKey])return;
    writeFlight.current=true;
    setPhotoBusy(true);
    setQuickPublishError("");
    setPhotoFailures(previous=>{const next={...previous};delete next[attempt.uploadKey];return next;});
    try {
      const mediaId=await uploadMomentPhoto({postId:current.id,file:attempt.file,
        clientRequestId:attempt.uploadKey,existingCount:index,
        onProgress:progress=>{if(active.current)setQuickMediaProgress(`Повторяем фото ${index+1}: ${progress}%`);}});
      attempt.mediaId=mediaId;
    }catch(cause){
      if(active.current){
        const failure=photoRetryMessage(cause);
        setPhotoFailures(previous=>({...previous,[attempt.uploadKey]:failure}));
        setQuickPublishError(failure);
      }
    }finally{
      writeFlight.current=false;
      if(active.current){setPhotoBusy(false);setQuickMediaProgress("");}
    }
  }
  function submitPublish() {
    if (!status.data?.enabled || busy || writeFlight.current || !readyToPublish) return;
    writeFlight.current = true;
    void publish.mutateAsync().catch(() => undefined).finally(() => {
      writeFlight.current = false;
    });
  }
  function confirmDelete() {
    if (!deleteArmed || !status.data?.enabled || busy || writeFlight.current ||
        !current?.canEdit || current.status === "published") return;
    // Only a second deliberate in-page click can send a DELETE. Acquire
    // synchronously before the request to fence double-click/unknown ACK.
    writeFlight.current = true;
    setDeleteArmed(false);
    void remove.mutateAsync().catch(() => undefined).finally(() => {
      writeFlight.current = false;
    });
  }
  const composerActions = () => <>
        <div className="web4-compose-actions">
          <PrimaryButton ref={quickPublishButtonRef}
            type="button"
            disabled={busy ||
              (!text.trim() && !localMedia.length && !localAlbumPhotoIds.length &&
                !localPoll && !readyToPublish) ||
              !!localMediaError ||
              !!(localPoll && validateFeedPollDraft(localPoll)) ||
              !!(current && (localMedia.length || localAlbumPhotoIds.length || localPoll) &&
                !canResumeMediaDraft) ||
              localMedia.length + localAlbumPhotoIds.length +
                (localPoll?.options.filter(option => option.imageAsset).length ?? 0)
                > FEED_LIMITS.maxAttachments ||
              countFeedCharacters(text.trim()) > FEED_LIMITS.postCharacters}
            onClick={submitQuickPublish}>
            {quickPublishing ? "Публикуем…" : "Опубликовать"}
          </PrimaryButton>
          {Boolean(text.trim()) && <PrimaryButton ref={saveButtonRef} type="submit" form={formId} disabled={busy}>
            {save.isPending ? "Сохраняем…" : "Сохранить черновик"}
          </PrimaryButton>}
        </div>
  </>;
  // No intermediate processing/success screen even for an old direct URL.
  // The read-only, server-confirmed route above redirects to the feed.
  if (draftId && (existing.data?.status === "pending" ||
      existing.data?.status === "published")) return null;
  return <section className="collection-section web4-moment-composer" aria-label="Редактор «Моментов»">
    {!embedded && <header className="web4-compose-header">
      <span className="moment-editor-eyebrow">Моменты · Редактор</span>
      <h2>{draftId ? "Редактирование черновика" : "Новая публикация"}</h2>
    </header>}
    {status.isPending && <Loading message="Проверяем возможность публикации…" />}
    {status.isError && <p role="alert">Не удалось проверить доступность «Моментов».</p>}
    {status.isSuccess && !status.data.enabled &&
      <p role="alert">Публикации сейчас недоступны.</p>}
    {draftId && status.data?.enabled && existing.isPending &&
      <Loading message="Загружаем черновик…" />}
    {draftId && existing.isError && <div role="alert">
      <p>Черновик недоступен или был удалён.</p>
      <PrimaryButton type="button" onClick={() => void existing.refetch()}>Повторить</PrimaryButton>
    </div>}
    {status.data?.enabled && (!draftId || existing.isSuccess) && <>
      {current && <div className="moment-compose-draft-meta">
        <span className="moment-compose-draft-badge">Черновик</span>
        <span className="moment-compose-draft-id" title={"Черновик: " + current.id}>
          Черновик: {current.id}
        </span>
      </div>}
      {current && current.status !== "pending" && current.status !== "published" &&
        !canEditMomentDraftText(current) && <p role="status">
          Редактирование черновика не разрешено сервером.
        </p>}
      {!current && <div className="web4-compose-draft-row">
        <PrimaryButton type="button" disabled={busy}
          onClick={() => createOnly.mutate()}>
          {createOnly.isPending ? "Создаём черновик…" : "Создать черновик для медиа"}
        </PrimaryButton>
      </div>}
      {createOnly.isError && <p role="alert">
        Не удалось создать черновик. Повтор использует прежний запрос.
      </p>}
      {canSave && <form id={formId} onSubmit={submit} aria-label="Сохранение текстового черновика"
        aria-busy={save.isPending}>
        <label htmlFor={fieldId}>Текст публикации</label>
        <textarea ref={textareaRef} id={fieldId} value={text} required rows={5}
          placeholder="Расскажите о своём питомце…"
          aria-describedby={save.isError ? `${countId} ${errorId}` : countId}
          maxLength={FEED_LIMITS.postCharacters * 2} disabled={busy}
          onChange={event => {
            setText(event.target.value);
            setConfirmedSave(null);
            publishFocusIntent.current = false;
            publishKey.current = null;
          }} />
        <p id={countId}>{countFeedCharacters(text)} / {FEED_LIMITS.postCharacters} символов</p>
        {(!current || canResumeMediaDraft) && <section className="web4-compose-file-selection question-photo-picker-next"
          aria-label="Вложения публикации">
          <h3 className="web4-compose-file-label">Фото или видео</h3>
          <div className="question-photo-picker-grid web4-compose-media-grid">
            {localMedia.length + localAlbumPhotoIds.length < FEED_LIMITS.maxAttachments &&
              <SecondaryButton type="button"
                className="question-photo-add web4-compose-media-add"
                disabled={busy} aria-controls={`web4-compose-files-${instanceId}`}
                onClick={() => localMediaInputRef.current?.click()}>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="16" rx="3"/>
                  <circle cx="8.5" cy="9" r="1.4"/>
                  <path d="m5 17 5-5 3 3 3-3 3 3M12 3v5m-2.5-2.5h5"/>
                </svg>
                <span>Добавить фото или видео</span>
              </SecondaryButton>}
            <MomentLocalMediaPreview files={localMedia} disabled={busy}
              failures={localMedia.map(file => {
                const entry=mediaAttempts.current.find(item => item.file === file);
                return entry ? videoFailures[entry.uploadKey] ?? photoFailures[entry.uploadKey] : undefined;
              })}
              onRetry={index => {
                const attempt=mediaAttempts.current[index];
                if (!attempt || busy || writeFlight.current) return;
                if (photoFailures[attempt.uploadKey]) void retrySinglePhoto(index);
                else if (videoFailures[attempt.uploadKey]) void retrySingleVideo(index);
              }}
              onRemove={index => selectLocalMedia(localMedia.filter((_, i) => i !== index))} />
          </div>
          <input ref={localMediaInputRef} id={`web4-compose-files-${instanceId}`}
            type="file" hidden multiple aria-label="Выбрать фото или видео"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
            disabled={busy ||
              localMedia.length + localAlbumPhotoIds.length >= FEED_LIMITS.maxAttachments}
            onChange={event => {
              // Subsequent picker visits add to the current selection instead
              // of silently replacing an earlier photo with a new video.
              const chosen = Array.from(event.currentTarget.files ?? []);
              if (chosen.length) selectLocalMedia([...localMedia, ...chosen]);
              event.currentTarget.value = "";
            }} />
          <p className="question-photo-hint web4-compose-media-hint">
            {localMedia.length + localAlbumPhotoIds.length} из {FEED_LIMITS.maxAttachments} вложений
            · JPG, PNG, WebP, MP4, MOV, WebM · фото до 10 МБ
            · видео до 200 МБ и {FEED_LIMITS.videoSeconds} сек
            (не более {FEED_LIMITS.maxVideos} видео)
          </p>
          {localMediaError && <p role="alert">{localMediaError}</p>}
          {quickMediaProgress && <p role="status">{quickMediaProgress}</p>}
        </section>}
        {!current && <MomentAlbumPhotoPicker userId={userId}
          selectedPhotoIds={localAlbumPhotoIds} onSelectLocal={toggleLocalAlbumPhoto}
          onBusy={setPhotoBusy} disabled={busy} />}
        {!current && <MomentInlinePoll value={localPoll} disabled={busy}
          onChange={setLocalPoll} />}
        {(!current || canResumeMediaDraft) && composerActions()}
        {quickPublishError && <div className="moment-quick-publish-retry" role="alert">
          <p>{quickPublishError}</p>
          {canResumeMediaDraft && <SecondaryButton type="button"
            onClick={submitQuickPublish} disabled={busy}>
            Повторить незавершённые вложения
          </SecondaryButton>}
          {current && <RouteLink to={momentDraftPath(current.id)}>
            Открыть сохранённый черновик и продолжить
          </RouteLink>}
        </div>}
        {save.isError && <p id={errorId} role="alert">
          Не удалось сохранить. Повтор использует прежний запрос;
          черновик не будет создан заново.
        </p>}
      </form>}
      {announcedSave && <p role="status">Текст черновика сохранён. Можно опубликовать.</p>}
      {current && current.status === "draft" &&
        (current.pendingRevision?.status === "draft" ||
          (current.version === 0 && !current.pendingRevision)) && !pollEditing &&
        <MomentPhotoUpload editor={current} disabled={reorderBusy}
          onBusy={setPhotoBusy}
          onSaved={updated => {
            setEditor(updated);
            publishKey.current = null;
            void refresh();
          }} />}
      {current && current.status === "draft" && !pollEditing &&
        <MomentAlbumPhotoPicker userId={userId} editor={current}
          disabled={photoBusy || reorderBusy}
          onBusy={setPhotoBusy} onSaved={updated => {
            setEditor(updated);
            publishKey.current = null;
            void refresh();
          }} />}
      {current && current.status === "draft" && current.version >= 1 &&
        !pollEditing &&
        <MomentMediaReorder editor={current} disabled={photoBusy}
          onBusy={setReorderBusy} onSaved={updated => {
            setEditor(updated);
            publishKey.current = null;
            void refresh();
          }} />}
      {current && current.status === "draft" &&
        !photoBusy && !reorderBusy && canEditTextOnlyMoment(current) &&
        <MomentDraftPoll userId={userId} postId={current.id}
          version={current.version} allowInitialVersion
          onEditingChange={setPollEditing}
          onPollPresentChange={setPollAvailable} />}
      {current && current.status === "draft" && current.version === 0 &&
        pollAvailable && !pollEditing && !text.trim() && !current.pendingRevision &&
        <button type="button" disabled={busy || writeFlight.current}
          onClick={() => {
            if (busy || writeFlight.current) return;
            writeFlight.current = true;
            void pollOnlyRevision.mutateAsync().catch(() => undefined).finally(() => {
              writeFlight.current = false;
            });
          }}>
          {pollOnlyRevision.isPending ? "Подготавливаем…" : "Подготовить публикацию с опросом"}
        </button>}
      {pollOnlyRevision.isError && <p role="alert">
        Не удалось подтвердить редакцию только с опросом.
        Проверьте черновик перед повтором.
      </p>}
      {current && canSave && composerActions()}
      {readyToPublish && !canSave &&
        <PrimaryButton ref={publishButtonRef} type="button" disabled={busy}
        onClick={submitPublish}>
        {publish.isPending ? "Публикуем…" : "Опубликовать"}
      </PrimaryButton>}
      {publish.isError && <p role="alert">
        Не удалось подтвердить публикацию. Попробуйте ещё раз,
        не создавая новую запись.
      </p>}
      {current?.canEdit && current.status !== "published" && <div className="moment-compose-danger">
        <SecondaryButton className="moment-compose-delete" variant="red" type="button" disabled={busy || deleteArmed}
          onClick={() => {
            // Guard the click synchronously as well as the disabled UI:
            // a competing save/publish can acquire flight in this same turn.
            if (busy || writeFlight.current || deleteArmed || !status.data?.enabled) return;
            setDeleteArmed(true);
          }}>Удалить черновик</SecondaryButton>
        {deleteArmed && <div role="group" aria-label="Подтверждение удаления Момента">
          <p>Удалить этот черновик? Действие нельзя отменить.</p>
          <SecondaryButton variant="red" type="button" disabled={busy} onClick={confirmDelete}>
            Да, удалить публикацию
          </SecondaryButton>
          <SecondaryButton variant="red" type="button" disabled={busy}
            onClick={() => setDeleteArmed(false)}>Не удалять</SecondaryButton>
        </div>}
      </div>}
      {remove.isError && <p role="alert">Не удалось удалить черновик.</p>}
      {current && current.status !== "pending" && current.status !== "published" &&
        <p className="moment-compose-draft-link">
          <RouteLink to="/moments/drafts">Все черновики</RouteLink>
        </p>}
    </>}
  </section>;
}
