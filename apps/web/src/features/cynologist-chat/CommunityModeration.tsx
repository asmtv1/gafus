"use client";

import { LoadingState } from "@/shared/components/ui/LoadingState";
import { useState } from "react";
import type { CommunityModerationDto } from "@gafus/consultation-shared";
import { chatApi } from "./api";
import styles from "./chat.module.css";
export default function CommunityModeration() {
  const [open, setOpen] = useState(false),
    [data, setData] = useState<CommunityModerationDto | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{
    action: "delete" | "ban" | "unban";
    messageId?: string;
    userId?: string;
    label: string;
  } | null>(null);
  async function load(older = false) {
    setBusy(true);
    setError("");
    try {
      const next = await chatApi<CommunityModerationDto>("moderation", {
        community: true,
        cursor: older ? (data?.cursor ?? undefined) : undefined,
      });
      setData((prev) =>
        older && prev ? { ...next, messages: [...prev.messages, ...next.messages] } : next,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    try {
      const { label, ...body } = confirm;
      await chatApi("moderation", { community: true, method: "POST", body });
      setConfirm(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.rules}>
      <button
        type="button"
        aria-expanded={open}
        disabled={busy}
        onClick={() => {
          setOpen(!open);
          if (!open) void load();
        }}
      >
        Модерация общего чата
      </button>
      {open && (
        <>
          {error && <p role="alert">{error}</p>}
          {busy && <LoadingState variant="inline" size="small" />}
          {confirm ? (
            <div className={styles.rules}>
              <p>{confirm.label}</p>
              <button disabled={busy} onClick={() => void apply()}>
                Подтвердить
              </button>
              <button disabled={busy} onClick={() => setConfirm(null)}>
                Отмена
              </button>
            </div>
          ) : (
            <>
              <button disabled={busy} onClick={() => void load()}>
                Обновить
              </button>
              <h2>Заблокированные участники</h2>
              {data?.bans.length === 0 && <p>Нет заблокированных участников.</p>}
              <ul className={styles.moderationList}>
                {data?.bans.map((user) => (
                  <li key={user.userId}>
                    @{user.username}{" "}
                    <button
                      disabled={busy}
                      onClick={() =>
                        setConfirm({
                          action: "unban",
                          userId: user.userId,
                          label: `Снять бан с @${user.username}?`,
                        })
                      }
                    >
                      Снять бан
                    </button>
                  </li>
                ))}
              </ul>
              <h2>Сообщения</h2>
              {data?.messages.length === 0 && <p>Сообщений пока нет.</p>}
              <ul className={styles.moderationList}>
                {data?.messages.map((message) => (
                  <li key={message.id}>
                    <strong>@{message.username}</strong>
                    <p>{message.text}</p>
                    <button
                      disabled={busy}
                      onClick={() =>
                        setConfirm({
                          action: "delete",
                          messageId: message.id,
                          label: "Удалить это сообщение из общего чата?",
                        })
                      }
                    >
                      Удалить сообщение
                    </button>
                    {message.canBan && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          setConfirm({
                            action: "ban",
                            userId: message.userId,
                            label: `Заблокировать @${message.username} в общем чате?`,
                          })
                        }
                      >
                        Заблокировать участника
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {data?.cursor && (
                <button disabled={busy} onClick={() => void load(true)}>
                  Загрузить предыдущие сообщения
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
