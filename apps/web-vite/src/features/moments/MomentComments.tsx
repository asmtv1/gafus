import { Loading } from "../../shared/ui";
import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FEED_LIMITS, countFeedCharacters } from "@gafus/types";
import { createMomentComment, listMomentComments } from "./momentsApi";
import { getPostFocusedComment } from "./postDetailReadApi";
import { MomentCommentCard, type ReplyTarget } from "./MomentCommentCard";
import { MomentReplies } from "./MomentReplies";
import { MomentLocalMediaPreview } from "./MomentLocalMediaPreview";
import { uploadMomentPhoto, uploadMomentVideo, validateMomentPhoto, validateMomentVideo } from "./feedMediaTransfer";
import { ApiError } from "../../shared/api/client";
import { RouteLink } from "../../shared/router/location";
import {PrimaryButton} from "../../shared/ui";

type MomentCommentsProps = {
  postId: string; userId: string; focusedCommentId?: string | null;
};

export function MomentComments(props: MomentCommentsProps) {
  return <MomentCommentsTarget key={JSON.stringify([
    props.userId, props.postId,
  ])} {...props} />;
}

function MomentCommentsTarget({ postId, userId, focusedCommentId = null }: MomentCommentsProps) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const focusedRef = useRef<HTMLLIElement>(null);
  const focusedStandaloneRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const attempt = useRef<{ fingerprint: string; id: string; uploadIds: string[] } | null>(null);
  // Separate POST flight from the previously accepted READ page-flight.
  const submitFlight = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const fileFingerprint = (items: readonly File[]) =>
    items.map(file => [file.name, file.type, file.size, file.lastModified]);
  const editorFingerprint = JSON.stringify([
    postId, text.trim(), replyTo?.id ?? null, fileFingerprint(files),
  ]);
  const editorFingerprintRef = useRef(editorFingerprint);
  editorFingerprintRef.current = editorFingerprint;
  useEffect(() => {
    const node = textInputRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = Math.min(Math.max(node.scrollHeight, 38), 136) + "px";
  }, [text, replyTo]);
  const cache = useQueryClient();
  const comments = useInfiniteQuery({
    queryKey: ["moments", "comments", userId, postId],
    queryFn: ({ pageParam }) => listMomentComments(postId, pageParam),
    refetchInterval: query => query.state.data?.pages.some(page =>
      page.items.some(item => (item.mediaProcessing ?? 0) > 0)) ? 5000 : false,
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor ?? undefined,
    staleTime: 0, gcTime: 0, retry: false,
  });
  // Query fetching state reaches React after commit. Lock READ next/retry
  // synchronously for the current actor and post, independently of writes.
  const pageKey = JSON.stringify([userId, postId]);
  const pageFlight = useRef<{ key: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const pageBusy = busyKey === pageKey || comments.isFetchingNextPage;
  const requestNextPage = () => {
    if (pageFlight.current?.key === pageKey || comments.isFetchingNextPage) return;
    const flight = { key: pageKey };
    pageFlight.current = flight;
    setBusyKey(pageKey);
    const release = () => {
      if (pageFlight.current !== flight) return;
      pageFlight.current = null;
      setBusyKey(current => current === pageKey ? null : current);
    };
    void comments.fetchNextPage({ cancelRefetch: false }).then(release, release);
  };
  const add = useMutation({
    mutationFn: async (submitted: {
      postId: string; text: string; replyToId: string | null;
      clientRequestId: string; files: File[]; uploadIds: string[];
    }) => {
      const mediaIds = await Promise.all(submitted.files.map((file, index) => {
        const upload = file.type.startsWith("video/") ? uploadMomentVideo : uploadMomentPhoto;
        return upload({
          postId: submitted.postId, file, clientRequestId: submitted.uploadIds[index]!,
          purpose: "comment", existingCount: index,
          onProgress: percentage => setProgress(current =>
            Math.max(current, Math.round((index + percentage / 100) / submitted.files.length * 100))),
        });
      }));
      return createMomentComment({
        postId: submitted.postId, text: submitted.text,
        replyToId: submitted.replyToId, clientRequestId: submitted.clientRequestId,
        mediaIds,
      });
    },
    onSuccess: async (_created, submitted) => {
      // Only clear the editor when this ACK still belongs to the same
      // actor/post, recipient and content, not a newer unsent draft.
      const confirmedFingerprint = JSON.stringify([
        submitted.postId, submitted.text.trim(), submitted.replyToId ?? null,
        fileFingerprint(submitted.files),
      ]);
      if (active.current && editorFingerprintRef.current === confirmedFingerprint) {
        attempt.current = null;
        setText("");
        setFiles([]);
        setFileError("");
        setProgress(0);
        setReplyTo(null);
      }
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["moments", "comments", userId, postId] }),
        cache.invalidateQueries({ queryKey: ["moments", "replies", userId, postId] }),
        cache.invalidateQueries({ queryKey: ["moments", "post", userId, postId] }),
        cache.invalidateQueries({ queryKey: ["moments", "list", userId] }),
      ]);
    },
  });
  function onSelectMedia(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length || add.isPending) return;
    try {
      const next = [...files, ...selected];
      if (next.length > FEED_LIMITS.maxCommentAttachments ||
          next.filter(file => file.type.startsWith("video/")).length > FEED_LIMITS.maxVideos) {
        throw new Error("Максимум 10 файлов, из них не более трёх видео");
      }
      next.forEach((file, index) => file.type.startsWith("video/")
        ? validateMomentVideo(file, index) : validateMomentPhoto(file, index));
      setFiles(next);
      setFileError("");
      setProgress(0);
      attempt.current = null;
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Недопустимые вложения");
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((!text.trim() && !files.length) || add.isPending || submitFlight.current) return;
    const body = text.trim();
    const fingerprint = editorFingerprint;
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, id: crypto.randomUUID(),
        uploadIds: files.map(() => crypto.randomUUID()) };
    }
    submitFlight.current = true;
    setProgress(0);
    void add.mutateAsync({
      postId, text: body, clientRequestId: attempt.current.id,
      replyToId: replyTo?.id ?? null, files: [...files],
      uploadIds: [...attempt.current.uploadIds],
    }).catch(() => undefined).finally(() => {
      submitFlight.current = false;
    });
  }
  const expired = comments.error instanceof ApiError && comments.error.status === 401;
  const forbidden = comments.error instanceof ApiError && comments.error.status === 403;
  const missing = comments.error instanceof ApiError && comments.error.status === 404;
  const readDenied = comments.isError && (expired || forbidden || missing);
  const pageDenied = comments.isFetchNextPageError && readDenied;
  const showReadError = comments.isError && (!comments.isFetchNextPageError || pageDenied);
  const ready = !!comments.data &&
    (!comments.isFetching || comments.isFetchingNextPage) &&
    (comments.isSuccess || (comments.isFetchNextPageError && !pageDenied));
  const seen = new Set<string>();
  const items = (ready ? comments.data!.pages.flatMap(page => page.items) : []).filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }) ?? [];
  const focusListed = focusedCommentId !== null &&
    items.some(item => item.rootId === null && item.id === focusedCommentId);
  // Retained Next opens a notification's exact comment using the existing
  // authenticated GET, even for nested replies and off-page root comments.
  // Core checks auth, published/visible post and visible comment; the client
  // projector additionally rejects cross-post IDs and all private DTO fields.
  const focused = useQuery({
    queryKey: ["moments", "focused-comment", userId, postId, focusedCommentId],
    queryFn: () => getPostFocusedComment(postId, focusedCommentId!),
    enabled: ready && !!focusedCommentId && !focusListed,
    staleTime: 0, gcTime: 0, retry: false,
  });
  useEffect(() => {
    if (!ready || !focusedCommentId || focusListed ||
        !focused.isSuccess || focused.data.id !== focusedCommentId) return;
    const node = focusedStandaloneRef.current;
    if (!node || lastFocused.current === focusedCommentId) return;
    node.focus({ preventScroll: true });
    node.scrollIntoView?.({ block: "center" });
    lastFocused.current = focusedCommentId;
  }, [ready, focusedCommentId, focusListed, focused.isSuccess, focused.data]);
  useEffect(() => {
    if (!focusListed || !focusedCommentId) {
      lastFocused.current = null;
      return;
    }
    if (lastFocused.current === focusedCommentId) return;
    const node = focusedRef.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    node.scrollIntoView?.({ block: "center" });
    lastFocused.current = focusedCommentId;
  }, [focusListed, focusedCommentId]);
  return <section id={"moment-comments-" + postId}
    className="moment-comments web4-moment-comments-card" aria-label="Комментарии">
    <h2>Комментарии</h2>
    {comments.isPending && <Loading message="Загружаем комментарии…" />}
    {showReadError && <div role="alert">
      <p>{expired ? "Сессия завершена. Войдите снова." :
        forbidden ? "Нет доступа к комментариям." :
        missing ? "Комментарии недоступны." : "Не удалось загрузить комментарии."}</p>
      {expired ? <RouteLink to="/login">Войти</RouteLink> :
        !forbidden && !missing &&
        <PrimaryButton type="button" onClick={() => void comments.refetch()}>Повторить</PrimaryButton>}
    </div>}
    {ready && items.length === 0 && <p>Комментариев пока нет.</p>}
    {focusedCommentId && ready && !focusListed && (
      <div ref={focusedStandaloneRef} tabIndex={-1}
        aria-label="Комментарий из уведомления" className="compact-card">
        <h3>Комментарий из уведомления</h3>
        {focused.isPending && <Loading message="Загрузка комментария…" />}
        {focused.isError && <p role="status">Комментарий недоступен.</p>}
        {focused.isSuccess && <MomentCommentCard
          comment={focused.data} userId={userId} postId={postId}
          rootId={focused.data.rootId ?? focused.data.id} onReply={setReplyTo} />}
      </div>
    )}
    {ready && items.length > 0 && <ul className="compact-grid">
      {items.filter(comment => comment.rootId === null).map(comment =>
        <li className="compact-card moment-comment-item" key={comment.id}
          ref={comment.id === focusedCommentId ? focusedRef : undefined}
          tabIndex={comment.id === focusedCommentId ? -1 : undefined}
          aria-label={comment.id === focusedCommentId
            ? "Комментарий из уведомления" : undefined}>
          <MomentCommentCard comment={comment} userId={userId} postId={postId}
            rootId={comment.id} onReply={setReplyTo} />
          <MomentReplies userId={userId} postId={postId} rootId={comment.id}
            count={comment.replyCount} onReply={setReplyTo} />
        </li>)}
    </ul>}
    {ready && comments.hasNextPage && !comments.isFetchNextPageError &&
      <PrimaryButton type="button" disabled={pageBusy}
      onClick={requestNextPage}>
      {pageBusy ? "Загрузка…" : "Ещё комментарии"}
    </PrimaryButton>}
    {ready && comments.isFetchNextPageError && <div role="alert">
      <p>Не удалось загрузить следующую страницу комментариев.</p>
      <PrimaryButton type="button" disabled={pageBusy} onClick={requestNextPage}>
        {pageBusy ? "Загрузка…" : "Повторить страницу комментариев"}
      </PrimaryButton>
    </div>}
    {!readDenied && <form className="moment-comment-composer" onSubmit={submit}>
      {replyTo && <div className="moment-comment-composer-reply" role="status">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M9 10 4 15l5 5" /><path d="M4 15h10a6 6 0 0 0 6-6V5"/>
        </svg>
        <span>Ответ для <strong>{replyTo.name}</strong></span>
        <button type="button" aria-label="Отменить ответ" title="Отменить ответ"
          disabled={add.isPending} onClick={() => {
            setReplyTo(null); attempt.current = null;
          }}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6 18 18M18 6 6 18"/>
          </svg>
        </button>
      </div>}
      {files.length > 0 && <div className="moment-comment-composer-preview">
        <MomentLocalMediaPreview files={files} disabled={add.isPending}
          onRemove={index => {
            setFiles(previous => previous.filter((_, pos) => pos !== index));
            attempt.current = null;
            setFileError("");
          }} />
        <span className="moment-comment-composer-file-count">
          {files.length} из {FEED_LIMITS.maxCommentAttachments}
        </span>
      </div>}
      <div className="moment-comment-composer-bar">
        <button type="button" className="moment-comment-attach"
          aria-label="Прикрепить фото или видео к комментарию"
          title="Прикрепить фото или видео"
          disabled={add.isPending} onClick={() => fileInputRef.current?.click()}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
            stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden="true">
            <path d="m20.1 11.4-8.3 8.3a6 6 0 0 1-8.5-8.5l9.5-9.5a4 4 0 1 1 5.7 5.7l-9.6 9.6a2 2 0 0 1-2.8-2.8l8.5-8.5"/>
          </svg>
        </button>
        <label className="moment-comment-composer-sr-only" htmlFor={"moment-comment-" + postId}>
          Добавить комментарий
        </label>
        <textarea ref={textInputRef} id={"moment-comment-" + postId} value={text}
          onChange={event => setText(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (!add.isPending && !submitFlight.current &&
                  (text.trim() || files.length)) event.currentTarget.form?.requestSubmit();
            }
          }}
          maxLength={FEED_LIMITS.commentCharacters} rows={1} required={!files.length}
          placeholder={replyTo ? "Написать ответ…" : "Написать комментарий…"} />
        <button type="submit" className="moment-comment-send"
          title={add.isPending ? "Отправляем…" : "Отправить"}
          aria-label="Отправить комментарий"
          disabled={add.isPending || (!text.trim() && !files.length) ||
            countFeedCharacters(text) > FEED_LIMITS.commentCharacters}>
          {add.isPending ?
            <Loading variant="icon" message="" /> :
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5m-6 6 6-6 6 6"/>
            </svg>}
        </button>
      </div>
      <input ref={fileInputRef} className="moment-comment-file-input"
        id={"moment-comment-files-" + postId} type="file" multiple
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
        aria-label="Выбрать фото или видео для комментария"
        disabled={add.isPending} onChange={onSelectMedia} />
      {fileError && <p role="alert" className="moment-comment-composer-error">{fileError}</p>}
      {add.isPending && files.length > 0 && <div className="moment-comment-composer-progress" role="status">
        <span>Загружаем вложения · {progress}%</span>
        <progress max={100} value={progress} aria-label="Прогресс загрузки вложений" />
      </div>}
      {add.isError && <p role="alert" className="moment-comment-composer-error">
        Не удалось отправить комментарий. Проверьте файлы и повторите попытку.
      </p>}
    </form>}
  </section>;
}
