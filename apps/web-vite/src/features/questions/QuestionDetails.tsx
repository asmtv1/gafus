import { Loading } from "../../shared/ui";
import { BackButtonLink, PrimaryButton, SecondaryButton } from "../../shared/ui";
import { useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUESTION_LIMITS } from "@gafus/types";
import { createQuestionAnswer, getQuestionOverview } from "./questionApi";

import { QuestionCloseButton } from "./QuestionManagement";
import { navigate, questionPath, RouteLink } from "../../shared/router/location";
import { QuestionThreadReplies } from "./QuestionThreadReplies";

import { QuestionOwnerControls } from "./QuestionOwnerControls";
import { QuestionReport } from "./QuestionReport";
import { QuestionPhotoPicker } from "./QuestionPhotoPicker";
import { QuestionPhotoGallery } from "./QuestionPhotoGallery";
import { AnswerActionBar } from "./AnswerActionBar";
import { QuestionAnswerAvatar } from "./QuestionAnswerAvatar";
import type { PendingQuestionPhoto } from "./questionMedia";
import { ApiError } from "../../shared/api/client";
import "./web4-question-detail-parity.css";
import "./web4-question-next-composition.css";
import "./web4-answer-minimal-actions.css";
import "./web4-question-answer-threads.css";
import "./web4-question-footer-buttons.css";
import "./web4-question-editor.css";

type QuestionDetailsProps = { userId: string; questionId: string; editMode?: boolean };

// An auth principal or route switch must not carry over the previous owner's
// draft, mutation observer or pending comment reply into the new discussion.
export function QuestionDetails(props: QuestionDetailsProps) {
  return (
    <QuestionDetailsScreen
      key={`${props.userId}/${props.questionId}/${props.editMode ? "edit" : "read"}`}
      {...props}
    />
  );
}

