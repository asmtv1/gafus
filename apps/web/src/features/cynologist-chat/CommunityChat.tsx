"use client";
import { useEffect, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import { LoadingState } from "@/shared/components/ui/LoadingState";
import { COMMUNITY_CHAT_RULES } from "@gafus/consultation-shared";
import CommunityModeration from "./CommunityModeration";
import type { CommunityChatStateDto } from "@gafus/consultation-shared";
import { ConnectedChat } from "./ChatPage";
import { useChatResource } from "./useChatResource";
import styles from "./chat.module.css";
export default function CommunityChat() {
  const { accountId, state, session, error, refresh } = useChatResource<CommunityChatStateDto>({
    community: true,
  });
  const [rules, setRules] = useState<{ accountId: string; visible: boolean } | null>(null);
  const showRules = !!accountId && rules?.accountId === accountId && rules.visible;
  useEffect(() => {
    if (!accountId) return;
    let visible = true;
    try {
      visible = localStorage.getItem(`community-chat-rules:v1:${accountId}`) !== "dismissed";
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
    setRules({ accountId, visible });
  }, [accountId]);
  function dismissRules() {
    if (!accountId) return;
    setRules({ accountId, visible: false });
    try {
      localStorage.setItem(`community-chat-rules:v1:${accountId}`, "dismissed");
    } catch {
      /* Keep rules dismissed for this visit. */
    }
  }
  return (
    <main className={styles.page}>
      {showRules && (
        <section className={styles.rules} aria-label="Правила чата">
          <div className={styles.rulesHeading}>
            <h2>Правила чата</h2>
            <button
              type="button"
              aria-label="Закрыть правила чата"
              onClick={dismissRules}
              className={styles.closeRules}
            >
              <CloseIcon fontSize="small" />
            </button>
          </div>
          <p>{COMMUNITY_CHAT_RULES}</p>
        </section>
      )}
      {state?.isModerator && <CommunityModeration />}
      {state?.isBanned && (
        <p role="alert">Вы заблокированы в общем чате. Отправка сообщений недоступна.</p>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void refresh()}>
            Повторить загрузку
          </button>
        </div>
      )}
      {!state && !error && <LoadingState message="Загрузка сообщений…" />}
      {state && !state.enabled && <p>Общий чат пока недоступен.</p>}
      {state?.enabled && !session && !error && <LoadingState message="Подключение…" />}
      {state && session && session.userId === `gafus-${accountId}` && (
        <ConnectedChat
          key={`${session.userId}:${session.channelId}`}
          state={state}
          session={session}
          refresh={refresh}
          community
        />
      )}
    </main>
  );
}
