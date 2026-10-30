import { PrimaryButtonLink } from "../../shared/ui";
import { TrainingStepUnlock } from "./TrainingStepUnlock";
import styles from "./TrainingStepAccessCard.module.css";

/** A compact, step-scoped gate modeled on Mobile's AccordionStep accessGate.
 * Subscription checkout and Gafus ledger remain independent server-authorized flows.
 * No offer/price is fabricated, and no spending is triggered by opening a step.
 */
export function TrainingStepAccessCard({ userId, dayOnCourseId, stepOnDayId, onVerify }: {
  userId: string;
  dayOnCourseId: string;
  stepOnDayId: string;
  onVerify: () => Promise<boolean>;
}) {
  return <section className={styles.gate} aria-label="Способы открыть шаг"
    data-training-step-access-gate>
    <header className={styles.header}>
      <span className={styles.lockBadge} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="23" height="23" fill="none">
          <rect x="5" y="10" width="14" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" />
        </svg>
      </span>
      <div className={styles.heading}>
        <span className={styles.eyebrow}>ДОСТУП К ШАГУ</span>
        <h3>Этот шаг пока закрыт</h3>
        <p>Выберите, как удобнее продолжить обучение.</p>
      </div>
    </header>
    <div className={styles.options}>
      <section className={styles.option} aria-label="Открыть по подписке">
        <div className={styles.optionHeading}>
          <span className={styles.optionIcon} aria-hidden="true">✦</span>
          <div>
            <span className={styles.optionKicker}>GAFUS PREMIUM</span>
            <h4>Все шаги курса</h4>
          </div>
        </div>
        <p className={styles.optionDescription}>
          Занимайтесь без отдельных покупок каждого шага.
        </p>
        <PrimaryButtonLink href="/subscription" className={styles.premiumAction}>
          Выбрать подписку
          <span aria-hidden="true">→</span>
        </PrimaryButtonLink>
      </section>
      <section className={styles.option} aria-label="Открыть за гафусы">
        <div className={styles.optionHeading}>
          <span className={styles.optionIcon} aria-hidden="true">◈</span>
          <div>
            <span className={styles.optionKicker}>БЕЗ ПОДПИСКИ</span>
            <h4>Один шаг за Гафусы</h4>
          </div>
        </div>
        <p className={styles.optionDescription}>
          Откройте только этот шаг. Баланс и стоимость загрузятся автоматически.
        </p>
        <TrainingStepUnlock compact userId={userId} dayOnCourseId={dayOnCourseId}
          stepOnDayId={stepOnDayId} onVerify={onVerify} />
      </section>
    </div>
    <p className={styles.footer}>При действующей подписке тратить Гафусы не нужно.</p>
  </section>;
}
