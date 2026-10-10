import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { notFound } from "next/navigation";
import { getGafusAdminDashboard, listGafusFraudSignalsAdmin } from "@gafus/core/services/adminGafus";
import { getLegacyGafusImportPreflight } from "@gafus/core/services/gafus";
import { adjustGafusWallet, saveGafusSettings, reviewGafusFraudSignal, importLegacyGafusCredits } from "./actions";
import styles from "./gafus.module.css";

export const dynamic = "force-dynamic";
type Params = Promise<{ updated?: string; adjusted?: string; reviewed?: string; imported?: string; importedCredits?: string; nextCursor?: string; error?: string }>;

const FIELDS = [
  ["postReward", "Награда за пост"],
  ["questionReward", "Награда за вопрос"],
  ["answerReward", "Награда за ответ"],
  ["activityLimit", "Лимит за окно"],
  ["activityWindowSeconds", "Окно активности (сек.)"],
  ["reactionThreshold", "Реакций на порог"],
  ["reactionReward", "Награда за реакции"],
  ["bestAnswerReward", "Награда за лучший ответ"],
  ["courseStepCost", "Стоимость шага"],
  ["miniGuideCost", "Стоимость мини-гайда"],
  ["accessDurationSeconds", "Срок доступа (сек.)"],
] as const;

