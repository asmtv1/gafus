import { useState } from "react";
import styles from "./ArticleEmbeddedPaywall.module.css";
import {PrimaryButton} from "../../shared/ui";
import { RouteLink } from "../../shared/router/location";

/** Embedded preview of Next paywall: never invents offers or posts payments.
 * The user can open the authorized /subscription checkout to pay securely. */
export type VerifiedSubscriptionPlan = {
  code: "TWO_WEEKS" | "MONTHLY" | "THREE_MONTHS";
  title: string;
  intervalDays: number;
  yookassaPriceRub: number;
  currency: "RUB";
  enabled: boolean;
  offlineCourseDownloadIncluded: boolean;
  cynologistChatIncluded: boolean;
  consultationBookingIncluded: boolean;
  badge: "TRY" | "POPULAR" | "MAX_SAVINGS" | null;
};

function verifiedPlan(plan: VerifiedSubscriptionPlan): boolean {
  return !!plan && typeof plan === "object" &&
    ["TWO_WEEKS", "MONTHLY", "THREE_MONTHS"].includes(plan.code) &&
    plan.currency === "RUB" && plan.enabled === true &&
    typeof plan.title === "string" && plan.title.trim().length > 0 &&
    plan.title.length <= 80 &&
    Number.isSafeInteger(plan.intervalDays) && plan.intervalDays > 0 &&
    Number.isSafeInteger(plan.yookassaPriceRub) && plan.yookassaPriceRub > 0 &&
    plan.yookassaPriceRub <= 1_000_000 &&
    typeof plan.offlineCourseDownloadIncluded === "boolean" &&
    typeof plan.cynologistChatIncluded === "boolean" &&
    typeof plan.consultationBookingIncluded === "boolean" &&
    ["TRY", "POPULAR", "MAX_SAVINGS", null].includes(plan.badge);
}
const price = (n: number) => new Intl.NumberFormat("ru-RU", {
  style: "currency", currency: "RUB", maximumFractionDigits: 0,
}).format(n);

export function ArticleEmbeddedPaywall({
  onRecheck, plans = [],
}: {
  onRecheck?: () => void;
  /** Only server-verified immutable offer read; no live loader has been approved. */
  plans?: readonly VerifiedSubscriptionPlan[];
}) {
  const [chosen, setChosen] = useState<VerifiedSubscriptionPlan["code"] | null>(null);
  // Fail closed: a partial or malformed offer must never be rendered as a
  // real price/plan. No invented fallback prices from the old Next component.
  const offerValid = plans.every(verifiedPlan) &&
    new Set(plans.map(p => p.code)).size === plans.length;
  const available = offerValid ? plans.filter(p => p.enabled) : [];
  // The original Next chooser selects MONTHLY from a verified offer by
  // default, falling back to the first enabled plan. This does not make a
  // tariff available while no approved read-only API offer exists.
  const current = available.find(p => p.code === chosen) ??
    available.find(p => p.code === "MONTHLY") ?? available[0] ?? null;

  return <section className={styles.embedded} aria-label="Подписка Gafus Premium">
    <div className={styles.card}>
      <div className={styles.hero}>
        <div>
          <p className={styles.kicker}>Gafus Premium</p>
          <h2 className={styles.title}>Подписка, которая экономит время и деньги</h2>
          <p className={styles.subtitle}>
            Откройте весь практический контент и поддержку специалистов в одном тарифе.
          </p>
        </div>
        <div className={styles.priceCard}>
          <p className={styles.priceLabel}>Выбранный тариф</p>
          <p className={styles.price}>{current ? price(current.yookassaPriceRub) : "Не выбран"}</p>
          <p className={styles.priceNote}>{current
            ? `${current.title} · ${current.intervalDays} дней`
            : "Тариф не подтверждён"}</p>
        </div>
      </div>
      <div className={styles.planSection}>
        <div className={styles.planSectionHeader}>
          <p className={styles.planKicker}>Период оплаты</p>
          <h3>Выберите тариф</h3>
          <p className={styles.planNote}>
            Скачивание курсов в мобильном приложении и запись к кинологу
            включены в тарифы от месяца.
          </p>
        </div>
        {available.length ? <div className={styles.planGrid} role="radiogroup" aria-label="Тарифы подписки">
          {available.map(plan => <button type="button" role="radio" key={plan.code}
            className={styles.planButton} aria-checked={plan.code === current?.code}
            onClick={() => setChosen(plan.code)}>
            <span className={styles.planRadio} aria-hidden="true">{plan.code === current?.code ? "●" : "○"}</span>
            {plan.badge && <span className={styles.planBadge}>{plan.badge === "POPULAR"
              ? "Популярный" : plan.badge === "MAX_SAVINGS" ? "Выгодно" : "Пробный"}</span>}
            <strong>{plan.title}</strong>
            <span className={styles.planPrice}>{price(plan.yookassaPriceRub)}</span>
            <span className={styles.planPeriod}>{plan.intervalDays} дней</span>
            <span>✓ Курсы, экзамены и статьи</span>
            <span>✓ Документы и напоминания</span>
            <span>
              {plan.offlineCourseDownloadIncluded ? "✓" : "—"}{" "}
              Скачивание курсов в мобильном приложении
            </span>
            <span>{plan.cynologistChatIncluded ? "✓" : "—"} Чат с кинологом</span>
            <span>{plan.consultationBookingIncluded ? "✓" : "—"} Запись к кинологу</span>
          </button>)}
        </div> : <p role="status" className={styles.unavailable}>
          Для чтения статьи нужна действующая подписка.
          Выберите тариф на странице подписки. Доступные цены и условия там подтверждает сервер.
        </p>}
      </div>
      <p><RouteLink to="/subscription">Оформить подписку через ЮKassa</RouteLink></p>
      {onRecheck && <PrimaryButton onClick={onRecheck} style={{marginTop:22}}>
        Проверить доступ к статье
      </PrimaryButton>}
      <p className={styles.assurance}>
        Для оплаты откройте страницу подписки. Тарифы и стоимость подтверждает сервер.
      </p>
    </div>
  </section>;
}
