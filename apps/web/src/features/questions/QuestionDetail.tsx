"use client";
import { reportClientError } from "@gafus/error-handling";
import {
  AppBackButtonLink,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  SecondaryButtonLink,
} from "@/shared/components/ui";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  Favorite,
  FavoriteBorder,
  FlagOutlined,
  ShareOutlined,
  LockOutlined,
  MoreHoriz,
  ChatBubbleOutline,
  CheckCircleOutline,
  KeyboardArrowDown,
  KeyboardArrowUp,
  SendOutlined,
  EditOutlined,
  DeleteOutline,
} from "@mui/icons-material";
import {
  QUESTION_REPORT_REASONS,
  QUESTION_LIMITS,
  type QuestionAnswerDto,
  type QuestionPhotoDto,
} from "@gafus/types";
import { questionsApi } from "./api";
import { Author, Status, Counts, Photos, Body, BestLabel, PhotoPicker } from "./parts";
import s from "./Questions.module.css";
/** Russian answer-count inflection for discussion headings. */
export function formatAnswerCount(count: number): string {
  const form = new Intl.PluralRules("ru-RU").select(count);
  const noun = form === "one" ? "ответ" : form === "few" ? "ответа" : "ответов";
  return `${count} ${noun}`;
}

export function QuestionDetail({ id }: { id: string }) {
  const userId = useSession().data?.user?.id;
  const cache = useQueryClient();
  const router = useRouter();
  const [sort, setSort] = useState("useful");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<QuestionPhotoDto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<QuestionAnswerDto | null>(null);
  const [editing, setEditing] = useState<QuestionAnswerDto | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [extraReplies, setExtraReplies] = useState<
    Record<string, { items: QuestionAnswerDto[]; nextPage: number | null }>
  >({});
  const [reportTarget, setReportTarget] = useState<{ answerId?: string } | null>(null);
  const [reason, setReason] = useState<string>(QUESTION_REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!reportTarget) return;
    const form = document.getElementById("question-report");
    form?.scrollIntoView({ behavior: "smooth", block: "center" });
    form?.querySelector<HTMLSelectElement>("select")?.focus({ preventScroll: true });
  }, [reportTarget]);
  const query = useInfiniteQuery({
    queryKey: ["questions", userId, "detail", id, sort],
    queryFn: ({ pageParam }) => questionsApi.detail(id, sort, pageParam),
    initialPageParam: 1,
    getNextPageParam: (p) => p.nextAnswerPage,
    enabled: !!userId,
  });
  const question = query.data?.pages[0];
  const answers = [
    ...new Map(
      [
        ...(query.data?.pages.flatMap((p) => p.answers) ?? []),
        ...Object.values(extraReplies).flatMap((p) => p.items),
      ].map((a) => [a.id, a]),
    ).values(),
  ];
  const refresh = async () => {
    setExtraReplies({});
    await cache.invalidateQueries({ queryKey: ["questions"] });
  };
  const run = async (action: () => Promise<unknown>, invalidate = true) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (invalidate) await refresh();
    } catch (e) {
      reportClientError(e, { issueKey: "Questions", keys: { operation: "QuestionDetail" } });
      setError(e instanceof Error ? e.message : "Не удалось выполнить действие");
    } finally {
      setBusy(false);
    }
  };
  const resetComposer = () => {
    setBody("");
    setPhotos([]);
    setEditing(null);
    setReplyTo(null);
    setRequestId(crypto.randomUUID());
  };
  const answerCard = (answer: QuestionAnswerDto) => {
    const isCollapsed = collapsed.includes(answer.id);

    return (
      <article
        key={answer.id}
        id={`answer-${answer.id}`}
        className={`${s.answer} ${s.answerItem} ${answer.parentId && !answer.best ? s.reply : ""} ${answer.best ? s.best : ""}`}
      >
        {answer.best && (
          <div className={s.answerBestLabel}>
            <BestLabel />
          </div>
        )}
        <div className={s.answerMain}>
          <Author author={answer.author} date={answer.createdAt} edited={answer.editedAt} />
          {answer.replyToName && <p className={s.replyTo}>В ответ {answer.replyToName}</p>}
          <div className={s.answerText}>
            <Body text={answer.body} />
          </div>
          <Photos photos={answer.photos} />

          {!answer.deleted && !answer.hidden && (
            <div className={s.answerToolbar}>
              <button
                type="button"
                className={`${s.heart} ${s.answerLike} ${answer.liked ? s.liked : ""}`}
                aria-label={answer.liked ? "Убрать сердечко" : "Поставить сердечко"}
                aria-pressed={answer.liked}
                disabled={busy || answer.author.id === userId || !!question?.blockReason}
                onClick={() => void run(() => questionsApi.heart(answer.id, !answer.liked))}
              >
                {answer.liked ? <Favorite fontSize="small" /> : <FavoriteBorder fontSize="small" />}
                {answer.hearts}
              </button>
              {question?.canReply && (
                <button
                  type="button"
                  className={s.answerAction}
                  onClick={() => {
                    resetComposer();
                    setReplyTo(answer);
                    document.getElementById("reply-body")?.focus();
                  }}
                >
                  <ChatBubbleOutline fontSize="small" aria-hidden="true" />
                  Ответить
                </button>
              )}
              {question?.canManage && (
                <button
                  type="button"
                  className={s.answerBestAction}
                  disabled={busy || !!question.blockReason}
                  onClick={() =>
                    void run(() => questionsApi.best(id, answer.best ? null : answer.id))
                  }
                >
                  <CheckCircleOutline fontSize="small" aria-hidden="true" />
                  {answer.best ? "Снять отметку" : "Лучший ответ"}
                </button>
              )}
              {(answer.canEdit || answer.canDelete || !question?.blockReason) && (
                <details className={s.answerMore}>
                  <summary aria-label="Дополнительные действия с ответом">
                    <MoreHoriz fontSize="small" aria-hidden="true" />
                    <span>Ещё</span>
                  </summary>
                  <div className={s.answerMoreMenu} onClick={(event) => {
                    if ((event.target as HTMLElement).closest("button")) {
                      (event.currentTarget.parentElement as HTMLDetailsElement).open = false;
                    }
                  }}>
                    {answer.canEdit && !question?.blockReason && (
                      <button
                        type="button"
                        onClick={() => {
                          resetComposer();
                          setEditing(answer);
                          setBody(answer.body);
                          setPhotos(answer.photos);
                          document.getElementById("reply-body")?.focus();
                        }}
                      >
                        Изменить
                      </button>
                    )}
                    {answer.canDelete && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm("Удалить ответ? Ответы других пользователей сохранятся."))
                            void run(() => questionsApi.removeAnswer(answer.id));
                        }}
                      >
                        Удалить
                      </button>
                    )}
                    {!question?.blockReason && (
                      <button
                        type="button"
                        aria-label="Пожаловаться на ответ"
                        onClick={() => setReportTarget({ answerId: answer.id })}
                      >
                        <FlagOutlined fontSize="small" aria-hidden="true" />
                        Пожаловаться
                      </button>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}
          {!answer.parentId && answer.replyCount > 0 && (
            <button
              type="button"
              className={s.threadToggle}
              aria-expanded={!isCollapsed}
              onClick={() =>
                setCollapsed((v) =>
                  v.includes(answer.id) ? v.filter((x) => x !== answer.id) : [...v, answer.id],
                )
              }
            >
              {isCollapsed ? <KeyboardArrowDown aria-hidden="true" /> : <KeyboardArrowUp aria-hidden="true" />}
              {isCollapsed
                ? `Показать ответы (${answer.replyCount})`
                : `Скрыть ответы (${answer.replyCount})`}
            </button>
          )}
          {!answer.parentId &&
            !isCollapsed &&
            extraReplies[answer.id]?.nextPage !== null &&
            answer.replyCount > answers.filter((a) => a.parentId === answer.id).length && (
              <button
                type="button"
                className={s.threadToggle}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const page = await questionsApi.replies(
                      answer.id,
                      extraReplies[answer.id]?.nextPage ?? 2,
                    );
                    setExtraReplies((v) => ({
                      ...v,
                      [answer.id]: {
                        ...page,
                        items: [...(v[answer.id]?.items ?? []), ...page.items],
                      },
                    }));
                  }, false)
                }
              >
                Ещё ответы в ветке
              </button>
            )}
        </div>
      </article>
    );
  };
  if (query.isPending)
    return (
      <main className={s.page}>
        <LoadingState variant="inline" message="Загрузка вопроса…" />
      </main>
    );
  if (query.isError || !question)
    return (
      <main className={`${s.page} ${s.detailPage}`}>
        <AppBackButtonLink className={s.detailBack} href="/questions">
          Все вопросы
        </AppBackButtonLink>
        <p role="alert" className={s.error}>
          {query.error?.message ?? "Вопрос недоступен"}
        </p>
        <button className={s.secondary} onClick={() => void query.refetch()}>
          Повторить
        </button>
      </main>
    );
  return (
    <main className={`${s.page} ${s.detailPage}`}>
      <AppBackButtonLink className={s.detailBack} href="/questions">
        Все вопросы
      </AppBackButtonLink>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={s.notice}>
          {notice}
        </p>
      )}
      <article className={`${s.card} ${s.detailCard}`}>
        <Author author={question.author} date={question.createdAt} edited={question.editedAt} />
        <h1>{question.title}</h1>
        <Status question={question} />
        <div className={s.detailBody}>
          <Body text={question.body} />
        </div>
        <Photos photos={question.photos} />
        <div className={s.detailFooter}>
          <div className={s.detailActionGroups}>
            <div className={s.detailMainActions}>
              {question.canReply && (
                <PrimaryButton
                  className={s.detailReplyButton}
                  onClick={() => document.getElementById("reply-body")?.focus()}
                >
                  <ChatBubbleOutline fontSize="small" aria-hidden="true" />
                  Ответить
                </PrimaryButton>
              )}
              <SecondaryButton
                className={s.detailIconButton}
                aria-label="Поделиться вопросом"
                title="Поделиться"
                onClick={() =>
                  void (async () => {
                    try {
                      await navigator.clipboard.writeText(window.location.href);
                      setNotice("Ссылка скопирована");
                    } catch (e) {
                      reportClientError(e, { issueKey: "Questions", keys: { operation: "share" } });
                      setError("Не удалось скопировать ссылку. Скопируйте адрес из строки браузера.");
                    }
                  })()
                }
              >
                <ShareOutlined fontSize="small" aria-hidden="true" />
              </SecondaryButton>
              {!question.blockReason && (
                <SecondaryButton
                  className={s.detailIconButton}
                  aria-label="Пожаловаться на вопрос"
                  title="Пожаловаться"
                  onClick={() => setReportTarget({})}
                >
                  <FlagOutlined fontSize="small" aria-hidden="true" />
                </SecondaryButton>
              )}
              {question.canManage && (
                <SecondaryButton
                  className={s.detailActionButton}
                  disabled={busy || !!question.blockReason}
                  onClick={() => void run(() => questionsApi.close(id, !question.closed))}
                >
                  <LockOutlined fontSize="small" aria-hidden="true" />
                  {question.closed ? "Открыть обсуждение" : "Закрыть обсуждение"}
                </SecondaryButton>
              )}
            </div>
            {((question.canEdit && !question.blockReason) || question.canManage) && (
              <div className={s.detailOwnerActions}>
                {question.canEdit && !question.blockReason && (
                  <SecondaryButtonLink className={s.detailActionButton} href={`/questions/${id}/edit`}>
                    <EditOutlined fontSize="small" aria-hidden="true" />
                    Изменить
                  </SecondaryButtonLink>
                )}
                {question.canManage && (
                  <SecondaryButton
                    variant="red"
                    className={s.detailActionButton}
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Удалить вопрос и скрыть всё обсуждение?"))
                        void run(async () => {
                          await questionsApi.remove(id);
                          router.push("/questions");
                        });
                    }}
                  >
                    <DeleteOutline fontSize="small" aria-hidden="true" />
                    Удалить
                  </SecondaryButton>
                )}
              </div>
            )}
          </div>
          <div className={s.detailCounts}>
            <Counts question={question} />
          </div>
        </div>
      </article>
      {reportTarget && (
        <form
          id="question-report"
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await questionsApi.report(id, { ...reportTarget, reason, details });
              setReportTarget(null);
              setDetails("");
              setNotice("Жалоба отправлена администратору");
            });
          }}
        >
          <h2>Пожаловаться на {reportTarget.answerId ? "ответ" : "вопрос"}</h2>
          <label className={s.field}>
            Причина
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {QUESTION_REPORT_REASONS.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className={s.field}>
            Подробности
            <textarea
              maxLength={1000}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </label>
          <div className={s.actions}>
            <button className={s.primary} disabled={busy}>
              Отправить жалобу
            </button>
            <button type="button" className={s.secondary} onClick={() => setReportTarget(null)}>
              Отмена
            </button>
          </div>
        </form>
      )}
      <section className={`${s.answers} ${s.answersPanel}`} aria-label="Ответы на вопрос">
        <div className={s.answersHeading}>
          <div className={s.answersTitle}>
            <h2>{formatAnswerCount(question.answerCount)}</h2>
          </div>
          <div className={s.answerSort} role="group" aria-label="Сортировка ответов">
            {(
              [
                ["useful", "Полезные"],
                ["new", "Новые"],
              ] as const
            ).map(([v, text]) => (
              <button
                key={v}
                type="button"
                className={`${s.answerSortButton} ${sort === v ? s.answerSortActive : ""}`}
                aria-pressed={sort === v}
                onClick={() => {
                  setSort(v);
                  setExtraReplies({});
                }}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
        {!answers.length && (
          <p className={s.answersEmpty}>
            Пока никто не ответил.{question.canReply ? " Поделитесь опытом первым." : ""}
          </p>
        )}
        <div className={s.answerThreads}>
          {answers
            .filter((a) => a.best || !a.parentId)
            .map((root) => (
              <div className={s.answerThread} key={root.id}>
                {answerCard(root)}
                {!root.parentId &&
                  !collapsed.includes(root.id) &&
                  answers.filter((a) => a.parentId === root.id && !a.best).map(answerCard)}
              </div>
            ))}
        </div>
        {query.hasNextPage && (
          <button
            type="button"
            className={s.secondary}
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Загрузка…" : "Ещё ответы"}
          </button>
        )}
        {query.isFetchingNextPage && <LoadingState variant="inline" message="Загружаем ответы…" />}
      </section>
      {question.blockReason && (
        <p className={s.notice}>Публикации в разделе заблокированы: {question.blockReason}</p>
      )}
      {question.closed && <p className={s.notice}>Обсуждение закрыто. Новые ответы недоступны.</p>}
      {(question.canReply || editing) && (
        <form
          className={`${s.form} ${s.answerComposer}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (uploading) return;
            void run(async () => {
              if (editing)
                await questionsApi.editAnswer(editing.id, {
                  body,
                  photoIds: photos.map((p) => p.id),
                });
              else
                await questionsApi.answer(id, {
                  body,
                  photoIds: photos.map((p) => p.id),
                  replyToId: replyTo?.id,
                  clientRequestId: requestId,
                });
              resetComposer();
            });
          }}
        >
          <div className={s.composerHeading}>
            <div>
              <h2>{editing ? "Редактировать ответ" : replyTo ? "Ответить пользователю" : "Ваш ответ"}</h2>
              {replyTo && !editing && <p>В ответ {replyTo.author.name}</p>}
            </div>
            {(replyTo || editing) && (
              <SecondaryButton type="button" className={s.composerCancel} onClick={resetComposer}>
                Отмена
              </SecondaryButton>
            )}
          </div>
          <label className={s.composerField}>
            <span className={s.visuallyHidden}>Текст ответа</span>
            <textarea
              id="reply-body"
              required
              maxLength={QUESTION_LIMITS.body}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Поделитесь своим опытом или советом…"
            />
          </label>
          <div className={s.composerFooter}>
            <div className={s.composerAttachments}>
              <PhotoPicker photos={photos} onChange={setPhotos} onBusy={setUploading} />
            </div>
            <PrimaryButton
              className={s.composerSubmit}
              disabled={busy || uploading || !body.trim()}
            >
              <SendOutlined fontSize="small" aria-hidden="true" />
              {busy ? "Отправка…" : editing ? "Сохранить" : "Опубликовать ответ"}
            </PrimaryButton>
          </div>
        </form>
      )}
    </main>
  );
}
