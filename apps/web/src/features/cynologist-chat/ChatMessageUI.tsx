"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ReplyIcon from "@mui/icons-material/Reply";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import { useQuery } from "@gafus/react-query";
import { getPublicProfileAction } from "@/shared/server-actions/user";
import { Avatar, MessageUI, useMessageContext } from "stream-chat-react";
import { CHAT_ROLE_LABELS, ownChatMessageActions } from "@gafus/consultation-shared";
import { ChatReactionContext, ChatReactionPicker } from "./ChatReactions";
import styles from "./chat.module.css";
export const MessageManagementContext = createContext<{
  userId: string;
  disabled: boolean;
  edit: (id: string, text: string) => void;
  remove: (id: string) => void;
  reply: (message: { id: string; text?: string; user?: { name?: string } | null }) => void;
  canReply: boolean;
} | null>(null);

function useChatAuthorProfile(username?: string) {
  return useQuery({
    queryKey: ["chat-public-profile", username],
    enabled: !!username,
    staleTime: 60 * 1000,
    queryFn: () => getPublicProfileAction(username!),
  });
}
export function GafusAvatar(props: React.ComponentProps<typeof Avatar>) {
  const router = useRouter();
  const { data } = useChatAuthorProfile(props.userName);
  return (
    <Avatar
      {...props}
      imageUrl={props.imageUrl || data?.profile?.avatarUrl || undefined}
      role={props.userName ? "link" : props.role}
      tabIndex={props.userName ? 0 : props.tabIndex}
      aria-label={props.userName ? `Открыть профиль ${props.userName}` : props["aria-label"]}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      style={{ ...props.style, cursor: props.userName ? "pointer" : props.style?.cursor }}
      onClick={(event) => {
        event.stopPropagation();
        if (props.userName) router.push(`/profile?username=${encodeURIComponent(props.userName)}`);
      }}
      onKeyDown={(event) => {
        if (props.userName && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.stopPropagation();
          router.push(`/profile?username=${encodeURIComponent(props.userName)}`);
        }
      }}
    />
  );
}