function QuestionDetailsScreen({ userId, questionId, editMode = false }: QuestionDetailsProps) {
  const [sort, setSort] = useState<"useful" | "new">("useful");
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [photos, setPhotos] = useState<PendingQuestionPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; authorName: string } | null>(null);
  const attempt = useRef<{ fingerprint: string; id: string } | null>(null);
  const submitFlight = useRef(false);
  const photoSubmitRef = useRef<(() => Promise<PendingQuestionPhoto[]>) | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [showReplySuccess, setShowReplySuccess] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied" | "error">("idle");
  const shareQuestion = async () => {
    // The original Next detail shares only the canonical current question URL.
    // No analytics URL, API token, or background exfiltration is involved.
    try {
      const url = new URL(questionPath(questionId), window.location.origin);
      if (url.origin !== window.location.origin || !navigator.clipboard?.writeText)
        throw new Error("CLIPBOARD_UNAVAILABLE");
      await navigator.clipboard.writeText(url.toString());
      setShareState("copied");
    } catch {
      setShareState("error");
    }
  };
  const currentFingerprint = JSON.stringify([
    questionId, replyTo?.id ?? null, answer.trim(), photos.map(photo => photo.id),
  ]);
  const currentFingerprintRef = useRef(currentFingerprint);
  currentFingerprintRef.current = currentFingerprint;
  const cache = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ["questions", "detail", userId, questionId, sort],
    queryFn: ({ pageParam }) => getQuestionOverview(questionId, pageParam, userId, sort),
    initialPageParam: 1,
    getNextPageParam: (page) => page.nextAnswerPage ?? undefined,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  // Only READ pagination: a ref locks before React commits isFetchingNextPage.
  // Each actor/question owns a distinct page flight; mutation attempt is separate.
  const pageKey = JSON.stringify([userId, questionId, sort]);
  const pageFlight = useRef<{ key: string } | null>(null);
  const [pageBusyKey, setPageBusyKey] = useState<string | null>(null);
  const pageBusy = pageBusyKey === pageKey || query.isFetchingNextPage;
  const requestNextPage = () => {
    if (pageFlight.current?.key === pageKey || query.isFetchingNextPage) return;
    const flight = { key: pageKey };
    pageFlight.current = flight;
    setPageBusyKey(pageKey);
    const release = () => {
      if (pageFlight.current !== flight) return;
      pageFlight.current = null;
      setPageBusyKey((current) => current === pageKey ? null : current);
    };
    void query.fetchNextPage({ cancelRefetch: false }).then(release, release);
  };
  const unauthenticated = query.error instanceof ApiError && query.error.status === 401;
  const forbidden = query.error instanceof ApiError && query.error.status === 403;
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  // A denied next-page GET revokes the displayed discussion just like a denied
  // first GET. Only transient pagination failures retain verified earlier pages.
  const pageDenied = query.isFetchNextPageError && (unauthenticated || forbidden || notFound);
  const ready =
    !!query.data && (!query.isFetching || query.isFetchingNextPage) &&
    (query.isSuccess || (query.isFetchNextPageError && !pageDenied));
  const showReadError = query.isError && (!query.isFetchNextPageError || pageDenied);
  const first = ready ? query.data!.pages[0] : undefined;
  const reply = useMutation({
    mutationFn: createQuestionAnswer,
    onSuccess: async (_created, submitted) => {
      // Only the current reply target/draft can be cleared by its own ACK.
      const fingerprint = JSON.stringify([
        submitted.questionId, submitted.replyToId ?? null,
        submitted.body.trim(), submitted.photoIds,
      ]);
      if (currentFingerprintRef.current === fingerprint) {
        attempt.current = null;
        setAnswer("");
        setPhotos([]);
        setReplyTo(null);
        setShowReplySuccess(true);
      }
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["questions", "detail", userId, questionId] }),
        cache.invalidateQueries({ queryKey: ["questions", "catalog", userId] }),
        cache.invalidateQueries({ queryKey: ["questions", "replies", userId, questionId] }),
      ]);
    },
  });

  function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!first?.canReply || reply.isPending || uploading || submitFlight.current) return;
    const content = answer.trim();
    if (!content || content.length > QUESTION_LIMITS.body) return;
    submitFlight.current = true;
    setShowReplySuccess(false);
    setPhotoError("");
    void (async () => {
      let readyPhotos: PendingQuestionPhoto[];
      try {
        readyPhotos = photoSubmitRef.current ? await photoSubmitRef.current() : photos;
        if (readyPhotos.some(photo => photo.id.startsWith("local-")))
          throw Error("Подготовленные фотографии недоступны.");
      } catch (reason) {
        setPhotoError(reason instanceof Error ? reason.message : "Не удалось отправить фото");
        return;
      }
      const photoIds = readyPhotos.map(photo => photo.id);
      const fingerprint = JSON.stringify([questionId, replyTo?.id ?? null, content, photoIds]);
      if (!attempt.current || attempt.current.fingerprint !== fingerprint)
        attempt.current = { fingerprint, id: crypto.randomUUID() };
      await reply.mutateAsync({ questionId, body: content,
        clientRequestId: attempt.current.id, replyToId: replyTo?.id ?? null,
        photoIds }).catch(() => undefined);
    })().finally(() => { submitFlight.current = false; });
  }
  // Core pins best answer on page 1; the actual page can contain it again.
  const seen = new Set<string>();
  const answers = (ready ? query.data!.pages.flatMap((page) => page.answers) : []).filter(
    (answer) => {
      if (seen.has(answer.id)) return false;
      seen.add(answer.id);
      return true;
    },
  );
  // Core detail includes the first page of children inline alongside roots.
  // Only roots belong in the main list; children have their own paginated thread.
  const roots = answers.filter((item) => item.parentId === null);
  // Core may pin the best answer even when it is nested under a root.
  const pinnedNestedBest = answers.find((item) => item.parentId !== null && item.best);
  if (editMode) {
    const back = () => navigate(questionPath(questionId));
    return (
      <section className="collection-section question-detail web4-question-edit-page"
        aria-label="Редактирование вопроса">
        <p>
          <BackButtonLink to={questionPath(questionId)}>Вернуться к вопросу</BackButtonLink>
        </p>
        {query.isPending && <Loading message="Загружаем вопрос…" />}
        {query.isFetching && query.data && <Loading message="Проверяем доступ к вопросу…" />}
        {showReadError && (
          <div role="alert">
            <p>
              {unauthenticated
                ? "Сессия завершена. Войдите снова."
                : forbidden
                  ? "Редактирование запрещено."
                  : "Вопрос не найден или недоступен."}
            </p>
            {unauthenticated && <RouteLink to="/login">Войти</RouteLink>}
          </div>
        )}
        {ready &&
          first &&
          (first.canEdit && !first.blockReason ? (
            <QuestionOwnerControls
              userId={userId}
              questionId={questionId}
              question={first}
              initialEditing
              onFinished={back}
              onCancel={back}
              showDelete={false}
            />
          ) : (
            <p role="alert">Редактирование недоступно.</p>
          ))}

      </section>
    );
  }
  return (
    <section className="collection-section question-detail web4-question-detail" aria-label="Обсуждение">
      <p>
        <BackButtonLink to="/questions">Все вопросы</BackButtonLink>
      </p>
      {query.isPending && <Loading message="Загружаем обсуждение…" />}
      {query.isFetching && query.data && <Loading message="Проверяем доступ к обсуждению…" />}
      {showReadError && (
        <div role="alert">
          <p>
            {unauthenticated
              ? "Сессия завершена. Войдите снова."
              : forbidden
                ? "Нет доступа к обсуждению."
                : notFound
                  ? "Вопрос не найден или недоступен."
                  : "Не удалось загрузить обсуждение."}
          </p>
          {unauthenticated ? (
            <RouteLink to="/login">Войти</RouteLink>
          ) : (
            !forbidden &&
            !notFound && (
              <PrimaryButton type="button" onClick={() => void query.refetch()}>
                Повторить
              </PrimaryButton>
            )
          )}
        </div>
      )}
      {ready && first && (
        <>
          <article className="web4-question-primary-card">
            <div className="web4-question-author">
              <span className="web4-question-avatar" aria-hidden="true">
                {first.authorAvatarUrl && !avatarFailed
                  ? <img src={first.authorAvatarUrl} alt="" loading="lazy"
                    referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)}/>
                  : (first.authorName.trim().charAt(0).toLocaleUpperCase("ru-RU") || "?")}
              </span>
              <div>
                <strong>{first.authorName}</strong>
                <time dateTime={first.createdAt}>
                  {Number.isFinite(Date.parse(first.createdAt))
                    ? new Date(first.createdAt).toLocaleDateString("ru-RU") : ""}
                </time>
              </div>
            </div>
            <h1>{first.title}</h1>
            <div className="web4-question-metadata" aria-label="Статус и теги вопроса">
              <span>{first.status === "resolved" ? "Решён"
                : first.status === "answered" ? "Есть ответы" : "Ждёт ответа"}</span>
              <span>{first.category}</span>
              {first.tags.map(tag => <span key={tag}>#{tag}</span>)}
            </div>
            <p className="web4-question-body">{first.body}</p>
            <QuestionPhotoGallery location={{ questionId, photoIds: first.photoIds }} />
            <div className="web4-question-footer">
              <div className="web4-question-main-actions">
                {first.canReply && <PrimaryButton className="web4-question-reply-trigger"
                  onClick={() => document.getElementById("question-reply")?.focus()}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.95L3 21l1.95-5.5a9 9 0 1 1 16.05-4Z"/>
                  </svg>
                  Ответить
                </PrimaryButton>}
                <button type="button" className="web4-question-share-trigger"
                  aria-label="Поделиться вопросом" title="Поделиться"
                  onClick={() => void shareQuestion()}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/>
                    <circle cx="18" cy="19" r="2"/><path d="m8 11 8-5m-8 7 8 5"/>
                  </svg>
                </button>
                {!first.blockReason && <QuestionReport questionId={questionId} compact />}
                {first.canManage && !first.blockReason && (
                  <QuestionCloseButton userId={userId} questionId={questionId}
                    closed={first.closed} />
                )}
              </div>
              {(first.canEdit || first.canManage) && !first.blockReason && (
                <div className="web4-question-owner-actions">
                  <QuestionOwnerControls userId={userId} questionId={questionId} question={first} />
                </div>
              )}
            </div>
            <div className="web4-question-counts" aria-label="Статистика вопроса">
              <span className="web4-question-count-item"><svg viewBox="0 0 24 24"
                aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.95L3 21l1.95-5.5a9 9 0 1 1 16.05-4Z"/></svg>
                {first.answerCount} ответов</span>
              <span className="web4-question-count-item"><svg viewBox="0 0 24 24"
                aria-hidden="true"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/>
                <circle cx="12" cy="12" r="2.5"/></svg>{first.viewCount}</span>
            </div>
            {shareState === "copied" && <p role="status" className="web4-question-share-notice">Ссылка скопирована</p>}
            {shareState === "error" && <p role="alert" className="web4-question-share-notice">Не удалось скопировать ссылку. Скопируйте адрес из строки браузера.</p>}
          </article>
          <section className="web4-question-answers" aria-label="Ответы на вопрос">
            <div className="web4-question-answers-heading">
              <h2>{new Intl.PluralRules("ru-RU").select(first.answerCount) === "one"
                ? `${first.answerCount} ответ`
                : new Intl.PluralRules("ru-RU").select(first.answerCount) === "few"
                  ? `${first.answerCount} ответа`
                  : `${first.answerCount} ответов`}</h2>
              <div className="web4-question-answer-sort" role="group" aria-label="Сортировка ответов">
                {(["useful", "new"] as const).map(mode =>
                  <button key={mode} type="button" aria-pressed={sort === mode}
                    disabled={query.isFetchingNextPage}
                    onClick={() => setSort(mode)}>
                    {mode === "useful" ? "Полезные" : "Новые"}
                  </button>)}
              </div>
            </div>
          {roots.length === 0 && !pinnedNestedBest &&
            <p className="web4-question-answers-empty">Пока никто не ответил.
              {first.canReply ? " Поделитесь опытом первым." : ""}</p>}
          {pinnedNestedBest && (
            <aside aria-label="Лучший вложенный ответ" className="compact-card">
              <h4>Лучший ответ</h4>
              <p>{pinnedNestedBest.body}</p>
              <small>{pinnedNestedBest.authorName}</small>
            </aside>
          )}
          <ul className="compact-grid web4-question-answer-list">
            {roots.map((answer) => (
              <li key={answer.id} className={"compact-card web4-question-answer-card" +
                (answer.best ? " web4-question-best-answer" : "")}>
                <header className="web4-question-answer-author">
                  <QuestionAnswerAvatar name={answer.authorName} url={answer.authorAvatarUrl} />
                  <div className="web4-question-answer-meta">
                    <strong>{answer.authorName}</strong>
                    {answer.best && <span className="web4-question-best-label">Лучший ответ</span>}
                  </div>
                </header>
                <div className="web4-question-answer-body">
                  <p>{answer.body}</p>
                  {!answer.deleted && !answer.hidden && (
                    <QuestionPhotoGallery
                      location={{
                        questionId,
                        answerId: answer.id,
                        photoIds: answer.photoIds,
                        page:
                          (query.data?.pages.findIndex((page) =>
                            page.answers.some((item) => item.id === answer.id),
                          ) ?? 0) + 1,
                      }}
                    />
                  )}
                </div>
                <AnswerActionBar userId={userId} questionId={questionId}
                  answer={answer} blocked={Boolean(first.blockReason)}
                  canReply={first.canReply} canManage={first.canManage}
                  onReply={(id, authorName) => {
                    setShowReplySuccess(false);
                    setReplyTo({ id, authorName });
                    document.getElementById("question-reply")?.focus();
                  }} />
                {answer.parentId === null && answers.some(child =>
                  child.parentId === answer.id && !child.best) && (
                  <ul className="web4-question-inline-replies" aria-label="Ответы на комментарий">
                    {answers.filter(child => child.parentId === answer.id && !child.best)
                      .map(child => <li key={child.id} className="web4-question-inline-reply">
                        <header className="web4-question-answer-author">
                          <QuestionAnswerAvatar
                            name={child.authorName} url={child.authorAvatarUrl} />
                          <div className="web4-question-answer-meta">
                            <strong>{child.authorName}</strong>
                            {child.replyToName && (
                              <span className="web4-question-reply-context">В ответ {child.replyToName}</span>
                            )}
                          </div>
                        </header>
                        <div className="web4-question-answer-body">
                          <p>{child.body}</p>
                          {!child.deleted && !child.hidden && <QuestionPhotoGallery location={{
                            questionId, answerId: child.id, rootId: answer.id,
                            photoIds: child.photoIds,
                            page: (query.data?.pages.findIndex(page => page.answers.some(item =>
                              item.id === child.id)) ?? 0) + 1,
                          }}/>}
                        </div>
                        <AnswerActionBar userId={userId} questionId={questionId}
                          answer={child} blocked={Boolean(first.blockReason)}
                          canReply={first.canReply} canManage={first.canManage}
                          onReply={(id, authorName) => {
                            setShowReplySuccess(false);
                            setReplyTo({ id, authorName });
                            document.getElementById("question-reply")?.focus();
                          }} />
                      </li>)}
                  </ul>
                )}
                {answer.parentId === null && answer.replyCount > answers.filter(child =>
                  child.parentId === answer.id).length && (
                  <QuestionThreadReplies
                    userId={userId}
                    questionId={questionId}
                    rootId={answer.id}
                    knownReplyIds={answers.filter(child => child.parentId === answer.id)
                      .map(child => child.id)}
                    blocked={Boolean(first.blockReason)}
                    canReply={first.canReply}
                    canManage={first.canManage}
                    onReply={(id, authorName) => {
                      setShowReplySuccess(false);
                      setReplyTo({ id, authorName });
                      document.getElementById("question-reply")?.focus();
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
          {ready && query.hasNextPage && !query.isFetchNextPageError && (
            <PrimaryButton
              type="button"
              disabled={pageBusy}
              onClick={requestNextPage}
            >
              {pageBusy ? "Загрузка…" : "Ещё ответы"}
            </PrimaryButton>
          )}
          {ready && query.isFetchNextPageError && (
            <div role="alert">
              <p>Не удалось загрузить следующие ответы. Попробуйте ещё раз.</p>
              <PrimaryButton type="button" disabled={pageBusy} onClick={requestNextPage}>
                {pageBusy ? "Загрузка…" : "Повторить страницу"}
              </PrimaryButton>
            </div>
          )}
          </section>
          {first.canReply && (
            <form className="web4-question-answer-composer" onSubmit={sendReply}>
              <div className="web4-question-composer-heading">
                <h2>{replyTo ? "Ответить пользователю" : "Ваш ответ"}</h2>
                {replyTo && <p>В ответ {replyTo.authorName}</p>}
              </div>
              {replyTo && (
                <p>
                  Ответ для {replyTo.authorName}{" "}
                  <SecondaryButton variant="red" type="button" onClick={() => {
                    setShowReplySuccess(false);
                    setReplyTo(null);
                  }}>
                    Отменить ответ
                  </SecondaryButton>
                </p>
              )}
              <label htmlFor="question-reply" className="web4-question-composer-label">
                Текст ответа
              </label>
              <textarea
                id="question-reply"
                required
                rows={5}
                placeholder="Поделитесь своим опытом или советом…"
                maxLength={QUESTION_LIMITS.body}
                value={answer}
                onChange={(event) => {
                  setAnswer(event.target.value);
                  setShowReplySuccess(false);
                  if (reply.isSuccess) reply.reset();
                }}
              />
              <div className="web4-question-composer-footer">
                <QuestionPhotoPicker photos={photos} onChange={setPhotos} onBusy={setUploading}
                  submitUploadsRef={photoSubmitRef} />
                {photoError && <p role="alert">{photoError}</p>}
                <PrimaryButton type="submit"
                  disabled={reply.isPending || uploading || !answer.trim()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                  {reply.isPending ? "Отправляем…" : "Опубликовать ответ"}
                </PrimaryButton>
              </div>
              {reply.isSuccess && showReplySuccess && <p role="status">Ответ отправлен.</p>}
              {reply.isError && <p role="alert">Не удалось отправить ответ. Повторите попытку.</p>}
            </form>
          )}
          {!first.canReply && (
            <p>
              {first.closed
                ? "Обсуждение закрыто."
                : "Ответы сейчас недоступны для вашего аккаунта."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
