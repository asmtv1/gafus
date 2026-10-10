"use client";

import Link from "next/link";
import { trackEvent } from "@gafus/analytics";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GafusMiniGuideDto } from "@gafus/types";
import GuideContentEmbed from "@/features/training/components/GuideContentEmbed";
import { LoadingState } from "@/shared/components/ui/LoadingState";
import { gafusApi } from "./api";
import styles from "./GafusGuidesPage.module.css";

export function GafusGuidesPage() {
  const [items, setItems] = useState<GafusMiniGuideDto[]>([]);
  const [content, setContent] = useState<{ id: string; html: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIds = useRef(new Map<string, string>());

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setItems(await gafusApi.miniGuides());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить мини-гайды");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const open = useCallback(async (item: GafusMiniGuideDto) => {
    if (busy) return;
    setBusy(item.courseId);
    setError(null);
    try {
      if (!item.unlocked) {
        if (!item.canPurchase) throw new Error("Покупка сейчас недоступна");
        const requestId = requestIds.current.get(item.courseId) ?? crypto.randomUUID();
        requestIds.current.set(item.courseId, requestId);
        await gafusApi.unlock({
          clientRequestId: requestId,
          target: { type: "MINI_GUIDE", courseId: item.courseId },
        });
        trackEvent({
          eventName: "button_click", platform: "web",
          pathOrScreen: "/gafus/guides", elementId: "gafus-guide-unlock-success",
          courseId: item.courseId,
        });
        requestIds.current.delete(item.courseId);
      }
      const result = await gafusApi.guide(item.courseId);
      setContent({ id: item.courseId, html: result.guideContent });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось открыть мини-гайд");
    } finally {
      setBusy(null);
    }
  }, [busy, refresh]);

  if (loading) return <LoadingState message="Загружаем мини-гайды" />;

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/gafus" className={styles.back}>← Мои Гафусы</Link>
      <h1>Мини-гайды</h1>
      <p>Полезные материалы, которые можно открыть за Гафусы на ограниченный срок.</p>
    </header>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {content ? (
      <section className={styles.reader} aria-label="Содержимое мини-гайда">
        <button type="button" className={styles.action} onClick={() => setContent(null)}>← К списку</button>
        <GuideContentEmbed content={content.html} />
      </section>
    ) : <div className={styles.grid}>
      {items.map(item => <article key={item.courseId} className={styles.card}>
        <h2>{item.title}</h2>
        <p>{item.description}</p>
        <span className={styles.detail}>
          {item.unlocked ? item.expiresAt
            ? `Доступ до ${new Date(item.expiresAt).toLocaleDateString("ru-RU")}`
            : "Доступно по подписке"
          : `Стоимость: ${item.price} Гафус`}
        </span>
        <button className={styles.action} type="button"
          disabled={busy === item.courseId || (!item.unlocked && !item.canPurchase)}
          onClick={() => void open(item)}
        >{busy === item.courseId ? "Открываем…" : item.unlocked ? "Читать" : "Открыть за Гафусы"}</button>
      </article>)}
      {!items.length && <p>Мини-гайды пока не опубликованы.</p>}
    </div>}
  </main>;
}
