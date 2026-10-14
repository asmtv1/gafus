"use client";

import { useCallback, useEffect, useState } from "react";
import type { GafusHistoryEntry, GafusHistoryPage, GafusStatusDto } from "@gafus/types";
import { LoadingState } from "@/shared/components/ui/LoadingState";
import { gafusApi } from "./api";
import styles from "./GafusWalletPage.module.css";

const titles: Record<string, string> = {
  POST_PUBLISHED: "Публикация",
  QUESTION_CREATED: "Новый вопрос",
  ANSWER_CREATED: "Ответ в сообществе",
  POST_REACTION_MILESTONE: "Реакции на публикацию",
  BEST_ANSWER: "Лучший ответ",
  SPEND: "Открытие обучения",
  ADMIN_CREDIT: "Начисление администратором",
  ADMIN_DEBIT: "Корректировка администратором",
  LEGACY_IMPORT: "Перенос Гафусов",
};

function transactionTitle(item: GafusHistoryEntry) {
  return item.rewardKind ? titles[item.rewardKind] ?? "Начисление" : titles[item.kind] ?? "Операция";
}

export function GafusWalletPage({ embedded = false }: { embedded?: boolean } = {}) {
  const Container = embedded ? "section" : "main";
  const Heading = embedded ? "h2" : "h1";
  const [status, setStatus] = useState<GafusStatusDto | null>(null);
  const [history, setHistory] = useState<GafusHistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [nextStatus, nextHistory] = await Promise.all([gafusApi.status(), gafusApi.history()]);
      setStatus(nextStatus);
      setHistory(nextHistory);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить Гафусы");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const loadMore = useCallback(async () => {
    if (!history?.nextCursor || moreLoading) return;
    setMoreLoading(true);
    try {
      const page = await gafusApi.history(history.nextCursor);
      setHistory(prev => prev ? {
        items: [...prev.items, ...page.items],
        nextCursor: page.nextCursor,
      } : page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить историю");
    } finally {
      setMoreLoading(false);
    }
  }, [history, moreLoading]);

  if (loading) return <LoadingState message="Загружаем Гафусы" />;
  if (!status) return <Container className={styles.page} role="alert">
    {error ?? "Данные временно недоступны"}
    <button className={styles.action} onClick={() => void refresh()} type="button">Повторить</button>
  </Container>;

  return <Container className={styles.page}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>МОЯ МОТИВАЦИЯ</span><Heading>Мои Гафусы</Heading></div>
      <div className={styles.balance} aria-label={`Баланс: ${status.wallet.balance} Гафусов`}>
        <span aria-hidden="true">🐾</span><strong>{status.wallet.balance}</strong>
      </div>
    </header>
    <section className={styles.summary}>
      <div>
        <h2>Зарабатывайте за активность</h2>
        <p>Публикуйте посты, задавайте вопросы и помогайте другим. За активность можно получить до {status.activity.limit} Гафусов за 24 часа.</p>
        <p className={styles.quota}>Осталось получить: <strong>{status.activity.remaining}</strong></p>
      </div>
      <div>
        <h2>Открывайте обучение</h2>
        <p>Один шаг курса или мини-гайд можно открыть на {Math.round(status.rules.accessDurationSeconds / 86400)} дней за {status.rules.courseStepCost} Гафус.</p>
      </div>
    </section>
    {!status.enabled.economy && <p className={styles.notice}>Новая система мотивации пока не включена.</p>}
    {error && <p role="alert" className={styles.notice}>{error}</p>}
    <section aria-label="История Гафусов" className={styles.history}>
      <h2>История операций</h2>
      {history?.items.length ? <ul>
        {history.items.map(item => <li key={item.id}>
          <div><strong>{transactionTitle(item)}</strong><time dateTime={item.createdAt}>
            {new Date(item.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </time></div>
          <span className={item.delta >= 0 ? styles.earned : styles.spent}>
            {item.delta > 0 ? "+" : ""}{item.delta}
          </span>
        </li>)}
      </ul> : <p className={styles.empty}>Пока нет операций. Первый Гафус ещё впереди!</p>}
      {history?.nextCursor && <button onClick={() => void loadMore()} disabled={moreLoading} type="button" className={styles.action}>
        {moreLoading ? "Загружаем…" : "Показать ещё"}
      </button>}
    </section>
  </Container>;
}
