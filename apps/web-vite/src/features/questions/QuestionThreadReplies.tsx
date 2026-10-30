import { Loading } from "../../shared/ui";
import { useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { listQuestionReplies } from "./questionApi";
import { AnswerActionBar } from "./AnswerActionBar";
import { QuestionAnswerAvatar } from "./QuestionAnswerAvatar";

import { QuestionPhotoGallery } from "./QuestionPhotoGallery";
import { ApiError } from "../../shared/api/client";
import { RouteLink } from "../../shared/router/location";
import {PrimaryButton} from "../../shared/ui";

/** Reply threads are fetched only when requested, with bounded server pages. */
type ThreadProps = {
  rootId: string;
  userId: string;
  questionId: string;
  blocked: boolean;
  canReply: boolean;
  canManage?: boolean;
  onReply: (id: string, authorName: string) => void;
  /** Child previews returned by the same authenticated question GET. */
  knownReplyIds?: string[];
};

// Expanded thread and prior owner permissions cannot follow a principal,
// discussion, root answer or moderator block-state switch.
export function QuestionThreadReplies(props: ThreadProps) {
  return (
    <ThreadRepliesScreen
      key={`${props.userId}/${props.questionId}/${props.rootId}/${props.blocked}`}
      {...props}
    />
  );
}

function ThreadRepliesScreen({
  rootId,
  userId,
  questionId,
  blocked,
  canReply,
  canManage = false,
  onReply,
  knownReplyIds = [],
}: ThreadProps) {
  const [expanded, setExpanded] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ["questions", "replies", userId, questionId, rootId],
    queryFn: ({ pageParam }) => listQuestionReplies(rootId, pageParam, userId, blocked),
    initialPageParam: 1,
    getNextPageParam: (page) => page.nextPage ?? undefined,
    enabled: expanded,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  // Each expanded root owns its own synchronous READ next/retry flight.
  const pageKey = JSON.stringify([userId, questionId, rootId]);
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
  // A denied next-page GET must invalidate only this expanded reply branch;
  // transient failures may retain verified earlier replies for manual retry.
  const pageDenied = query.isFetchNextPageError && (unauthenticated || forbidden || notFound);
  const showReadError = query.isError && (!query.isFetchNextPageError || pageDenied);
  const ready =
    expanded &&
    !!query.data &&
    (!query.isFetching || query.isFetchingNextPage) &&
    (query.isSuccess || (query.isFetchNextPageError && !pageDenied));
  const seen = new Set<string>();
  const knownIds = new Set(knownReplyIds);
  const replies = (ready ? query.data!.pages.flatMap((page) => page.items) : []).filter((item) => {
    if (seen.has(item.id) || knownIds.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return (
    <div className="question-thread">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>
        {expanded ? "Свернуть ответы" : knownReplyIds.length > 0
          ? "Ещё ответы в ветке" : "Показать ответы на комментарий"}
      </button>
      {expanded && (
        <>
          {query.isPending && <Loading message="Загружаем ответы…" />}
          {query.isFetching && query.data && <Loading message="Проверяем вложенные ответы…" />}
          {showReadError && (
            <div role="alert">
              <p>
                {unauthenticated
                  ? "Сессия завершена. Войдите снова."
                  : forbidden
                    ? "Нет доступа к вложенным ответам."
                    : notFound
                      ? "Ветка ответов недоступна."
                      : "Не удалось загрузить вложенные ответы."}
              </p>
              {unauthenticated ? (
                <RouteLink to="/login">Войти</RouteLink>
              ) : (
                !forbidden && !notFound && (
                  <PrimaryButton type="button" onClick={() => void query.refetch()}>
                    Повторить
                  </PrimaryButton>
                )
              )}
            </div>
          )}
          {ready && replies.length === 0 && <p>Вложенных ответов пока нет.</p>}
          {ready && (
            <ul className="compact-grid web4-question-thread-replies">
              {replies.map((reply) => (
                <li key={reply.id} className="compact-card web4-question-inline-reply">
                  <header className="web4-question-answer-author">
                    <QuestionAnswerAvatar name={reply.authorName} url={reply.authorAvatarUrl} />
                    <div className="web4-question-answer-meta">
                      <strong>{reply.authorName}</strong>
                      {reply.replyToName && (
                        <span className="web4-question-reply-context">В ответ {reply.replyToName}</span>
                      )}
                    </div>
                  </header>
                  <div className="web4-question-answer-body">
                    <p>{reply.body}</p>
                    {!reply.deleted && !reply.hidden && (
                      <QuestionPhotoGallery
                        location={{
                          questionId,
                          answerId: reply.id,
                          rootId,
                          photoIds: reply.photoIds,
                          page:
                            (query.data?.pages.findIndex((p) =>
                              p.items.some((i) => i.id === reply.id),
                            ) ?? 0) + 1,
                        }}
                      />
                    )}
                  </div>
                  <AnswerActionBar userId={userId} questionId={questionId}
                    answer={reply} blocked={blocked} canReply={canReply}
                    canManage={canManage} onReply={onReply} />
                </li>
              ))}
            </ul>
          )}
          {ready && query.hasNextPage && !query.isFetchNextPageError && (
            <PrimaryButton
              type="button"
              disabled={pageBusy}
              onClick={requestNextPage}
            >
              {pageBusy ? "Загрузка…" : "Ещё вложенные ответы"}
            </PrimaryButton>
          )}
          {ready && query.isFetchNextPageError && (
            <div role="alert">
              <p>Не удалось загрузить следующую страницу ответов.</p>
              <PrimaryButton type="button" disabled={pageBusy} onClick={requestNextPage}>
                {pageBusy ? "Загрузка…" : "Повторить страницу"}
              </PrimaryButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
