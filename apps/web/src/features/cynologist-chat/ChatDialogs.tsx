"use client";
import { LoadingState } from "@/shared/components/ui/LoadingState";
import { reportClientError } from "@gafus/error-handling";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CynologistChatDto } from "@gafus/consultation-shared";
import { chatApi } from "./api";
import styles from "./chat.module.css";
export default function ChatDialogs() {
  const [data, setData] = useState<{
    items: CynologistChatDto[];
    nextCursor: string | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async (cursor?: string) => {
    if (cursor && request.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const result = await chatApi<{ items: CynologistChatDto[]; nextCursor: string | null }>(
        "dialogs",
        { cursor, signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setData((old) => ({
        ...result,
        items: cursor ? [...(old?.items ?? []), ...result.items] : result.items,
      }));
    } catch (e) {
      if (!controller.signal.aborted)
        reportClientError(e, { issueKey: "ChatDialogs", keys: { operation: "request" } });
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => {
      if (!document.hidden) void load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      request.current?.abort();
    };
  }, [load]);
  return (
    <main className={styles.page}>
      <h1>Диалоги</h1>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button type="button" disabled={busy} onClick={() => void load()}>
            Повторить загрузку
          </button>
        </div>
      )}
      {!data && !error && <LoadingState message="Загрузка диалогов…" />}
      {data?.items.length === 0 && <p>Пока нет диалогов. Здесь появятся сообщения клиентов.</p>}
      <ul className={styles.list}>
        {data?.items.map((chat) => (
          <li key={chat.id}>
            <Link href={`/cynologist-chats/${chat.id}`}>
              {chat.intake.clientOwnerName} · {chat.intake.petName}
              {chat.unreadCount > 0 && <strong> · {chat.unreadCount} непрочитанных</strong>}
              <br />
              {chat.lastMessageAt && new Date(chat.lastMessageAt).toLocaleString("ru-RU")}
            </Link>
          </li>
        ))}
      </ul>
      {data?.nextCursor && (
        <button type="button" disabled={busy} onClick={() => void load(data.nextCursor!)}>
          {busy ? "Загрузка…" : "Показать ещё"}
        </button>
      )}
    </main>
  );
}
