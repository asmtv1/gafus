import { useEffect, useRef, useState } from "react";
import { useRootNavigationState, useRouter, type Href } from "expo-router";
import { useAuthStore } from "@/shared/stores";
import * as Linking from "expo-linking";
import type { NotificationResponse } from "expo-notifications";

/**
 * Provider URLs are historically Next routes, while Expo Router uses
 * singular /training. Accept only explicit, internal paths: never navigate
 * to arbitrary scheme/origin or a native route supplied by a push payload.
 */
function pushPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value === "/courses" || value === "/reminders" || value === "/profile") return value;
  // The consultation worker emits historical web URLs for both recipients.
  // Map only exact allowlisted paths to native screens; never accept arbitrary
  // URLs or a user-supplied booking ID through notification routing.
  if (value === "/consultations/my") return "/consultations/mine";
  if (value === "/main-panel/consultations") return "/consultations/trainer";

  if (value === "/cynologist-chat" || /^\/cynologist-chats\/[\w-]{1,128}$/.test(value))
    return "/chats";
  if (/^\/chats\/[A-Za-z0-9_-]{1,128}$/.test(value)) return value;

  const legacyTraining = /^\/trainings\/([A-Za-z0-9_-]{1,128})(?:\/([A-Za-z0-9_-]{1,128}))?$/.exec(
    value,
  );
  if (legacyTraining) {
    // Legacy re-engagement /trainings/group/{bestCourseId} carries a COURSE
    // database ID, not the native [dayId]. Do not mistake it for a day link.
    if (legacyTraining[1] === "group" && legacyTraining[2]) return "/courses";
    return legacyTraining[2]
      ? `/training/${legacyTraining[1]}/${legacyTraining[2]}`
      : `/training/${legacyTraining[1]}`;
  }
  if (/^\/training\/[A-Za-z0-9_-]{1,128}(?:\/[A-Za-z0-9_-]{1,128})?$/.test(value)) {
    return value;
  }
  if (/^\/feed\/[A-Za-z0-9_-]{1,128}(?:\?commentId=[A-Za-z0-9_-]{1,128})?$/.test(value)) {
    return value;
  }
  return /^\/questions\/[\w-]{1,128}$/.test(value) ||
    /^\/chats\/[A-Za-z0-9_-]{1,128}$/.test(value)
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
        const consume = (response: NotificationResponse | null) => {
          if (!alive || !response) return;
          const id = response.notification.request.identifier;
          if (lastResponseId.current === id) return;
          lastResponseId.current = id;
          const path = pushPath(response.notification.request.content.data?.url);
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
      const path = pushPath(url.slice("gafus://".length));
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
    // Next sends /courses for training reminders and /trainings/* for
    // course links. These are direct native routes, not chat IDs; do not
    // send them through the cynologist-chat API check.
    if (
      pending === "/courses" || pending === "/reminders" || pending === "/profile" ||
      pending === "/consultations/mine" || pending === "/consultations/trainer" ||
      pending === "/chats" ||
      pending.startsWith("/training/") ||
      pending.startsWith("/questions/") || pending.startsWith("/feed/")
    ) {
      router.push(pending as Href);
      setPending(null);
      return;
    }
    let alive = true;
    if (/^\/chats\/[A-Za-z0-9_-]{1,128}$/.test(pending)) {
      const conversationId = pending.split("/")[2];
      // New messenger uses its own access policy; do not route via legacy Stream.
      void import("@/features/chat2/api").then(({ chat2 }) => chat2.room(conversationId))
        .then(() => { if (alive) { router.push({ pathname: "/(main)/chats/[id]", params: { id: conversationId } } as Href); setPending(null); } })
        .catch(() => { if (alive) setPending(null); });
      return () => { alive = false; };
    }
    // Legacy push deep links must never access Stream or treat its IDs as Chat2 IDs.
    setPending(null);
    return () => {
      alive = false;
    };
  }, [pending, authenticated, loading, nav?.key, router]);
  return null;
}
