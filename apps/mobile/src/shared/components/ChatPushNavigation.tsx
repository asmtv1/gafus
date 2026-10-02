import { useEffect, useRef, useState } from "react";
import { useRootNavigationState, useRouter, type Href } from "expo-router";
import { useAuthStore } from "@/shared/stores";
import { chatApi } from "@/shared/lib/api/cynologistChat";
import type { CynologistChatStateDto } from "@gafus/consultation-shared";
import * as Linking from "expo-linking";

function chatPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value === "/cynologist-chat" || /^\/cynologist-chats\/[\w-]{1,128}$/.test(value)
    ? value
    : null;
}
export function ChatPushNavigation() {
  const [pending, setPending] = useState<string | null>(null);
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const loading = useAuthStore((s) => s.isLoading);
  const nav = useRootNavigationState();
  const router = useRouter();
  const lastResponseId = useRef<string | null>(null);
  useEffect(() => {
    let alive = true;
    let cleanup: (() => void) | undefined;
    void import("expo-notifications")
      .then(async (notifications) => {
        const consume = (response: import("expo-notifications").NotificationResponse | null) => {
          if (!alive || !response) return;
          const id = response.notification.request.identifier;
          if (lastResponseId.current === id) return;
          lastResponseId.current = id;
          const path = chatPath(response.notification.request.content.data?.url);
          if (path) setPending(path);
        };
        const listener = notifications.addNotificationResponseReceivedListener(consume);
        cleanup = () => listener.remove();
        consume(await notifications.getLastNotificationResponseAsync());
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      cleanup?.();
    };
  }, []);
  useEffect(() => {
    const consume = (url: string) => {
      if (!url.startsWith("gafus:///")) return;
      const path = chatPath(url.slice("gafus://".length));
      if (path) setPending(path);
    };
    const listener = Linking.addEventListener("url", ({ url }) => consume(url));
    void Linking.getInitialURL().then((url) => {
      if (url) consume(url);
    });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!pending || !authenticated || loading || !nav?.key) return;
    let alive = true;
    const chatId = pending.startsWith("/cynologist-chats/") ? pending.split("/")[2] : undefined;
    void chatApi<CynologistChatStateDto>("", { chatId })
      .then((state) => {
        if (!alive) return;
        if (state.chat) router.push(pending as Href);
        setPending(null);
      })
      .catch(() => {
        if (alive) setPending(null);
      });
    return () => {
      alive = false;
    };
  }, [pending, authenticated, loading, nav?.key, router]);
  return null;
}