export function GafusMessageUI(props: React.ComponentProps<typeof MessageUI>) {
  const { message, isMyMessage, groupStyles } = useMessageContext();
  const { data: authorProfile } = useChatAuthorProfile(message.user?.name);
  const authorRole =
    authorProfile?.role === "ADMIN"
      ? "admin"
      : authorProfile?.role === "TRAINER"
        ? "trainer"
        : authorProfile?.chatRole;
  const management = useContext(MessageManagementContext);
  const reactions = useContext(ChatReactionContext);
  const actions = ownChatMessageActions(
    {
      id: message.id,
      authorId: message.user?.id,
      type: message.type,
      deletedAt: message.deleted_at,
      createdAt: message.created_at,
    },
    management?.userId ?? "",
  );
  const own = actions.canEdit || actions.canDelete;
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  function closeMenu() {
    setMenuPosition(null);
    previousFocus.current?.focus();
  }
  function openMenu(x: number, y: number) {
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMenuPosition({
      x: Math.max(8, Math.min(x, window.innerWidth - 248)),
      y: Math.max(8, Math.min(y, window.innerHeight - 360)),
    });
  }
  useEffect(() => {
    if (!menuPosition) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const fitMenu = () => {
      const rect = menuRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPosition((position) => {
        if (!position) return null;
        const x = Math.max(8, Math.min(position.x, window.innerWidth - rect.width - 8));
        const y = Math.max(8, Math.min(position.y, window.innerHeight - rect.height - 8));
        return x === position.x && y === position.y ? position : { x, y };
      });
    };
    const observer = new ResizeObserver(fitMenu);
    if (menuRef.current) observer.observe(menuRef.current);
    fitMenu();
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuPosition(null);
    };
    const closeOnScroll = () => setMenuPosition(null);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnScroll);
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnScroll);
    };
  }, [menuPosition]);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const canOpenMenu =
    message.type !== "deleted" &&
    message.type !== "system" &&
    Boolean(message.text || own || management?.canReply || reactions?.enabled) &&
    !management?.disabled;
  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );
  const cancelHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  return (
    <div
      className={styles.messageWrapper}
      onContextMenu={(event) => {
        if (canOpenMenu) {
          event.preventDefault();
          openMenu(event.clientX, event.clientY);
        }
      }}
      onDoubleClick={(event) => {
        if (
          !reactions?.enabled ||
          message.type === "deleted" ||
          message.type === "system" ||
          (event.target as HTMLElement).closest("button, a, input, textarea, video")
        )
          return;
        reactions.change(
          message.id,
          "like",
          message.own_reactions?.some((reaction) => reaction.type === "like") ?? false,
        );
      }}
      onPointerDown={(event) => {
        if (
          event.pointerType === "touch" &&
          canOpenMenu &&
          !(event.target as HTMLElement).closest("button, a, input, textarea, video")
        ) {
          cancelHold();
          swiped.current = false;
          const { clientX, clientY } = event;
          touchStart.current = { x: clientX, y: clientY };
          holdTimer.current = setTimeout(() => {
            touchStart.current = null;
            openMenu(clientX, clientY);
          }, 450);
        }
      }}
      onPointerUp={(event) => {
        cancelHold();
        const start = touchStart.current;
        touchStart.current = null;
        if (!start || !management?.canReply) return;
        const dx = event.clientX - start.x;
        const dy = Math.abs(event.clientY - start.y);
        if (dx > 60 && dx > dy * 1.5) {
          swiped.current = true;
          management.reply(message);
        }
      }}
      onPointerMove={(event) => {
        const start = touchStart.current;
        if (!start) return;
        if (Math.abs(event.clientX - start.x) > 10 || Math.abs(event.clientY - start.y) > 10)
          cancelHold();
        if (Math.abs(event.clientY - start.y) > 30) touchStart.current = null;
      }}
      onPointerCancel={() => {
        cancelHold();
        touchStart.current = null;
      }}
      onClickCapture={(event) => {
        if (swiped.current) {
          event.preventDefault();
          event.stopPropagation();
          swiped.current = false;
        }
      }}
    >
      {message.type !== "deleted" &&
        message.user?.name &&
        (!groupStyles?.length || groupStyles.includes("top") || groupStyles.includes("single")) && (
          <div
            className={styles.authorName}
            style={{ justifyContent: isMyMessage() ? "flex-end" : "flex-start" }}
          >
            <Link
              href={{ pathname: "/profile", query: { username: message.user.name } }}
              style={{ color: "inherit", textDecoration: "none" }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              {message.user.name}
            </Link>
            {!!authorRole && (
              <span className={styles.authorRole}>{CHAT_ROLE_LABELS[authorRole]}</span>
            )}
          </div>
        )}
      {canOpenMenu && (
        <button
          type="button"
          className={styles.messageMenuTrigger}
          aria-label="Действия с сообщением"
          aria-haspopup="menu"
          aria-expanded={menuPosition !== null}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            openMenu(rect.left, rect.bottom + 4);
          }}
        >
          <MoreHorizIcon fontSize="small" />
        </button>
      )}
      {menuPosition &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.messageMenu}
            role="menu"
            aria-label="Действия с сообщением"
            style={{ left: menuPosition.x, top: menuPosition.y }}
            onKeyDown={(event) => {
              const buttons = Array.from(
                menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
              );
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                buttons[
                  (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length
                ]?.focus();
              }
            }}
          >
            <ChatReactionPicker close={closeMenu} />
            {management?.canReply && message.type !== "deleted" && message.type !== "system" && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu();
                  management.reply(message);
                }}
              >
                <ReplyIcon fontSize="small" />
                Ответить
              </button>
            )}
            {message.text && (
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(message.text!);
                    closeMenu();
                  } catch {
                    /* Leave the menu open if clipboard permission is unavailable. */
                  }
                }}
              >
                <ContentCopyIcon fontSize="small" />
                Копировать
              </button>
            )}
            {actions.canEdit && (
              <button
                type="button"
                role="menuitem"
                disabled={management?.disabled}
                onClick={() => {
                  closeMenu();
                  management?.edit(message.id, message.text ?? "");
                }}
              >
                <EditOutlinedIcon fontSize="small" />
                Редактировать
              </button>
            )}
            {actions.canDelete && (
              <button
                type="button"
                role="menuitem"
                className={styles.deleteMessageAction}
                disabled={management?.disabled}
                onClick={() => {
                  closeMenu();
                  if (window.confirm("Удалить сообщение у всех участников чата?"))
                    management?.remove(message.id);
                }}
              >
                <DeleteOutlineIcon fontSize="small" />
                Удалить у всех
              </button>
            )}
          </div>,
          document.body,
        )}
      <MessageUI {...props} />
    </div>
  );
}
