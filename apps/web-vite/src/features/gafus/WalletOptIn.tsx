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
import {navigate} from "../../shared/router/location";
import type { AuthUser } from "../../shared/auth/authApi";
import {
  projectWalletStatus,
  projectWalletHistory,
  type WalletSourceMock,
  type WalletTransaction,
} from "./walletReadApi";

const titles: Record<string, string> = {
  POST_PUBLISHED: "Публикация",
  QUESTION_CREATED: "Новый вопрос",
  ANSWER_CREATED: "Ответ в сообществе",
  POST_REACTION_MILESTONE: "Реакции на публикацию",
  BEST_ANSWER: "Лучший ответ",
  SPEND: "Открытие обучения",
  ADMIN_CREDIT: "Начисление администратором",
  ADMIN_DEBIT: "Корректировка администратором",
  LEGACY_IMPORT: "Перенос гафусов",
  EARN: "Начисление",
};
const label = (item: WalletTransaction) => titles[item.rewardKind ?? item.kind] ?? "Операция";
function WalletPanel({
  owner,
  wire,
  isCurrent,
  onClose,
}: {
  owner: string;
  wire: WalletSourceMock;
  isCurrent: () => boolean;
  onClose: () => void;
}) {
  const status = useQuery({
    queryKey: ["wallet", "owner", owner, "status"],
    queryFn: async () => {
      const dto = projectWalletStatus(await wire.status());
      if (!isCurrent()) throw Error("WALLET_STALE_SESSION");
      return dto;
    },
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  // The private balance must be current before history access is enabled.
  const statusReady = status.isSuccess && !status.isFetching;
  const history = useInfiniteQuery({
    queryKey: ["wallet", "owner", owner, "history"],
    queryFn: async ({ pageParam }) => {
      const data = projectWalletHistory(await wire.history(pageParam));
      if (!isCurrent()) throw Error("WALLET_STALE_SESSION");
      if (pageParam !== null && data.nextCursor === pageParam)
        throw Error("WALLET_HISTORY_REPEAT_CURSOR");
      return data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: statusReady,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  // A failed next cursor must not hide previously verified transactions.
  const historyReady =
    statusReady &&
    (!history.isFetching || history.isFetchingNextPage) &&
    (history.isSuccess || history.isFetchNextPageError);
  const seen = new Set<string>();
  const events = (historyReady ? history.data!.pages.flatMap((p) => p.items) : []).filter(
    (item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    },
  );
  if (!isCurrent()) return <p role="alert">Сессия изменилась. Откройте свой профиль заново.</p>;
  return (
    <section className="wallet-panel" aria-label="Мои гафусы (макет)">
      <header>
        <h3>Мои гафусы</h3>
        <BackButton type="button" onClick={onClose}>Мой профиль</BackButton>
      </header>
      <p className="note">Изолированный просмотр данных. Начисления и списания здесь недоступны.</p>
      {status.isPending && <Loading message="Загружаем баланс гафусов…" />}
      {status.isFetching && status.data && <Loading variant="compact" message="Перепроверяем баланс гафусов…" />}
      {status.isError && (
        <div role="alert">
          <p>Не удалось получить баланс.</p>
          <PrimaryButton type="button" onClick={() => void status.refetch()}>
            Повторить баланс
          </PrimaryButton>
        </div>
      )}
      {statusReady && (
        <>
          <div className="wallet-metrics">
            <div>
              <span>Баланс</span>
              <strong>{status.data.wallet.balance} 🐾</strong>
            </div>
            <div>
              <span>Осталось за активность</span>
              <strong>
                {status.data.activity.remaining} из {status.data.activity.limit}
              </strong>
            </div>
            <div>
              <span>Срок открытия обучения</span>
              <strong>{Math.round(status.data.rules.accessDurationSeconds / 86400)} дней</strong>
            </div>
          </div>
          {!status.data.enabled.economy && (
            <p role="status">Новая система мотивации пока не включена.</p>
          )}
          <section aria-label="История гафусов">
            <h4>История операций</h4>
            {history.isPending && <Loading message="Загружаем историю…" />}
            {history.isError && !history.isFetchNextPageError && (
              <div role="alert">
                <p>Не удалось загрузить историю операций.</p>
                <PrimaryButton type="button" onClick={() => void history.refetch()}>
                  Повторить историю
                </PrimaryButton>
              </div>
            )}
            {historyReady && events.length === 0 && (
              <p role="status">Пока нет операций. Первый гафус ещё впереди!</p>
            )}
            {historyReady && events.length > 0 && (
              <ul className="wallet-history">
                {events.map((e) => (
                  <li key={e.id}>
                    <div>
                      <strong>{label(e)}</strong>
                      <time dateTime={e.createdAt}>
                        {new Date(e.createdAt).toLocaleDateString("ru-RU")}
                      </time>
                    </div>
                    <span aria-label={e.delta >= 0 ? "Начисление" : "Списание"}>
                      {e.delta > 0 ? "+" : ""}
                      {e.delta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {historyReady && history.hasNextPage && !history.isFetchNextPageError && (
              <button
                type="button"
                disabled={history.isFetchingNextPage}
                onClick={() => void history.fetchNextPage()}
              >
                {history.isFetchingNextPage ? "Загружаем…" : "Показать ещё операции"}
              </button>
            )}
            {historyReady && history.isFetchNextPageError && (
              <div role="alert">
                <p>Не удалось загрузить следующую страницу.</p>
                <PrimaryButton type="button" onClick={() => void history.fetchNextPage()}>
                  Повторить страницу операций
                </PrimaryButton>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
function BoundWallet({owner,wire,routeMode}:{owner:string;
  wire:WalletSourceMock;routeMode:boolean}){
  const global = useQueryClient();
  const initial = useRef(global.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id ?? null);
  const epoch = useRef(0);
  const last = useRef(initial.current);
  const version = useSyncExternalStore(
    (cb) =>
      global.getQueryCache().subscribe((event) => {
        if (
          event.query.queryKey.length === CURRENT_USER_QUERY_KEY.length &&
          event.query.queryKey.every((key: unknown, i: number) => key === CURRENT_USER_QUERY_KEY[i])
        ) {
          const next = global.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id ?? null;
          if (
            next !== last.current &&
            (next !== null || event.type === "removed" || event.query.state.data === null)
          ) {
            last.current = next;
            epoch.current++;
            cb();
          }
        }
      }),
    () => epoch.current,
    () => epoch.current,
  );
  const [opened, setOpened] = useState(routeMode);
  const mounted=useRef(true);
  const [privateCache] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false },
        },
      }),
  );
  useEffect(() => {
    mounted.current=true;
    return () => {
      mounted.current=false;
      void privateCache.cancelQueries();
      privateCache.clear();
    };
  },[privateCache]);
  const current = () =>
    mounted.current && epoch.current === 0 &&
    global.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id === owner;
  if (initial.current !== owner || version !== 0 || !current())
    return <p role="alert">Сессия изменилась. Откройте профиль заново.</p>;
  if (!opened)
    return (
      <div className="wallet-entry">
        <button type="button" onClick={() => setOpened(true)}>
          Мои гафусы и история (макет)
        </button>
      </div>
    );
  return (
    <QueryClientProvider client={privateCache}>
      <WalletPanel
        owner={owner}
        wire={wire}
        isCurrent={current}
        onClose={() => {
          void privateCache.cancelQueries();
          privateCache.clear();
          if(routeMode)navigate("/profile");
          else setOpened(false);
        }}
      />
    </QueryClientProvider>
  );
}
/** Temporary owner-only synthetic preview; not a published /gafus route. */
export function WalletOptIn({
  enabled,
  ownerId,
  transport,
  routeMode=false,
}: {
  enabled: boolean;
  ownerId: string;
  transport?: WalletSourceMock;
  routeMode?:boolean;
}) {
  if (
    !enabled ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(ownerId) ||
    transport?.fixtureKind !== "AG2_WALLET_SYNTHETIC_SELF_GET_ONLY"
  )
    return null;
  return <BoundWallet key={ownerId+":"+String(routeMode)} owner={ownerId}
    wire={transport} routeMode={routeMode}/>;
}
