import { Loading } from "../../shared/ui";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { RouteLink } from "../../shared/router/location";
import { cancelCheckoutRenewal } from "../commerce/checkoutApi";
import { apiRequest } from "../../shared/api/client";
import type { AppSubscriptionStatusDto } from "@gafus/types";
import { NextProfileIcon } from "./NextProfileIcon";
import source from "../../brand/LegacyPrivateProfileSection.module.css";
import "./web1-premium-parity.css";

function displayMoscow(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
  }).format(date)} МСК`;
}

/** Owner-only Next Premium card: GET access projection, checkout navigation,
 * and explicit confirmed renewal cancellation through the existing Hono/Core API.
 * No guessed price or direct payment-provider calls. */
export function LegacyPremiumConnectedCard({ ownerId, isCurrent }: {
  ownerId: string;
  isCurrent(): boolean;
}) {
  const [detachConfirmed, setDetachConfirmed] = useState(false);
  const [detaching, setDetaching] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const query = useQuery({
    queryKey: ["profile", "subscription", ownerId, "status"],
    queryFn: async () => {
      const snapshot = await apiRequest<unknown>("/api/v1/app-subscription/status", {
        method: "GET", browserAuth: true, expectedStatus: 200,
      });
      if (!isCurrent()) throw Error("SUBSCRIPTION_OWNER_CHANGED");
      if (!snapshot || typeof snapshot !== "object" ||
        typeof (snapshot as {hasActiveSubscription?:unknown}).hasActiveSubscription !== "boolean")
        throw Error("SUBSCRIPTION_STATUS_INVALID");
      return snapshot as AppSubscriptionStatusDto;
    },
    enabled: isCurrent(), retry: false, gcTime: 0, staleTime: 0,
  });
  if (!isCurrent()) return null;
  const state = query.isSuccess && !query.isFetching ? query.data : null;
  const pending = !state && !query.isError;
  const canDetach = state?.hasActiveSubscription === true &&
    state.provider === "YOOKASSA" && state.hasSavedPaymentMethod &&
    !state.cancelAtPeriodEnd;
  const detach = async () => {
    if (!canDetach || !detachConfirmed || !isCurrent() || inFlight.current) return;
    inFlight.current = true; setDetaching(true); setMutationError(null);
    try {
      await cancelCheckoutRenewal();
      if (isCurrent()) { setDetachConfirmed(false); await query.refetch(); }
    } catch (e) {
      if (isCurrent()) setMutationError(e instanceof Error ? e.message : "Не удалось отключить автопродление");
    } finally { inFlight.current = false; if (isCurrent()) setDetaching(false); }
  };
  const inactive = state?.hasActiveSubscription === false;
  const partner = state?.hasActiveSubscription && state.provider === "MANUAL" &&
    state.isLifetime && state.paymentMethodTitle === "Партнёрская программа";
  const nextCharge = state?.hasActiveSubscription && !state.isLifetime &&
    state.provider === "YOOKASSA" && state.hasSavedPaymentMethod &&
    !state.cancelAtPeriodEnd ? state.nextChargeAt : null;
  return <section className={source.section} aria-label="Подписка GAFUS">
    <section className={source.subscriptionCard} aria-label="Статус подписки" data-next-premium>
      <div className={source.subscriptionHeader}>
        <NextProfileIcon name="premium" />
        <h2 className={source.subscriptionTitle}>Подписка Gafus Premium</h2>
        {state && <span className={state.hasActiveSubscription ?
          source.statusActive : source.statusInactive}>
          {state.hasActiveSubscription ? "Активна" : "Неактивна"}
        </span>}
      </div>
      {pending && <Loading message="Загрузка подписки…" />}
      {query.isError && <div role="alert">
        <p>Не удалось загрузить данные подписки.</p>
        <button type="button" className={source.refreshButton}
          onClick={() => void query.refetch()}>Повторить</button>
      </div>}
      {inactive && <>
        <p className={source.subscriptionText}>
          Откройте больше возможностей для вас и вашего питомца.
        </p>
        <ul className={source.benefits}>
          <li>Все курсы и тренировки</li>
          <li>Консультации с кинологом</li>
          <li>Документы питомца</li>
          <li>Эксклюзивные материалы</li>
        </ul>
        <img src="/images/profile-premium-mascot.webp" alt="" width={280} height={180}
          className={source.subscriptionArt}/>
        <RouteLink to="/subscription" className={source.bindButton}>Оформить подписку</RouteLink>
      </>}
      {partner && <p className={source.subscriptionText}>
        Бесплатный бессрочный доступ участника партнёрской программы.
      </p>}
      {state?.hasActiveSubscription && !partner && <dl className={source.metaGrid}>
        <div><dt>{state.isTrial ? "Пробный период до" : "Оплачено"}</dt>
          <dd>{displayMoscow(state.isTrial ? state.trialEndsAt : state.paidAt)}</dd></div>
        <div><dt>Следующее списание</dt>
          <dd>{nextCharge ? displayMoscow(nextCharge) : state.provider === "APPLE" ?
            "Управляется в App Store" : state.cancelAtPeriodEnd ? "Отключено" : "—"}</dd></div>
        <div><dt>Способ оплаты</dt><dd>{state.paymentMethodLast4 ?
          `•••• ${state.paymentMethodLast4}` : state.paymentMethodTitle ?? "—"}</dd></div>
        <div><dt>Доступ до</dt>
          <dd>{state.isLifetime ? "Бессрочно" : displayMoscow(state.activeUntil)}</dd></div>
      </dl>}
      {state?.hasActiveSubscription && state.provider === "YOOKASSA" &&
        !state.hasSavedPaymentMethod && <p className={source.subscriptionText}>
          Способ оплаты не сохранён. Автопродление неактивно.
        </p>}
      {canDetach && <div className={source.detachBlock}>
        <label className={source.checkboxRow}>
          <input type="checkbox" checked={detachConfirmed} disabled={detaching}
            onChange={event => setDetachConfirmed(event.target.checked)}/>
          Подтверждаю отвязку способа оплаты и отключение автоплатежей.
        </label>
        <button type="button" className={source.detachButton} disabled={!detachConfirmed || detaching}
          onClick={() => void detach()}>{detaching ? "Отключаем…" : "Удалить способ оплаты"}</button>
      </div>}
      {mutationError && <p role="alert" className={source.errorText}>{mutationError}</p>}
      {state && <button type="button" className={source.refreshButton} disabled={detaching}
        onClick={() => void query.refetch()}>Обновить статус</button>}
    </section>
  </section>;
}
