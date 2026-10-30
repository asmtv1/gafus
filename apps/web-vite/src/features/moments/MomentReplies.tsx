import { Loading } from "../../shared/ui";
import { useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { listMomentReplies } from "./momentsApi";
import { MomentCommentCard, type ReplyTarget } from "./MomentCommentCard";
import { ApiError } from "../../shared/api/client";
import { RouteLink } from "../../shared/router/location";
import {PrimaryButton} from "../../shared/ui";

export function MomentReplies({ userId, postId, rootId, count, onReply }: {
  userId: string; postId: string; rootId: string; count: number;
  onReply: (target: ReplyTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ["moments", "replies", userId, postId, rootId],
    queryFn: ({ pageParam }) => listMomentReplies(rootId, pageParam),
    refetchInterval: query => open && query.state.data?.pages.some(page =>
      page.items.some(item => (item.mediaProcessing ?? 0) > 0)) ? 5000 : false,
    enabled: open,
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor ?? undefined,
    staleTime: 0, gcTime: 0, retry: false,
  });
  // Each mounted reply root owns its own synchronous READ page flight.
  const pageKey = JSON.stringify([userId, postId, rootId]);
  const pageFlight = useRef<{ key: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const pageBusy = busyKey === pageKey || query.isFetchingNextPage;
  const requestNextPage = () => {
    if (pageFlight.current?.key === pageKey || query.isFetchingNextPage) return;
    const flight = { key: pageKey };
    pageFlight.current = flight;
    setBusyKey(pageKey);
    const release = () => {
      if (pageFlight.current !== flight) return;
      pageFlight.current = null;
      setBusyKey(current => current === pageKey ? null : current);
    };
    void query.fetchNextPage({ cancelRefetch: false }).then(release, release);
  };
  const expired = query.error instanceof ApiError && query.error.status === 401;
  const forbidden = query.error instanceof ApiError && query.error.status === 403;
  const missing = query.error instanceof ApiError && query.error.status === 404;
  const pageDenied = query.isFetchNextPageError && (expired || forbidden || missing);
  const showReadError = query.isError && (!query.isFetchNextPageError || pageDenied);
  const ready = open && !!query.data &&
    (!query.isFetching || query.isFetchingNextPage) &&
    (query.isSuccess || (query.isFetchNextPageError && !pageDenied));
  if (count <= 0) return null;
  const seen = new Set<string>();
  const items = (ready ? query.data!.pages.flatMap(page => page.items) : []).filter(comment => {
    if (seen.has(comment.id)) return false;
    seen.add(comment.id);
    return true;
  }) ?? [];
  return <div className="moment-replies">
    <button type="button" aria-expanded={open} onClick={() => setOpen(current => !current)}>
      {open ? "Скрыть ответы" : "Показать ответы (" + count + ")"}
    </button>
    {open && <>
      {query.isPending && <Loading message="Загружаем ответы…" />}
      {showReadError && <div role="alert">
        <p>{expired ? "Сессия завершена. Войдите снова." :
          forbidden ? "Нет доступа к вложенным ответам." :
          missing ? "Ветка ответов недоступна." : "Не удалось загрузить ответы."}</p>
        {expired ? <RouteLink to="/login">Войти</RouteLink> :
          !forbidden && !missing &&
          <PrimaryButton type="button" onClick={() => void query.refetch()}>Повторить</PrimaryButton>}
      </div>}
      {ready && items.length === 0 && <p>Ответов пока нет.</p>}
      {ready && items.length > 0 && <ul className="compact-grid moment-reply-list">
        {items.map(comment => <li className="compact-card moment-reply-item" key={comment.id}>
          <MomentCommentCard userId={userId} postId={postId} rootId={rootId}
            comment={comment} onReply={onReply} />
        </li>)}
      </ul>}
      {ready && query.hasNextPage && !query.isFetchNextPageError &&
        <PrimaryButton type="button" disabled={pageBusy}
        onClick={requestNextPage}>
        {pageBusy ? "Загрузка…" : "Ещё ответы"}
      </PrimaryButton>}
      {ready && query.isFetchNextPageError && <div role="alert">
        <p>Не удалось загрузить следующую страницу ответов.</p>
        <PrimaryButton type="button" disabled={pageBusy} onClick={requestNextPage}>
          {pageBusy ? "Загрузка…" : "Повторить страницу ответов"}
        </PrimaryButton>
      </div>}
    </>}
  </div>;
}
