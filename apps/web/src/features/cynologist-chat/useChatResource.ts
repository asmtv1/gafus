"use client";
import { reportClientError } from "@gafus/error-handling";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { CynologistChatSessionDto } from "@gafus/consultation-shared";
import { chatApi } from "./api";

type ChatState = { enabled: boolean; chat?: { provisionStatus: string } | null };

/** Cancel superseded refreshes so a slow response cannot restore stale access. */
export function useChatResource<T extends ChatState>({
  chatId,
  community = false,
}: { chatId?: string; community?: boolean } = {}) {
  const accountId = useSession().data?.user?.id;
  const [state, setState] = useState<T | null>(null);
  const [session, setSession] = useState<CynologistChatSessionDto | null>(null);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!mounted.current) return;
    controller.current?.abort();
    if (!accountId) return;
    const request = new AbortController();
    controller.current = request;
    try {
      const next = await chatApi<T>("", { chatId, community, signal: request.signal });
      if (request.signal.aborted) return;
      setState(next);
      setError("");
      if (community ? next.enabled : next.chat?.provisionStatus === "READY") {
        const token = await chatApi<CynologistChatSessionDto>("session", {
          method: "POST",
          chatId,
          community,
          signal: request.signal,
        });
        if (!request.signal.aborted) setSession(token);
      } else {
        setSession(null);
      }
    } catch (cause) {
      if (!request.signal.aborted) {
        reportClientError(cause, { issueKey: "ChatResource", keys: { operation: "refresh" } });
        setError(cause instanceof Error ? cause.message : "Не удалось загрузить чат");
      }
    }
  }, [accountId, chatId, community]);
  useEffect(() => {
    mounted.current = true;
    setState(null);
    setSession(null);
    setError("");
    void refresh();
    const update = () => {
      void refresh();
    };
    window.addEventListener("focus", update);
    return () => {
      mounted.current = false;
      controller.current?.abort();
      window.removeEventListener("focus", update);
    };
  }, [refresh]);
  return { accountId, state, session, error, setError, refresh };
}
