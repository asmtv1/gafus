"use client";

import { LoadingState } from "@/shared/components/ui/LoadingState";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useChatContext, useMessageContext } from "stream-chat-react";
import { reportClientError } from "@gafus/error-handling";
import type { ReactionResponse } from "stream-chat";
import { CHAT_REACTIONS } from "@gafus/consultation-shared";
import styles from "./chat.module.css";

export const ChatReactionContext = createContext<{
  enabled: boolean;
  pending: boolean;
  change: (messageId: string, type: string, remove: boolean) => void;
} | null>(null);

export function ChatReactionPicker({ close }: { close: () => void }) {
  const { message } = useMessageContext();
  const controller = useContext(ChatReactionContext);
  const [expanded, setExpanded] = useState(false);
  if (!controller?.enabled || message.type === "deleted" || message.type === "system") return null;
  return (
    <div
      className={`${styles.reactionPicker} ${expanded ? styles.expandedReactions : ""}`}
      role="group"
      aria-label="Реакции на сообщение"
    >
      {(expanded ? CHAT_REACTIONS : CHAT_REACTIONS.slice(0, 6)).map(({ type, emoji, label }) => {
        const selected = message.own_reactions?.some((reaction) => reaction.type === type) ?? false;
        return (
          <button
            key={type}
            type="button"
            role="menuitem"
            aria-label={label}
            aria-pressed={selected}
            title={label}
            disabled={controller.pending}
            onClick={() => {
              controller.change(message.id, type, selected);
              close();
            }}
          >
            {emoji}
          </button>
        );
      })}
      <button
        type="button"
        role="menuitem"
        aria-label={expanded ? "Свернуть реакции" : "Все реакции"}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "−" : "+"}
      </button>
    </div>
  );
}

