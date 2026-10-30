import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FEED_REPORT_REASONS, type FeedReportReason } from
  "@gafus/types";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { AuthUser } from "../../shared/auth/authApi";
import { ApiError } from "../../shared/api/client";
import { navigate } from "../../shared/router/location";
import { feedClient } from "./feedClient";
import styles from "../../brand/LegacyFeedCard.module.css";
import menuStyles from "./MomentPostMenu.module.css";
import { SecondaryButton } from "../../shared/ui";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
type Access = { authorId: string; canDelete: boolean; notify: boolean; hidden: boolean };

/** Never put raw author IDs, moderation notes or signed URLs into shared Query cache. */
async function loadAccess(postId: string, username: string): Promise<Access> {
  if (!ID.test(postId)) throw Error("INVALID_POST_ID");
  const post = await feedClient.getPost(postId);
  if (post?.id !== postId || post.status !== "published" ||
      !ID.test(post.author?.id ?? "") || post.author.username !== username ||
      typeof post.canDelete !== "boolean") {
    throw Error("INVALID_POST_ACTION_ACCESS");
  }
  return {
    authorId: post.author.id, canDelete: post.canDelete,
    notify: post.authorNotify === true, hidden: post.authorHidden === true,
  };
}

export function MomentPostMenu({ postId, username, userId }: {
  postId: string; username: string; userId: string;
}) {
  const cache = useQueryClient();
  const [access, setAccess] = useState<Access | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState<FeedReportReason>("spam");
  const [comment, setComment] = useState("");
  const [reportSent, setReportSent] = useState(false);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const flight = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const retired = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = cache.getQueryCache().subscribe(event => {
      if (event.query.queryKey.length !== CURRENT_USER_QUERY_KEY.length ||
          !event.query.queryKey.every(
            (part: unknown, i: number) => part === CURRENT_USER_QUERY_KEY[i],
          )) return;
      if (cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id !== userId)
        retired.current = true;
    });
    return () => { mounted.current = false; unsubscribe(); };
  }, [cache, userId]);
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setOpen(false);
        setAccess(null);
        setReport(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        setAccess(null);
        setReport(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const alive = () => mounted.current && !retired.current &&
    cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id === userId;
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["moments", "list", userId] }),
      cache.invalidateQueries({ queryKey: ["moments", "post", userId, postId] }),
      cache.invalidateQueries({ queryKey: ["moments", "saved", userId] }),
      cache.invalidateQueries({ queryKey: ["moments", "profile", userId] }),
      cache.invalidateQueries({ queryKey: ["moments", "hidden-authors"] }),
    ]);
  };

  async function showMenu() {
    if (flight.current || !alive()) return;
    if (open) { setOpen(false); setAccess(null); setReport(false); return; }
    flight.current = true;
    setBusy(true);
    setProblem("");
    setAccess(null);
    try {
      const result = await loadAccess(postId, username);
      if (alive()) { setAccess(result); setOpen(true); setMessage(""); }
    } catch {
      if (alive()) setProblem("Не удалось проверить доступ к действиям публикации.");
    } finally {
      flight.current = false;
      if (alive()) setBusy(false);
    }
  }

  async function mutate(action: () => Promise<void>) {
    if (flight.current || !alive() || !access) return;
    flight.current = true;
    setBusy(true);
    setProblem("");
    setMessage("");
    try {
      await action();
    } catch {
      if (alive()) setProblem(
        "Не удалось подтвердить действие. Обновите публикацию перед повтором.",
      );
    } finally {
      flight.current = false;
      if (alive()) setBusy(false);
    }
  }

  const changePreference = (field: "hidden" | "notify", value: boolean) => {
    if (!access || access.canDelete) return;
    const previous = access;
    void mutate(async () => {
      const ack = await feedClient.setAuthorPreference(previous.authorId,
        { [field]: value });
      if (ack?.[field] !== value) throw Error("INVALID_AUTHOR_PREFERENCE_ACK");
      // Confirm the current post's visible preference independently.
      const confirmed = await loadAccess(postId, username);
      if (confirmed[field] !== value) throw Error("PREFERENCE_NOT_CONFIRMED");
      if (!alive()) return;
      setAccess(confirmed);
      setMessage(field === "hidden"
        ? (value ? "Публикации автора скрыты." : "Публикации автора снова видны.")
        : (value ? "Уведомления об авторе включены." : "Уведомления об авторе отключены."));
      await refresh();
    });
  };

  const deletePost = () => {
    if (!access?.canDelete || !alive() ||
        !window.confirm("Удалить публикацию без возможности восстановления? Фото и видео также будут удалены.")) return;
    void mutate(async () => {
      const ack = await feedClient.deletePost(postId);
      if (ack?.id !== postId) throw Error("INVALID_DELETE_ACK");
      // 404 on a fresh GET is the only positive proof of completed deletion.
      try {
        await feedClient.getPost(postId);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          if (alive()) {
            setOpen(false);
            setAccess(null);
            await refresh();
            if (window.location.pathname === "/moments/" + postId ||
                window.location.pathname === "/feed/" + postId) navigate("/moments");
          }
          return;
        }
        throw e;
      }
      throw Error("DELETE_NOT_CONFIRMED");
    });
  };

  const submitReport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!access || access.canDelete || reportSent || comment.length > 1000) return;
    void mutate(async () => {
      const ack = await feedClient.report("post", postId, { reason, comment });
      if (!ID.test(ack?.id ?? "")) throw Error("INVALID_REPORT_ACK");
      if (!alive()) return;
      setReportSent(true);
      setMessage("Жалоба отправлена на рассмотрение.");
    });
  };

  if (!ID.test(postId)) return null;
  return <div ref={root} className={styles.postActionControls}>
    <button type="button" ref={trigger} className={styles.menuTrigger}
      aria-label="Действия с публикацией" aria-expanded={open}
      disabled={busy || retired.current} onClick={() => void showMenu()}>
      {busy && !open ? "Проверяем…" : "⋯"}
    </button>
    {problem && <p className={styles.feedbackMessage} role="alert">{problem}</p>}
    {message && <p className={styles.feedbackMessage} role="status">{message}</p>}
    {open && access && alive() && <div role="group" aria-label="Действия с публикацией"
      className={styles.menuPanel}>
      <button type="button" className={styles.menuItem} disabled={busy}
        onClick={() => void (async () => {
          try {
            if (!alive() || !navigator.clipboard?.writeText) throw Error("NO_CLIPBOARD");
            await navigator.clipboard.writeText(
              window.location.origin + "/moments/" + postId,
            );
            if (alive()) { setProblem(""); setMessage("Ссылка скопирована."); }
          } catch {
            if (alive()) setProblem("Не удалось скопировать ссылку.");
          }
        })()}>
        Скопировать ссылку
      </button>
      {access.canDelete ? (
        <SecondaryButton variant="red" type="button" className={styles.menuItem + " " + styles.menuDanger} disabled={busy}
          onClick={deletePost}>Удалить публикацию</SecondaryButton>
      ) : <>
        <button type="button" className={styles.menuItem} disabled={busy}
          onClick={() => changePreference("notify", !access.notify)}>
          {access.notify ? "Не уведомлять о постах" : "Уведомлять о постах"}
        </button>
        <button type="button" className={styles.menuItem} disabled={busy}
          onClick={() => changePreference("hidden", !access.hidden)}>
          {access.hidden ? "Отменить скрытие автора" : "Скрыть автора"}
        </button>
        <button type="button" className={styles.menuItem} disabled={busy}
          onClick={() => void mutate(async () => {
            const ack = await feedClient.setPostFeedback(postId);
            if (ack?.saved !== true) throw Error("INVALID_NOT_INTERESTED_ACK");
            if (!alive()) return;
            setMessage("Эта публикация больше не будет появляться в рекомендациях.");
            setOpen(false);
            await refresh();
          })}>
          Не интересно
        </button>
        <button type="button" className={styles.menuItem}
          disabled={busy} onClick={() => setReport(true)}>
          Пожаловаться
        </button>
      </>}
      {report && !access.canDelete && <form onSubmit={submitReport} aria-label="Жалоба"
        className={menuStyles.reportForm}>
        <label>Причина
          <select value={reason} disabled={busy || reportSent}
            onChange={event => setReason(event.target.value as FeedReportReason)}>
            {Object.entries(FEED_REPORT_REASONS).map(([key, label]) =>
              <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label>Комментарий (необязательно)
          <textarea value={comment} maxLength={1000} disabled={busy || reportSent}
            onChange={event => setComment(event.target.value)} />
        </label>
        {!reportSent && <button type="submit" disabled={busy}>
          Отправить жалобу
        </button>}
        <SecondaryButton variant="red" type="button" disabled={busy}
          onClick={() => setReport(false)}>Закрыть жалобу</SecondaryButton>
      </form>}
    </div>}
  </div>;
}
