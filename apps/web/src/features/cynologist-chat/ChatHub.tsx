"use client";
import { LoadingState } from "@/shared/components/ui/LoadingState";
import { PrimaryButton } from "@/shared/components/ui/PrimaryButton";
import { SecondaryButton } from "@/shared/components/ui/SecondaryButton";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
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
  const PersonalTabButton = community ? SecondaryButton : PrimaryButton;
  const CommunityTabButton = community ? PrimaryButton : SecondaryButton;
  const pendingTabFocus = useRef<string | null>(null);
  useEffect(() => {
    if (pendingTabFocus.current) {
      document.getElementById(pendingTabFocus.current)?.focus();
      pendingTabFocus.current = null;
    }
  }, [community]);
  function selectTab(next: boolean) {
    const id = next ? "chat-community-tab" : "chat-personal-tab";
    pendingTabFocus.current = next === community ? null : id;
    setCommunity(next);
    document.getElementById(id)?.focus();
  }
  function navigateTab(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? false : event.key === "End" ? true : !community;
    selectTab(next);
  }
  return (
    <>
      <div className={styles.tabs} role="tablist" aria-label="Чаты" onKeyDown={navigateTab}>
        <PersonalTabButton
          type="button"
          role="tab"
          id="chat-personal-tab"
          aria-selected={!community}
          tabIndex={community ? -1 : 0}
          aria-controls="chat-hub-panel"
          onClick={() => selectTab(false)}
        >
          Чат с кинологом
        </PersonalTabButton>
        <CommunityTabButton
          type="button"
          role="tab"
          id="chat-community-tab"
          aria-selected={community}
          tabIndex={community ? 0 : -1}
          aria-controls="chat-hub-panel"
          onClick={() => selectTab(true)}
        >
          Общий чат
        </CommunityTabButton>
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