export function ChatReactionList() {
  const { message, isMyMessage } = useMessageContext();
  const { client } = useChatContext();
  const controller = useContext(ChatReactionContext);
  const [participants, setParticipants] = useState<string | null>(null);
  const [rows, setRows] = useState<ReactionResponse[]>([]);
  const [next, setNext] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const requestVersion = useRef(0);
  const participantsOpen = participants !== null;
  const closeButton = useRef<HTMLButtonElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const cancelHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  useEffect(
    () => () => {
      cancelHold();
    },
    [],
  );
  useEffect(() => {
    if (!participantsOpen) return;
    const focus = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setParticipants(null);
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      focus?.focus();
    };
  }, [participantsOpen]);
  useEffect(() => {
    if (participants === null) return;
    const version = ++requestVersion.current;
    setRows([]);
    setError("");
    setNext(undefined);
    setLoading(true);
    client
      .queryReactions(
        message.id,
        participants ? { type: participants } : {},
        [{ created_at: -1 }],
        { limit: 30 },
      )
      .then((result) => {
        if (requestVersion.current === version) {
          setRows(result.reactions);
          setNext(result.next);
        }
      })
      .catch((error) => {
        reportClientError(error, {
          issueKey: "ChatReactions",
          keys: { operation: "participants" },
        });
        if (requestVersion.current === version) setError("Не удалось загрузить участников");
      })
      .finally(() => {
        if (requestVersion.current === version) setLoading(false);
      });
    return () => {
      if (requestVersion.current === version) requestVersion.current = version + 1;
    };
  }, [participants, client, message.id, message.reaction_groups, message.reaction_counts, reload]);
  async function loadMore() {
    if (participants === null || !next || loading) return;
    const version = requestVersion.current;
    setLoading(true);
    setError("");
    try {
      const result = await client.queryReactions(
        message.id,
        participants ? { type: participants } : {},
        [{ created_at: -1 }],
        { limit: 30, next },
      );
      if (version === requestVersion.current) {
        setRows((previous) => [...previous, ...result.reactions]);
        setNext(result.next);
      }
    } catch (error) {
      reportClientError(error, {
        issueKey: "ChatReactions",
        keys: { operation: "participantsMore" },
      });
      if (version === requestVersion.current) setError("Не удалось загрузить участников");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }
  if (message.type === "deleted" || message.type === "system") return null;
  return (
    <>
      <div
        className={`${styles.reactionList} str-chat__message-reactions--bottom`}
        style={{ justifyContent: isMyMessage() ? "flex-end" : "flex-start" }}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        {CHAT_REACTIONS.map(({ type, emoji, label }) => {
          const count =
            message.reaction_groups?.[type]?.count ?? message.reaction_counts?.[type] ?? 0;
          if (!count) return null;
          const selected =
            message.own_reactions?.some((reaction) => reaction.type === type) ?? false;
          return (
            <button
              key={type}
              type="button"
              aria-label={`${label}: ${count}`}
              aria-pressed={selected}
              title="Нажмите, чтобы изменить реакцию. Правый клик — участники"
              disabled={controller?.pending}
              onClick={(event) => {
                event.stopPropagation();
                if (held.current) {
                  held.current = false;
                  return;
                }
                if (controller?.enabled) controller.change(message.id, type, selected);
                else setParticipants(type);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setParticipants(type);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.shiftKey) {
                  event.preventDefault();
                  setParticipants(type);
                }
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                if (event.pointerType === "touch") {
                  held.current = false;
                  cancelHold();
                  holdTimer.current = setTimeout(() => {
                    held.current = true;
                    setParticipants(type);
                  }, 450);
                }
              }}
              onPointerUp={cancelHold}
              onPointerCancel={cancelHold}
              onPointerMove={cancelHold}
            >
              {emoji}
              <span>{count}</span>
            </button>
          );
        })}
        {CHAT_REACTIONS.some(
          ({ type }) =>
            (message.reaction_groups?.[type]?.count ?? message.reaction_counts?.[type] ?? 0) > 0,
        ) && (
          <button
            type="button"
            className={styles.reactionDetailsButton}
            aria-label="Кто поставил реакции"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setParticipants("");
            }}
          >
            Кто поставил
          </button>
        )}
      </div>
      {participants !== null &&
        createPortal(
          <div
            className={styles.reactionModalBackdrop}
            onClick={(event) => {
              event.stopPropagation();
              if (event.target === event.currentTarget) setParticipants(null);
            }}
          >
            <div
              className={styles.reactionModal}
              role="dialog"
              aria-modal="true"
              aria-label="Кто поставил реакцию"
              onKeyDown={(event) => {
                if (event.key !== "Tab") return;
                const buttons = Array.from(
                  event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
                );
                if (event.shiftKey && document.activeElement === buttons[0]) {
                  event.preventDefault();
                  buttons.at(-1)?.focus();
                }
                if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
                  event.preventDefault();
                  buttons[0]?.focus();
                }
              }}
            >
              <div className={styles.reactionModalHeading}>
                <strong>
                  {CHAT_REACTIONS.find((reaction) => reaction.type === participants)?.emoji} Кто
                  поставил реакцию
                </strong>
                <button
                  ref={closeButton}
                  type="button"
                  aria-label="Закрыть"
                  onClick={() => setParticipants(null)}
                >
                  ×
                </button>
              </div>
              <div className={styles.reactionFilters} role="group" aria-label="Фильтр реакций">
                <button
                  type="button"
                  aria-pressed={participants === ""}
                  onClick={() => setParticipants("")}
                >
                  Все
                </button>
                {CHAT_REACTIONS.filter(
                  ({ type }) =>
                    type === participants ||
                    (message.reaction_groups?.[type]?.count ??
                      message.reaction_counts?.[type] ??
                      0) > 0,
                ).map(({ type, emoji, label }) => (
                  <button
                    key={type}
                    type="button"
                    aria-label={label}
                    aria-pressed={participants === type}
                    onClick={() => setParticipants(type === participants ? "" : type)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <ul>
                {rows.map((reaction, index) => {
                  const own = reaction.user_id === client.userID;
                  return (
                    <li key={`${reaction.user_id}-${reaction.type}-${index}`}>
                      <button
                        type="button"
                        className={styles.reactionParticipant}
                        disabled={!own || !controller?.enabled || controller.pending}
                        onClick={() => controller?.change(message.id, reaction.type, true)}
                        aria-label={`${reaction.user?.name || "Пользователь"}${own && controller?.enabled ? ". Убрать свою реакцию" : ""}`}
                      >
                        {reaction.user?.image ? (
                          <img src={reaction.user.image} alt="" width={36} height={36} />
                        ) : (
                          <span className={styles.reactionAvatar}>
                            {reaction.user?.name?.[0]?.toUpperCase() || "?"}
                          </span>
                        )}
                        <span className={styles.reactionParticipantName}>
                          {reaction.user?.name || "Пользователь"}
                          {own && controller?.enabled && <small>Нажмите, чтобы убрать</small>}
                        </span>
                        <span>
                          {CHAT_REACTIONS.find((item) => item.type === reaction.type)?.emoji ?? ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {loading && <LoadingState variant="inline" size="small" />}
              {error && <p role="alert">{error}</p>}
              {!loading && !error && !rows.length && <p>Пока нет реакций</p>}
              {(next || error) && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    if (next) void loadMore();
                    else {
                      setReload((value) => value + 1);
                    }
                  }}
                >
                  {error ? "Повторить загрузку" : "Загрузить ещё"}
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
