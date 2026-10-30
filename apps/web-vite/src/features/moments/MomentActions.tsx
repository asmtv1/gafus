import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import "./moment-reactions-telegram.css";
import { FEED_REACTIONS } from "@gafus/types";
import {
  setMomentReaction, setMomentBookmark, type MomentItem,
} from "./momentsApi";

/** Mutations refetch server-owned counters. Never change points/reactions locally. */
type MomentActionsProps = {
  post: MomentItem; userId: string; compact?: boolean; commentHref?: string;
};

/** Shared, accessible icon for list cards and post detail (no visual text label). */
function BookmarkIcon({ saved }: { saved: boolean }) {
  return <svg viewBox="0 0 24 24" width="21" height="21"
    fill={saved ? "currentColor" : "none"}
    stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
    strokeLinejoin="round" focusable="false" aria-hidden="true">
    <path d="M6.5 4.5h11v15.2L12 16.1l-5.5 3.6V4.5Z" />
  </svg>;
}

// A new owner/post must never inherit a retired post's pending mutations.
export function MomentActions(props: MomentActionsProps) {
  return <MomentActionsTarget
    key={JSON.stringify([props.userId, props.post.id])} {...props} />;
}

function MomentActionsTarget({ post, userId, compact = false, commentHref }: MomentActionsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const trayRef = useRef<HTMLDivElement>(null);
  const cache = useQueryClient();
  useEffect(() => {
    if (!pickerOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !trayRef.current?.contains(event.target)) {
        setPickerOpen(false);
      }
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPickerOpen(false);
        trayRef.current?.querySelector<HTMLButtonElement>(".moment-reaction-add")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [pickerOpen]);
  // Reaction and bookmark already share a disabled state: acquire one common
  // flight synchronously, before React can paint isPending.
  const flight = useRef(false);
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["moments", "list", userId] }),
      cache.invalidateQueries({ queryKey: ["moments", "post", userId, post.id] }),
      cache.invalidateQueries({ queryKey: ["moments", "saved", userId] }),
    ]);
  };
  const reaction = useMutation({
    mutationFn: (emoji: (typeof FEED_REACTIONS)[number] | null) =>
      setMomentReaction(post.id, emoji),
    onSuccess: refresh,
  });
  const bookmark = useMutation({
    mutationFn: (saved: boolean) => setMomentBookmark(post.id, saved),
    onSuccess: refresh,
  });
  const submit = (mutate: () => Promise<unknown>) => {
    if (flight.current || reaction.isPending || bookmark.isPending) return;
    flight.current = true;
    // React Query still exposes original error/ACK states; no auto replay.
    void mutate().catch(() => undefined).finally(() => {
      flight.current = false;
    });
  };
  const reactionBusy = reaction.isPending || bookmark.isPending;
  // As in Telegram, show only reactions that already have votes. The menu
  // contains all supported emojis and lets the viewer add or change a vote.
  const reactionTray = <div className="moment-reaction-tray" ref={trayRef}>
    <div className="moment-reaction-chips" role="group" aria-label="Реакции публикации">
      {FEED_REACTIONS.map(emoji => {
        const count = post.reactions.find(item => item.emoji === emoji)?.count ?? 0;
        if (count <= 0) return null;
        return <button key={emoji} type="button" className="moment-reaction-chip"
          aria-label={`Реакция ${emoji}: ${count}`}
          aria-pressed={post.myReaction === emoji} disabled={reactionBusy}
          onClick={() => submit(() => reaction.mutateAsync(
            post.myReaction === emoji ? null : emoji))}>
          <span className="moment-reaction-emoji" aria-hidden="true">{emoji}</span>
          <span className="moment-reaction-count">{count}</span>
        </button>;
      })}
      <button type="button" className="moment-reaction-add"
        aria-label="Выбрать реакцию" aria-expanded={pickerOpen}
        aria-haspopup="true" disabled={reactionBusy}
        onClick={() => setPickerOpen(value => !value)}>
        <span aria-hidden="true">+</span>
      </button>
    </div>
    {pickerOpen && <div className="moment-reaction-picker" role="group"
      aria-label="Выбор реакции">
      {FEED_REACTIONS.map(emoji => <button key={emoji} type="button"
        aria-label={"Реакция " + emoji} aria-pressed={post.myReaction === emoji}
        disabled={reactionBusy}
        onClick={() => {
          setPickerOpen(false);
          submit(() => reaction.mutateAsync(post.myReaction === emoji ? null : emoji));
        }}>
        <span aria-hidden="true">{emoji}</span>
      </button>)}
    </div>}
  </div>;
  if (compact) return <div className="moment-actions moment-actions-compact">
    {reactionTray}
    {commentHref && <a href={commentHref} className="moment-action-comment">
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
        strokeLinejoin="round" aria-hidden="true">
        <path d="M20 11.5a8 8 0 0 1-8 8 8.8 8.8 0 0 1-3.3-.7L4 20l1.2-4.7A8.8 8.8 0 0 1 4 11.5a8 8 0 1 1 16 0Z"/>
      </svg>
      <span>Комментировать</span>
    </a>}
    <button type="button" className="moment-action-save" aria-pressed={post.bookmarked === true}
      aria-label={post.bookmarked ? "Убрать из закладок" : "В закладки"}
      title={post.bookmarked ? "Убрать из закладок" : "В закладки"}
      disabled={bookmark.isPending || reaction.isPending}
      onClick={() => submit(() => bookmark.mutateAsync(!post.bookmarked))}>
      <BookmarkIcon saved={post.bookmarked === true} />
    </button>
    {reaction.isError && <p role="alert">Не удалось изменить реакцию.</p>}
    {bookmark.isError && <p role="alert">Не удалось изменить закладку.</p>}
  </div>;
  return <div className="moment-actions">
    {reactionTray}
    <button type="button" className="moment-action-save moment-action-save-feed"
      aria-pressed={post.bookmarked === true}
      aria-label={post.bookmarked ? "Убрать из закладок" : "В закладки"}
      title={post.bookmarked ? "Убрать из закладок" : "В закладки"}
      disabled={bookmark.isPending || reaction.isPending}
      onClick={() => submit(() => bookmark.mutateAsync(!post.bookmarked))}>
      <BookmarkIcon saved={post.bookmarked === true} />
    </button>
    {reaction.isError && <p role="alert">Не удалось изменить реакцию.</p>}
    {bookmark.isError && <p role="alert">Не удалось изменить закладку.</p>}
  </div>;
}
