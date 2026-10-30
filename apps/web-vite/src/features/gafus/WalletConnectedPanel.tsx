import { Loading } from "../../shared/ui";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getWalletStatus, getWalletHistory, type WalletTransaction } from "./walletReadApi";
import { RouteLink } from "../../shared/router/location";
import { ApiError } from "../../shared/api/client";
import css from "../../brand/LegacyGafusWallet.module.css";

import "./web1-wallet-rules.css";

const titles: Record<string, string> = {
  POST_PUBLISHED: "Публикация", QUESTION_CREATED: "Новый вопрос",
  ANSWER_CREATED: "Ответ в сообществе", POST_REACTION_MILESTONE: "Реакции на публикацию",
  BEST_ANSWER: "Лучший ответ", SPEND: "Открытие обучения",
  ADMIN_CREDIT: "Начисление администратором", ADMIN_DEBIT: "Корректировка администратором",
  LEGACY_IMPORT: "Перенос Гафусов",
};
// Exact retained Next transactionTitle(): unknown/null reward kinds of EARN
// fall back to "Операция", not a newly invented generic "Начисление" label.
const title = (item: WalletTransaction) => item.rewardKind
  ? titles[item.rewardKind] ?? "Начисление"
  : titles[item.kind] ?? "Операция";
function WalletSourceLoading() {
  return <Loading message="Загружаем Гафусы" variant="card" />;
}

/** Source Next wallet layout with actual authenticated Hono self-only GETs.
 * No spending, reward issuance or balance stored in localStorage.
 */
export function WalletConnectedPanel({ ownerId, isCurrent }: {
  ownerId: string; isCurrent(): boolean;
}) {
  const status = useQuery({
    queryKey: ["wallet", "owner", ownerId, "status", "connected"],
    queryFn: async () => {
      const data = await getWalletStatus();
      if (!isCurrent()) throw Error("WALLET_OWNER_SESSION_CHANGED");
      return data;
    }, enabled: isCurrent(), retry: false, staleTime: 0, gcTime: 0,
  });
  const statusReady = isCurrent() && status.isSuccess && !status.isFetching;
  const history = useInfiniteQuery({
    queryKey: ["wallet", "owner", ownerId, "history", "connected"],
    queryFn: async ({ pageParam }) => {
      const data = await getWalletHistory(pageParam);
      if (!isCurrent()) throw Error("WALLET_OWNER_SESSION_CHANGED");
      return data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: statusReady, retry: false, staleTime: 0, gcTime: 0,
  });
  if (!isCurrent()) return null;
  if ((!statusReady && !status.isError) || (statusReady && history.isPending))
    return <WalletSourceLoading />;
  // Source Next retains balance and committed operations if *only* fetching
  // a later page fails; denied/revoked sessions must still hide private rows.
  const pageFailure = history.isFetchNextPageError && !!history.data;
  const privateError = history.error instanceof ApiError &&
    [401,403,404].includes(history.error.status);
  if (status.isError || (history.isError && (!pageFailure || privateError)))
    return <section className={css.page} aria-label="Мои Гафусы" role="alert">
    <p>{status.isError ? "Не удалось загрузить баланс Гафусов." :
      "Не удалось загрузить историю операций."}</p>
    <button type="button" className={css.action}
      onClick={() => void (status.isError ? status.refetch() : history.refetch())}>
      Повторить
    </button>
  </section>;
  const data = status.data;
  const ready = (history.isSuccess || pageFailure) &&
    (!history.isFetching || history.isFetchingNextPage);
  const items = ready && history.data ? history.data.pages.flatMap(page => page.items) : [];
  const seen = new Set<string>();
  return <>
    <section className={`${css.page} next-gafus-wallet`}
      aria-label="Мои Гафусы" data-next-wallet>
    <header className={css.header}>
      <div><span className={css.eyebrow}>МОЯ МОТИВАЦИЯ</span><h2>Мои Гафусы</h2></div>
      <div className={css.balance} aria-label={`Баланс: ${data.wallet.balance} Гафусов`}>
        <span aria-hidden="true">🐾</span><strong>{data.wallet.balance}</strong>
      </div>
    </header>
    <section className={css.summary}>
      <div><h2>Зарабатывайте за активность</h2>
        <p>Публикуйте посты, задавайте вопросы и помогайте другим. За активность
          можно получить до {data.activity.limit} Гафусов за 24 часа.</p>
        <p className={css.quota}>Осталось получить: <strong>{data.activity.remaining}</strong></p>
      </div>
      <div><h2>Открывайте обучение</h2>
        <p>Один шаг курса или мини-гайд можно открыть на
          {" "}{Math.round(data.rules.accessDurationSeconds / 86400)} дней за
          {" "}{data.rules.courseStepCost} Гафус.</p>
      </div>
    </section>
    {!data.enabled.economy && <p className={css.notice}>
      Новая система мотивации пока не включена.
    </p>}
    {pageFailure && <p className={css.notice} role="alert">
      Не удалось загрузить следующую страницу истории. Уже полученные операции сохранены.
    </p>}
    <section className={css.history} aria-label="История Гафусов">
      <h2>История операций</h2>
      {(history.isPending || (history.isFetching && !history.isFetchingNextPage)) &&
        <Loading message="Загружаем историю…" />}
      {ready && items.length === 0 && <p className={css.empty}>
        Пока нет операций. Первый Гафус ещё впереди!
      </p>}
      {ready && items.length > 0 && <ul>{items.filter(item => {
        if (seen.has(item.id)) return false;
        seen.add(item.id); return true;
      }).map(item => <li key={item.id}>
        <div><strong>{title(item)}</strong>
          <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("ru-RU", {
            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
          })}</time></div>
        <span className={item.delta >= 0 ? css.earned : css.spent}>
          {item.delta > 0 ? "+" : ""}{item.delta}
        </span>
      </li>)}</ul>}
      {ready && history.hasNextPage && <button type="button" className={css.action}
        disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
        {history.isFetchingNextPage ? "Загружаем…" : "Показать ещё"}
      </button>}
    </section>
  </section>
  {/* Extra approved earning rules are outside the source wallet card,
      avoiding an overlay control which original Next does not have. */}
  <details className="web1-wallet-reward-rules">
    <summary aria-label="Как начисляются Гафусы">Как начисляются Гафусы</summary>
    <p>Дополнительно, без лимита активности: +1 Гафус за каждые 10 реакций
      разных пользователей на вашу публикацию и +1 за первый выбор вашего ответа лучшим.</p>
    <RouteLink to="/courses">Перейти к курсам</RouteLink>
  </details>
  </>;
}
