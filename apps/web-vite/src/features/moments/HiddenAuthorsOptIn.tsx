import { Loading } from "../../shared/ui";
import { BackButton, PrimaryButton } from "../../shared/ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { AuthUser } from "../../shared/auth/authApi";
import { navigate, RouteLink } from "../../shared/router/location";
import { ApiError } from "../../shared/api/client";
import {
  projectHiddenAuthorsStatus,
  projectHiddenAuthorsPage,
  hiddenAuthorsHonoRead,
  restoreHiddenAuthor,
  type HiddenAuthorsReadTransport,
} from "./hiddenAuthorsReadApi";

function HiddenAuthorsPanel({
  owner,
  wire,
  isCurrent,
  onClose,
  onRestored,
}: {
  owner: string;
  wire: HiddenAuthorsReadTransport;
  isCurrent: () => boolean;
  onClose: () => void;
  onRestored: () => Promise<unknown>;
}) {
  const access = useQuery({
    queryKey: ["moments", "hidden-authors", "access", owner],
    queryFn: async () => {
      const next = projectHiddenAuthorsStatus(await wire.status());
      if (!isCurrent()) throw Error("STALE_HIDDEN_AUTHORS_SESSION");
      return next;
    },
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
  // Revalidate the access flag before consuming any cached owner list.
  const accessReady = access.isSuccess && !access.isFetching;
  const authors = useInfiniteQuery({
    queryKey: ["moments", "hidden-authors", "list", owner],
    queryFn: async ({ pageParam }) => {
      const result = projectHiddenAuthorsPage(await wire.list(pageParam));
      if (!isCurrent()) throw Error("STALE_HIDDEN_AUTHORS_SESSION");
      if (pageParam !== null && result.nextCursor === pageParam)
        throw Error("REPEATED_HIDDEN_AUTHOR_CURSOR");
      return result;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: accessReady && access.data.enabled === true,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  // React commits fetching state after the click; guard READ pagination immediately.
  // The owner is part of the query key, and a late old flight cannot release a new one.
  const pageKey = JSON.stringify(["moments", "hidden-authors", "list", owner]);
  const pageFlight = useRef<{ key: string } | null>(null);
  const [restoreBusy, setRestoreBusy] = useState<string | null>(null);
  const restoreFlight = useRef(false);
  const [restoreError, setRestoreError] = useState("");
  const restore = async (authorId: string) => {
    if (restoreFlight.current || !isCurrent() || !accessReady ||
        access.data.enabled !== true ||
        wire.fixtureKind !== "AG2_HIDDEN_AUTHORS_HONO_GET_ONLY") return;
    restoreFlight.current = true;
    setRestoreBusy(authorId);
    setRestoreError("");
    try {
      await restoreHiddenAuthor(authorId);
      if (!isCurrent()) return;
      // Do not optimistically remove an author: read the server's real owner list.
      const refreshed = await authors.refetch();
      if (refreshed.isError) throw Error("RESTORE_RECHECK_FAILED");
      if (!isCurrent()) return;
      await onRestored();
    } catch {
      if (isCurrent()) setRestoreError(
        "Не удалось подтвердить изменение. Обновите список перед повтором.",
      );
    } finally {
      restoreFlight.current = false;
      if (isCurrent()) setRestoreBusy(null);
    }
  };
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const pageBusy = busyKey === pageKey || authors.isFetchingNextPage;
  const requestNextPage = () => {
    if (!isCurrent() || !accessReady || access.data?.enabled !== true ||
      pageFlight.current?.key === pageKey || authors.isFetchingNextPage) return;
    const flight = { key: pageKey };
    pageFlight.current = flight;
    setBusyKey(pageKey);
    const release = () => {
      if (pageFlight.current !== flight) return;
      pageFlight.current = null;
      setBusyKey((current) => current === pageKey ? null : current);
    };
    void authors.fetchNextPage({ cancelRefetch: false }).then(release, release);
  };
  const expired = authors.error instanceof ApiError && authors.error.status === 401;
  const forbidden = authors.error instanceof ApiError && authors.error.status === 403;
  const missing = authors.error instanceof ApiError && authors.error.status === 404;
  const pageDenied = authors.isFetchNextPageError && (expired || forbidden || missing);
  const showReadError = authors.isError && (!authors.isFetchNextPageError || pageDenied);
  // Terminal denial invalidates the visible owner list; only transient next-page
  // failures retain verified authors and the existing same-cursor manual retry.
  const authorsReady =
    accessReady &&
    access.data.enabled &&
    (!authors.isFetching || authors.isFetchingNextPage) &&
    (authors.isSuccess || (authors.isFetchNextPageError && !pageDenied));
  const seen = new Set<string>();
  const list = (authorsReady ? authors.data!.pages.flatMap((page) => page.items) : []).filter(
    (item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    },
  );
  if (!isCurrent()) return <p role="alert">Сессия изменилась. Откройте «Моменты» заново.</p>;
  return (
    <section className="hidden-authors-panel"
      aria-label={wire.fixtureKind === "AG2_HIDDEN_AUTHORS_HONO_GET_ONLY"
        ? "Скрытые авторы" : "Скрытые авторы (макет)"}>
      <header>
        <h3>Скрытые авторы</h3>
        <BackButton type="button" onClick={onClose}>К «Моментам»</BackButton>
      </header>
      <p className="note">
        Публикации этих авторов скрыты из общей ленты «Моментов». Их публичные профили
        остаются доступными.
      </p>
      {access.isPending && <Loading message="Проверяем доступность «Моментов»…" />}
      {access.isFetching && access.data && (
        <Loading variant="compact" message="Перепроверяем доступность «Моментов»…" />
      )}
      {access.isError && (
        <div role="alert">
          <p>Не удалось проверить доступ.</p>
          <PrimaryButton type="button" onClick={() => void access.refetch()}>
            Повторить проверку
          </PrimaryButton>
        </div>
      )}
      {accessReady && !access.data.enabled && <p role="status">«Моменты» сейчас недоступны.</p>}
      {accessReady && access.data.enabled && (
        <>
          {authors.isPending && <Loading message="Загружаем скрытых авторов…" />}
          {showReadError && (
            <div role="alert">
              <p>{expired ? "Сессия завершена. Войдите снова." :
                forbidden ? "Нет доступа к списку скрытых авторов." :
                missing ? "Список скрытых авторов недоступен." :
                "Не удалось загрузить скрытых авторов."}</p>
              {expired ? <RouteLink to="/login">Войти</RouteLink> :
                !forbidden && !missing && (
                  <PrimaryButton type="button" onClick={() => void authors.refetch()}>
                    Повторить чтение
                  </PrimaryButton>
                )}
            </div>
          )}
          {restoreError && <p role="alert">{restoreError}</p>}
          {authorsReady && list.length === 0 && (
            <p role="status" className="empty-state">
              Скрытых авторов пока нет.
            </p>
          )}
          {authorsReady && list.length > 0 && (
            <ul className="hidden-authors-grid">
              {list.map((author) => (
                <li key={author.id} className="compact-card">
                  <strong><a href={"/profile?username=" +
                    encodeURIComponent(author.username)}>{author.name}</a></strong>
                  <p className="note">@{author.username}</p>
                  {wire.fixtureKind === "AG2_HIDDEN_AUTHORS_HONO_GET_ONLY" && (
                    <button type="button" className="button-secondary"
                      disabled={restoreBusy !== null}
                      onClick={() => void restore(author.id)}>
                      {restoreBusy === author.id ? "Возвращаем…" :
                        "Показывать в «Моментах»"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {authorsReady && authors.hasNextPage && !authors.isFetchNextPageError && (
            <button
              type="button"
              disabled={pageBusy}
              onClick={requestNextPage}
            >
              {pageBusy ? "Загружаем…" : "Ещё авторы"}
            </button>
          )}
          {authorsReady && authors.isFetchNextPageError && (
            <div role="alert">
              <p>Следующая страница недоступна. Попробуйте ещё раз.</p>
              <PrimaryButton type="button" disabled={pageBusy} onClick={requestNextPage}>
                {pageBusy ? "Загружаем…" : "Повторить страницу авторов"}
              </PrimaryButton>
            </div>
          )}
        </>
      )}
    </section>
  );
}
function BoundHiddenAuthors({
  owner,
  wire,
  routeMode,
}: {
  owner: string;
  wire: HiddenAuthorsReadTransport;
  routeMode: boolean;
}) {
  const global = useQueryClient();
  const initial = useRef(global.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id ?? null);
  const epoch = useRef(0);
  const seen = useRef(initial.current);
  const version = useSyncExternalStore(
    (cb) =>
      global.getQueryCache().subscribe((e) => {
        if (
          e.query.queryKey.length === CURRENT_USER_QUERY_KEY.length &&
          e.query.queryKey.every((k: unknown, i: number) => k === CURRENT_USER_QUERY_KEY[i])
        ) {
          const next = global.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id ?? null;
          if (
            next !== seen.current &&
            (next !== null || e.type === "removed" || e.query.state.data === null)
          ) {
            seen.current = next;
            epoch.current++;
            cb();
          }
        }
      }),
    () => epoch.current,
    () => epoch.current,
  );
  const [open, setOpen] = useState(routeMode);
  const [privateCache] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false },
        },
      }),
  );
  useEffect(
    () => () => {
      void privateCache.cancelQueries();
      privateCache.clear();
    },
    [privateCache],
  );
  const isCurrent = () =>
    epoch.current === 0 &&
    global.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id === owner;
  if (initial.current !== owner || version !== 0 || !isCurrent())
    return <p role="alert">Сессия изменилась. Откройте «Моменты» заново.</p>;
  if (!open)
    return (
      <div className="hidden-authors-entry">
        <button type="button" onClick={() => setOpen(true)}>
          Скрытые авторы (макет)
        </button>
      </div>
    );
  return (
    <QueryClientProvider client={privateCache}>
      <HiddenAuthorsPanel
        owner={owner}
        wire={wire}
        isCurrent={isCurrent}
        onRestored={() => global.invalidateQueries({ queryKey: ["moments"] })}
        onClose={() => {
          void privateCache.cancelQueries();
          privateCache.clear();
          if(routeMode)navigate("/moments");
          else setOpen(false);
        }}
      />
    </QueryClientProvider>
  );
}
export function HiddenAuthorsOptIn({
  enabled,
  ownerId,
  transport,
  routeMode=false,
}: {
  enabled: boolean;
  ownerId: string;
  transport?: HiddenAuthorsReadTransport;
  routeMode?: boolean;
}) {
  if (!enabled || !/^[A-Za-z0-9_-]{1,128}$/.test(ownerId) ||
      (transport !== undefined &&
        transport.fixtureKind !== "AG2_HIDDEN_AUTHORS_OWNER_SYNTHETIC_GET_ONLY" &&
        transport.fixtureKind !== "AG2_HIDDEN_AUTHORS_HONO_GET_ONLY"))
    return null;
  return <BoundHiddenAuthors key={ownerId+":"+String(routeMode)}
    owner={ownerId} wire={transport??hiddenAuthorsHonoRead} routeMode={routeMode} />;
}
