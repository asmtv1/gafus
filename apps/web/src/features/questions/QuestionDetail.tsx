"use client";
import { reportClientError } from "@gafus/error-handling";
import { LoadingState } from "@/shared/components/ui";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  Favorite,
  FavoriteBorder,
  FlagOutlined,
  ShareOutlined,
  LockOutlined,
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
  const answerCard = (answer: QuestionAnswerDto) => (
    <article
      key={answer.id}
      id={`answer-${answer.id}`}
      className={`${s.answer} ${answer.parentId && !answer.best ? s.reply : ""} ${answer.best ? s.best : ""}`}
    >
      {answer.best && <BestLabel />}
      <Author author={answer.author} date={answer.createdAt} edited={answer.editedAt} />
      {answer.replyToName && <p className={s.meta}>В ответ {answer.replyToName}</p>}
      <Body text={answer.body} />
      <Photos photos={answer.photos} />
      {!answer.deleted && !answer.hidden && (
        <div className={s.actions}>
          <button
            className={`${s.heart} ${answer.liked ? s.liked : ""}`}
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
              className={s.textButton}
              onClick={() => {
                resetComposer();
                setReplyTo(answer);
                document.getElementById("reply-body")?.focus();
              }}
            >
              Ответить
            </button>
          )}
          {question?.canManage && (
            <button
              className={s.textButton}
              disabled={busy || !!question.blockReason}
              onClick={() => void run(() => questionsApi.best(id, answer.best ? null : answer.id))}
            >
              {answer.best ? "Снять лучший ответ" : "Выбрать лучшим"}
            </button>
          )}
          {answer.canEdit && !question?.blockReason && (
            <button
              className={s.textButton}
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
              className={s.textButton}
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
              className={s.textButton}
              aria-label="Пожаловаться на ответ"
              onClick={() => {
                setReportTarget({ answerId: answer.id });
              }}
            >
              <FlagOutlined fontSize="small" />
              Жалоба
            </button>
          )}
        </div>
      )}
      {!answer.parentId && answer.replyCount > 0 && (
        <button
          className={s.textButton}
          aria-expanded={!collapsed.includes(answer.id)}
          onClick={() =>
            setCollapsed((v) =>
              v.includes(answer.id) ? v.filter((x) => x !== answer.id) : [...v, answer.id],
            )
          }
        >
          {collapsed.includes(answer.id) ? "Показать ответы" : "Скрыть ответы"}
        </button>
      )}
      {!answer.parentId &&
        !collapsed.includes(answer.id) &&
        extraReplies[answer.id]?.nextPage !== null &&
        answer.replyCount > answers.filter((a) => a.parentId === answer.id).length && (
          <button
            className={s.textButton}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const page = await questionsApi.replies(
                  answer.id,
                  extraReplies[answer.id]?.nextPage ?? 2,
                );
                setExtraReplies((v) => ({
                  ...v,
                  [answer.id]: { ...page, items: [...(v[answer.id]?.items ?? []), ...page.items] },
                }));
              }, false)
            }
          >
            Ещё ответы в ветке
          </button>
        )}
    </article>
  );
  if (query.isPending)
    return (
      <main className={s.page}>
        <LoadingState variant="inline" message="Загрузка вопроса…" />
      </main>
    );
  if (query.isError || !question)
    return (
      <main className={s.page}>
        <Link className={s.back} href="/questions">
          Все вопросы
        </Link>
        <p role="alert" className={s.error}>
          {query.error?.message ?? "Вопрос недоступен"}
        </p>
        <button className={s.secondary} onClick={() => void query.refetch()}>
          Повторить
        </button>
      </main>
    );
  return (
    <main className={s.page}>
      <Link className={s.back} href="/questions">
        Все вопросы
      </Link>
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
      <article className={s.card}>
        <Author author={question.author} date={question.createdAt} edited={question.editedAt} />
        <h1>{question.title}</h1>
        <Status question={question} />
        <div style={{ marginTop: 20 }}>
          <Body text={question.body} />
        </div>
        <Photos photos={question.photos} />
        <div className={s.cardFooter}>
          <div className={s.actions}>
            {question.canReply && (
              <button
                className={s.primary}
                onClick={() => document.getElementById("reply-body")?.focus()}
              >
                Ответить
              </button>
            )}
            <button
              className={s.secondary}
              aria-label="Поделиться вопросом"
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
              <ShareOutlined fontSize="small" />
            </button>
            {!question.blockReason && (
              <button
                className={s.secondary}
                aria-label="Пожаловаться на вопрос"
                onClick={() => setReportTarget({})}
              >
                <FlagOutlined fontSize="small" />
              </button>
            )}
            {question.canManage && (
              <button
                className={s.secondary}
                disabled={busy || !!question.blockReason}
                onClick={() => void run(() => questionsApi.close(id, !question.closed))}
              >
                <LockOutlined fontSize="small" />
                {question.closed ? "Открыть обсуждение" : "Закрыть обсуждение"}
              </button>
            )}
            {question.canEdit && !question.blockReason && (
              <Link className={s.textButton} href={`/questions/${id}/edit`}>
                Изменить
              </Link>
            )}
            {question.canManage && (
              <button
                className={s.textButton}
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Удалить вопрос и скрыть всё обсуждение?"))
                    void run(async () => {
                      await questionsApi.remove(id);
                      router.push("/questions");
                    });
                }}
              >
                Удалить
              </button>
            )}
          </div>
          <Counts question={question} />
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
      <section className={s.answers}>
        <div className={s.heading}>
          <h2>{question.answerCount} ответов</h2>
          <div className={s.tabs}>
            {[
              ["useful", "Полезные"],
              ["new", "Новые"],
            ].map(([v, text]) => (
              <button
                key={v}
                className={`${s.secondary} ${sort === v ? s.selected : ""}`}
                aria-pressed={sort === v}
                onClick={() => {
                  setSort(v!);
                  setExtraReplies({});
                }}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
        {!answers.length && (
          <p className={s.meta}>
            Пока никто не ответил.{question.canReply ? " Поделитесь опытом первым." : ""}
          </p>
        )}
        {answers
          .filter((a) => a.best || !a.parentId)
          .map((root) => (
            <div key={root.id}>
              {answerCard(root)}
              {!root.parentId &&
                !collapsed.includes(root.id) &&
                answers.filter((a) => a.parentId === root.id && !a.best).map(answerCard)}
            </div>
          ))}
        {query.hasNextPage && (
          <button
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
          className={s.form}
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
          <label className={s.field}>
            {editing
              ? "Редактировать ответ"
              : replyTo
                ? `Ответ для ${replyTo.author.name}`
                : "Ваш ответ"}
            <textarea
              id="reply-body"
              required
              maxLength={QUESTION_LIMITS.body}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Поделитесь своим опытом"
            />
          </label>
          <PhotoPicker photos={photos} onChange={setPhotos} onBusy={setUploading} />
          <div className={s.actions}>
            <button className={s.primary} disabled={busy || uploading || !body.trim()}>
              {busy ? "Отправка…" : editing ? "Сохранить" : "Ответить"}
            </button>
            {(replyTo || editing) && (
              <button type="button" className={s.secondary} onClick={resetComposer}>
                Отмена
              </button>
            )}
          </div>
        </form>
      )}
    </main>
  );
}
