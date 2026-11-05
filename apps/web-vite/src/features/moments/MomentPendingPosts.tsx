import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../shared/api/client";
import { legacyMomentEditPath, RouteLink } from "../../shared/router/location";
import { listMomentDrafts, deleteMomentDraft } from "./momentComposerApi";
import { PrimaryButton, SecondaryButton } from "../../shared/ui";
import styles from "./MomentPendingPosts.module.css";

/** The retained Next feed shows server-owned drafts/pending/failed posts in-place.
 * This list is recoverable after a tab reload: it never relies on JS-only
 * in-flight uploads or treats a local upload event as server publication. */
export function MomentPendingPosts({ userId }: { userId: string }) {
  const cache = useQueryClient();
  const flight = useRef(false);
  // Compare consecutive owner-authorized snapshots. The pending endpoint
  // intentionally stops listing a post once Core promotes it to published.
  const seenPending = useRef<{ userId: string; ids: Set<string> } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["moments", "pending-posts", userId],
    queryFn: () => listMomentDrafts(),
    retry: false, staleTime: 0, gcTime: 0,
    refetchInterval: current => {
      if (typeof document !== "undefined" && document.hidden) return false;
      return current.state.data?.items.some(item => item.status === "pending") ? 5_000 : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    // Only a successful fresh server response may advance the feed.
    // Never use a transient 503, stale cache, a different user or an
    // optimistic upload progress event to declare publication complete.
    if (!query.isSuccess || query.isFetching || !query.data) return;
    const next = new Set(query.data.items
      .filter(item => item.status === "pending").map(item => item.id));
    const previous = seenPending.current;
    seenPending.current = { userId, ids: next };
    if (!previous || previous.userId !== userId ||
        ![...previous.ids].some(id => !next.has(id))) return;
    // Invalidate all active sorts/infinite pages, not just the "new" tab.
    // Core's regular feed GET remains authoritative for actual visibility.
    void cache.invalidateQueries({ queryKey: ["moments", "list", userId] });
    void cache.invalidateQueries({ queryKey: ["moments", "drafts", userId] });
  }, [cache, query.data, query.dataUpdatedAt, query.isSuccess, query.isFetching, userId]);
  const denied = query.error instanceof ApiError &&
    [401, 403, 404].includes(query.error.status);
  const ready = query.isSuccess && !query.isFetching;
  const pending = ready ? query.data.items.filter(item => item.status !== "published") : [];
  // Do not issue another destructive request while one delete is unsettled.
  async function deletePending(id: string) {
    if (flight.current || !ready || !pending.some(item => item.id === id)) return;
    if (!window.confirm("Удалить незавершённую публикацию? Вложения также будут очищены из хранилища."))
      return;
    flight.current = true;
    setDeletingId(id);
    setError("");
    try {
      await deleteMomentDraft(id);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["moments", "pending-posts", userId] }),
        cache.invalidateQueries({ queryKey: ["moments", "drafts", userId] }),
        cache.invalidateQueries({ queryKey: ["moments", "list", userId] }),
      ]);
    } catch {
      setError("Удаление не подтверждено сервером. Проверьте список перед повтором.");
    } finally {
      flight.current = false;
      setDeletingId(null);
    }
  }
  // Denied/refetching responses never reveal an older cached owner's data.
  if (denied || (ready && pending.length === 0) ||
      (!ready && !query.isError)) return null;
  return <section className={styles.panel} aria-label="Мои публикации в обработке">
    <header className={styles.heading}>
      <div>
        <h2>Мои публикации в обработке</h2>
        <p>Сохранённые публикации и вложения</p>
      </div>
      {ready && <span className={styles.count} aria-label={`Публикаций: ${pending.length}`}>
        {pending.length}
      </span>}
    </header>
    {query.isError && <div className={styles.notice} role="alert">
      <p>Не удалось проверить незавершённые публикации.</p>
      <PrimaryButton type="button" onClick={() => void query.refetch()}>
        Повторить проверку
      </PrimaryButton>
    </div>}
    {ready && <ul className={styles.list}>
      {pending.map(item => <li key={item.id} className={styles.card}>
        <div className={styles.cardHead}>
          <div className={styles.icon} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
              strokeLinejoin="round">
              <rect x="5" y="3" width="14" height="18" rx="3"/>
              <path d="M9 8h6M9 12h6M9 16h4"/>
            </svg>
          </div>
          <div className={styles.cardInfo}>
            <div className={styles.titleRow}>
              <h3 title={item.text || "Публикация с вложениями"}>
                {item.text.slice(0, 100) || "Публикация с вложениями"}
              </h3>
              <span className={styles.status} data-state={item.status}>
                {item.status === "pending" ? "Обрабатывается" :
                  item.status === "failed" ? "Ошибка обработки" : "Черновик"}
              </span>
            </div>
            <p className={styles.caption}>
              {item.status === "pending" ?
                  "Публикация готовится к показу. Если обработка долго не завершается, сервис может быть недоступен. Сохраните оригинальные файлы; повторная проверка не перезапускает обработку." :
                item.status === "failed" ?
                  "Обработка вложений не завершилась. Серверный повтор может быть недоступен. Откройте черновик, сохраните исходные файлы и прикрепите неудавшееся вложение заново." :
                  "Можно продолжить редактирование и опубликовать"}
            </p>
          </div>
        </div>
        {typeof item.uploadPercent === "number" && item.status !== "failed" ? (
          <div className={styles.progress}>
            <div className={styles.progressText}>
              <span>Файлы загружены</span>
              <strong>{item.uploadPercent}%</strong>
            </div>
            <div className={styles.track} role="progressbar"
              aria-label="Доля загруженных вложений" aria-valuemin={0}
              aria-valuemax={100} aria-valuenow={item.uploadPercent}>
              <div className={styles.fill} style={{ width: `${item.uploadPercent}%` }} />
            </div>
            {item.status === "pending" && <p className={styles.processing}>
              <span className={styles.dot} aria-hidden="true" />
              Обработка на сервере ещё продолжается
            </p>}
          </div>
        ) : item.status === "pending" ? (
          <div className={styles.progress}>
            <div className={styles.progressText}>
              <span>Обработка публикации</span><strong>В процессе</strong>
            </div>
            <div className={styles.track} role="progressbar"
              aria-label="Обработка публикации, процент пока неизвестен">
              <div className={styles.indeterminate} />
            </div>
          </div>
        ) : null}
        <div className={styles.actions}>
          {item.status !== "pending" && <RouteLink className={styles.continue}
            to={legacyMomentEditPath(item.id)}>
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="m14 5 5 5-9 9H5v-5l9-9Z" />
            </svg>
            Продолжить
          </RouteLink>}
          <SecondaryButton className={styles.delete} type="button" variant="red"
            disabled={deletingId !== null} onClick={() => void deletePending(item.id)}>
            {deletingId === item.id ? "Удаляем…" : "Удалить"}
          </SecondaryButton>
        </div>
      </li>)}
    </ul>}
    {error && <p className={styles.notice} role="alert">{error}</p>}
    {ready && query.data.nextCursor &&
      <RouteLink className={styles.more} to="/moments/drafts">
        Показать остальные черновики
      </RouteLink>}
  </section>;
}
