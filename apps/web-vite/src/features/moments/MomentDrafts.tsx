import { Loading } from "../../shared/ui";
import { PrimaryButton, SecondaryButton } from "../../shared/ui";
import { useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../shared/api/client";
import { RouteLink, momentDraftPath, momentPath } from "../../shared/router/location";
import { getMomentsStatus } from "./momentsApi";
import { listMomentDrafts, deleteMomentDraft } from "./momentComposerApi";
import "./moment-drafts-clean.css";

export function MomentDrafts({ userId }: { userId: string }) {
  const cache = useQueryClient();
  const deleteFlight = useRef(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);
  const status = useQuery({
    queryKey: ["moments", "status", userId], queryFn: getMomentsStatus,
    staleTime: 0, gcTime: 0, retry: false,
  });
  const accessReady = status.isSuccess && !status.isFetching && status.data.enabled;
  const drafts = useInfiniteQuery({
    queryKey: ["moments", "drafts", userId],
    queryFn: async ({ pageParam }) => {
      const result = await listMomentDrafts(pageParam);
      if (pageParam !== null && result.nextCursor === pageParam)
        throw new Error("Повторяющийся курсор страницы черновиков");
      return result;
    },
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: accessReady, staleTime: 0, gcTime: 0, retry: false,
  });
  const flight = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  function loadMore() {
    if (flight.current || !accessReady || !drafts.hasNextPage ||
        drafts.isFetchingNextPage) return;
    flight.current = true;
    setLoadingMore(true);
    const release = () => {
      flight.current = false;
      setLoadingMore(false);
    };
    void drafts.fetchNextPage({ cancelRefetch: false }).then(release, release);
  }
  // Terminal owner denial must retire cached earlier pages, including when
  // only a later cursor request receives 401/403/404.
  const denied = drafts.error instanceof ApiError &&
    [401, 403, 404].includes(drafts.error.status);
  const pageDenied = drafts.isFetchNextPageError && denied;
  const ready = accessReady && !!drafts.data &&
    (!drafts.isFetching || drafts.isFetchingNextPage) &&
    (drafts.isSuccess || (drafts.isFetchNextPageError && !pageDenied));
  const deletePost = async (id: string) => {
    if (deleteFlight.current || !accessReady || !ready ||
        !drafts.data?.pages.some(page => page.items.some(post => post.id === id))) return;
    if (!window.confirm("Удалить незавершённую публикацию и её вложения?")) return;
    deleteFlight.current = true;
    setDeletingId(id);
    setDeleteError(null);
    try {
      await deleteMomentDraft(id);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["moments", "drafts", userId] }),
        cache.invalidateQueries({ queryKey: ["moments", "pending-posts", userId] }),
        cache.invalidateQueries({ queryKey: ["moments", "list", userId] }),
      ]);
    } catch {
      setDeleteError({ id, message:
        "Удаление не подтверждено сервером. Проверьте список перед повтором." });
    } finally {
      deleteFlight.current = false;
      setDeletingId(null);
    }
  };
  const seen = new Set<string>();
  const items = (ready ? drafts.data!.pages.flatMap(page => page.items) : []).filter(post => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
  return <section className="collection-section moment-drafts-page"
    aria-label="Мои черновики «Моментов»">
    <div className="moment-drafts-panel">
      <header className="moment-drafts-heading">
        <span className="moment-drafts-eyebrow">МОМЕНТЫ / МОИ ПУБЛИКАЦИИ</span>
        <h1>Черновики и обработка</h1>
        <p>Здесь можно продолжить публикацию и проверить обработку вложений.</p>
      </header>

      {status.isPending && <Loading message="Проверяем доступ…" />}
      {status.isError && <div className="moment-drafts-notice" role="alert">
        Не удалось проверить доступность.
      </div>}
      {status.isSuccess && !status.data.enabled &&
        <div className="moment-drafts-notice">Моменты сейчас недоступны.</div>}
      {accessReady && <>
        <div className="moment-drafts-toolbar">
          <RouteLink to="/moments/new" className="moment-drafts-create">
            <span aria-hidden="true">+</span> Новая публикация
          </RouteLink>
          <SecondaryButton type="button" className="moment-drafts-refresh"
            disabled={drafts.isFetching}
            onClick={() => void drafts.refetch()}>
            <svg width="16" height="16" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
              strokeLinejoin="round" fill="none" aria-hidden="true">
              <path d="M20 7v5h-5M4 17v-5h5" />
              <path d="M5.5 9a7 7 0 0 1 12.1-2L20 12M4 12l2.4 5a7 7 0 0 0 12.1-2" />
            </svg>
            {drafts.isFetching ? "Обновляем…" : "Обновить список"}
          </SecondaryButton>
        </div>
        {drafts.isPending && <Loading message="Загружаем черновики…" />}
        {drafts.isError && (!drafts.isFetchNextPageError || pageDenied) && (
          <div role="alert" className="moment-drafts-notice">
            <p>{denied ? "Доступ к черновикам закрыт." :
              "Не удалось получить черновики."}</p>
            {!denied && <PrimaryButton type="button"
              onClick={() => void drafts.refetch()}>Повторить</PrimaryButton>}
          </div>
        )}
        {ready && items.length === 0 && <div className="moment-drafts-empty">
          <span className="moment-drafts-empty-icon" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" fill="none">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
              <path d="M9 14h6" />
            </svg>
          </span>
          <h2>Незавершённых публикаций нет.</h2>
          <p>Все публикации завершены. Новую можно создать в любой момент.</p>
        </div>}
        {ready && items.length > 0 && <>
          <div className="moment-drafts-list-heading">
            <h2>Ваши публикации</h2>
            <span>{items.length} из загруженных</span>
          </div>
          <ul className="compact-grid moment-drafts-list">
            {items.map(post => <li key={post.id} className="compact-card moment-drafts-item">
              <div className="moment-drafts-item-top">
                <span className={"moment-drafts-status moment-drafts-status-" + post.status}>
                  {post.status === "pending" ? "Обрабатывается" :
                    post.status === "failed" ? "Ошибка обработки" :
                    post.status === "published" ? "Опубликовано" : "Черновик"}
                </span>
              </div>
              <p className="moment-drafts-preview">{post.text || "Без текста"}</p>
              <div className="moment-drafts-item-actions">
                {post.status === "pending"
                  ? <RouteLink className="moment-drafts-item-open"
                      to="/moments">Посмотреть прогресс в ленте</RouteLink>
                  : post.status === "published"
                    ? <RouteLink className="moment-drafts-item-open"
                        to={momentPath(post.id)}>Открыть публикацию</RouteLink>
                    : <RouteLink className="moment-drafts-item-open"
                        to={momentDraftPath(post.id)}>Продолжить</RouteLink>}
                {post.status !== "published" && <SecondaryButton
                  className="moment-drafts-item-delete" type="button"
                  variant="red" disabled={deletingId !== null || drafts.isFetching}
                  onClick={() => void deletePost(post.id)}>
                  {deletingId === post.id ? "Удаляем…" : "Удалить"}
                </SecondaryButton>}
              </div>
              {deleteError?.id === post.id &&
                <p role="alert" className="moment-drafts-item-error">{deleteError.message}</p>}
            </li>)}
          </ul>
        </>}
        {ready && drafts.hasNextPage && !drafts.isFetchNextPageError && (
          <button className="moment-drafts-more" type="button"
            disabled={loadingMore || drafts.isFetchingNextPage}
            onClick={loadMore}>
            {loadingMore || drafts.isFetchingNextPage ? "Загружаем…" : "Ещё черновики"}
          </button>
        )}
        {ready && drafts.isFetchNextPageError && (
          <div className="moment-drafts-notice" role="alert">
            <p>Не удалось загрузить следующую страницу черновиков.</p>
            <PrimaryButton type="button" disabled={loadingMore || drafts.isFetchingNextPage}
              onClick={loadMore}>Повторить страницу черновиков</PrimaryButton>
          </div>
        )}
      </>}
    </div>
  </section>;
}
