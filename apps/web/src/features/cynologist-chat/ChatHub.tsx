"use client";
import { LoadingState } from "@/shared/components/ui/LoadingState";
import { useSession } from "next-auth/react";
import { useState } from "react";
import dynamic from "next/dynamic";
import ChatLoader from "./ChatLoader";
import ChatDialogs from "./ChatDialogs";
import styles from "./chat.module.css";
const CommunityChat = dynamic(() => import("./CommunityChat"), {
  ssr: false,
  loading: () => <LoadingState message="Загрузка сообщений…" />,
});
export default function ChatHub({
  trainer = false,
  initialCommunity = false,
}: {
  trainer?: boolean;
  initialCommunity?: boolean;
}) {
  const accountId = useSession().data?.user?.id;
  const [community, setCommunity] = useState(initialCommunity);
  function navigateTab(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? false : event.key === "End" ? true : !community;
    setCommunity(next);
    document.getElementById(next ? "chat-community-tab" : "chat-personal-tab")?.focus();
  }
  return (
    <>
      <div className={styles.tabs} role="tablist" aria-label="Чаты" onKeyDown={navigateTab}>
        <button
          type="button"
          role="tab"
          id="chat-personal-tab"
          aria-selected={!community}
          tabIndex={community ? -1 : 0}
          aria-controls="chat-hub-panel"
          onClick={() => setCommunity(false)}
        >
          Чат с кинологом
        </button>
        <button
          type="button"
          role="tab"
          id="chat-community-tab"
          aria-selected={community}
          tabIndex={community ? 0 : -1}
          aria-controls="chat-hub-panel"
          onClick={() => setCommunity(true)}
        >
          Общий чат
        </button>
      </div>
      <div
        role="tabpanel"
        id="chat-hub-panel"
        aria-labelledby={community ? "chat-community-tab" : "chat-personal-tab"}
      >
        {community ? (
          <CommunityChat key={accountId} />
        ) : trainer ? (
          <ChatDialogs key={accountId} />
        ) : (
          <ChatLoader key={accountId} />
        )}
      </div>
    </>
  );
}