export default async function AdminGafusPage({ searchParams }: { searchParams: Params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") notFound();
  const [dashboard, signals, preflight, query] = await Promise.all([
    getGafusAdminDashboard(session.user.id),
    listGafusFraudSignalsAdmin({ actorId: session.user.id, status: "OPEN" }),
    getLegacyGafusImportPreflight(session.user.id),
    searchParams,
  ]);
  const { settings } = dashboard;
  const canImportLegacy = preflight.cutoverDisabled && preflight.importEnabled && preflight.pendingRefundCredits === 0 && preflight.unsettledSessions === 0;
  const totalEarned = dashboard.transactions.filter(row => row.kind === "EARN")
    .reduce((sum, row) => sum + Math.max(0, row._sum.delta ?? 0), 0);
  const totalSpent = dashboard.transactions.filter(row => row.kind === "SPEND")
    .reduce((sum, row) => sum + Math.abs(row._sum.delta ?? 0), 0);
  return <main className={styles.page}>
    <header className={styles.heading}>
      <h1>Гафусы — управление экономикой</h1>
      <p>Безопасное включение, лимиты, начисления и корректировка кошельков. Ревизия {settings.revision}.</p>
    </header>
    {query.error && <p role="alert" className={styles.error}>Не удалось сохранить: {query.error}</p>}
    {(query.updated || query.adjusted || query.reviewed) && <p role="status" className={styles.success}>Изменения сохранены.</p>}
    <section className={styles.metrics} aria-label="Сводка экономики">
      <article><span>Кошельков</span><strong>{dashboard.wallets.count}</strong></article>
      <article><span>Гафусов в обращении</span><strong>{dashboard.wallets.outstanding}</strong></article>
      <article><span>Начислено</span><strong>{totalEarned}</strong></article>
      <article><span>Потрачено</span><strong>{totalSpent}</strong></article>
      <article><span>Антифрод: открытые сигналы</span><strong>{dashboard.fraudOpen}</strong></article>
    </section>
    <div className={styles.columns}>
      <section className={styles.card}>
        <h2>Настройки</h2>
        <form action={saveGafusSettings}>
          <input name="revision" type="hidden" value={settings.revision} />
          <div className={styles.toggles}>
            <label><input name="economyEnabled" type="checkbox" defaultChecked={settings.economyEnabled} />Экономика включена</label>
            <label><input name="earningEnabled" type="checkbox" defaultChecked={settings.earningEnabled} />Начисления включены</label>
            <label><input name="spendingEnabled" type="checkbox" defaultChecked={settings.spendingEnabled} />Списания включены</label>
          </div>
          <div className={styles.fields}>
            {FIELDS.map(([key, label]) => <label key={key}>
              <span>{label}</span>
              <input type="number" name={key} defaultValue={settings[key]} min={key.includes("Cost") || key === "reactionThreshold" || key.endsWith("Seconds") ? 1 : 0} step={1} required />
            </label>)}
          </div>
          <label className={styles.reason}>Причина изменения
            <textarea name="reason" required minLength={5} placeholder="Укажите причину для журнала аудита" rows={2} />
          </label>
          <button type="submit" className={styles.button}>Сохранить настройки</button>
        </form>
      </section>
      <section className={styles.card}>
        <h2>Корректировка кошелька</h2>
        <p>Используйте только для проверенных начислений и возвратов. Каждая операция попадёт в журнал аудита.</p>
        <form action={adjustGafusWallet} className={styles.adjustForm}>
          <label>ID пользователя<input name="userId" required placeholder="ID пользователя" /></label>
          <label>Изменение баланса<input name="delta" type="number" required step={1} min={-10000} max={10000} placeholder="+10 или -5" /></label>
          <label>Причина<textarea name="reason" minLength={5} rows={3} required placeholder="Причина ручной корректировки" /></label>
          <input type="hidden" name="requestId" value={randomUUID()} />
          <button type="submit" className={styles.button}>Применить корректировку</button>
        </form>
        <div className={styles.hint}>Рекомендуется сначала настроить экономику, затем отдельно включить начисления и списания. Без применения миграции БД страница недоступна.</div>
      </section>
    </div>
    <section className={styles.card} style={{ marginTop: 18 }} aria-label="Сигналы антифрода">
      <h2>Антифрод: сигналы для проверки</h2>
      {signals.length === 0 ? <p>Открытых сигналов нет.</p> : signals.map(signal => <article key={signal.id} className={styles.fraudItem}>
        <div><strong>{signal.kind}</strong> · {signal.severity} · {signal.createdAt.toLocaleString("ru-RU")}</div>
        <p>Пользователь: {signal.userId} · Объект: {signal.entityType ?? "—"} / {signal.entityId ?? "—"}</p>
        <form action={reviewGafusFraudSignal} className={styles.fraudForm}>
          <input type="hidden" name="signalId" value={signal.id} />
          <label>Списать при подтверждении (не более баланса)<input name="requestedReversal" type="number" min={0} max={10000} step={1} defaultValue={1} required /></label>
          <label>Причина<textarea name="reason" minLength={5} maxLength={1000} required rows={2} placeholder="Результат проверки" /></label>
          <div className={styles.fraudActions}>
            <button className={styles.button} name="decision" value="DISMISS" type="submit">Отклонить сигнал</button>
            <button className={styles.button} name="decision" value="CONFIRM" type="submit">Подтвердить нарушение</button>
          </div>
        </form>
      </article>)}
    </section>
    <section className={styles.card} style={{ marginTop: 18 }} aria-label="Перенос старых rewarded-кредитов">
      <h2>Переход со старых rewarded-кредитов</h2>
      <p>Режим только для этапа миграции. Старые кредитные записи сохраняются для аудита; после переноса повторно включать старые траты нельзя.</p>
      <p>Неперенесённые кошельки/кредиты до учёта импортов: {preflight.activeWallets} / {preflight.credits}. Записей импорта: {preflight.imported}.</p>
      <p>Ожидают возврата: {preflight.pendingRefundWallets} кошельков ({preflight.pendingRefundCredits} кредитов). Незавершённых рекламных сессий: {preflight.unsettledSessions}.</p>
      <p>Старые рекламные операции: <strong>{preflight.cutoverDisabled ? "выключены" : "не выключены"}</strong>. Разрешение импорта: <strong>{preflight.importEnabled ? "включено" : "выключено"}</strong>.</p>
      {query.imported !== undefined && <p role="status" className={styles.success}>
        Последняя партия: {query.imported} кошельков, {query.importedCredits ?? "0"} Гафусов.
        {query.nextCursor ? " Можно перейти к следующей партии." : " Это была последняя партия выборки."}
      </p>}
      <form action={importLegacyGafusCredits} className={styles.adjustForm}>
        <input type="hidden" name="cursor" value={query.nextCursor ?? ""} />
        <label>
          <input name="confirmation" type="checkbox" value="IMPORT_LEGACY_GAFUS"
            required disabled={!canImportLegacy} />
          Подтверждаю ручной перенос максимум 50 кошельков. Старая система уже выключена.
        </label>
        <button className={styles.button} type="submit" disabled={!canImportLegacy}>
          {query.nextCursor ? "Перенести следующую партию" : "Перенести первую партию"}
        </button>
      </form>
      {!canImportLegacy && <p className={styles.hint}>
        Операция заблокирована. Для неё требуется GAFUS_LEGACY_REWARDED_DISABLED=true,
        GAFUS_LEGACY_IMPORT_ENABLED=true, ноль ожидающих возврата кредитов и отсутствие незавершённых сессий.
      </p>}
    </section>
  </main>;
}