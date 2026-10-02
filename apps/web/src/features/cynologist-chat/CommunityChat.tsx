"use client";
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
  return (
    <main className={styles.page}>
      <section className={styles.rules} aria-label="Правила чата">
        <h2>Правила чата</h2>
        <p>{COMMUNITY_CHAT_RULES}</p>
      </section>
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
