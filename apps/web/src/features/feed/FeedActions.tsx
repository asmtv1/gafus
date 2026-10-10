"use client";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FEED_REPORT_REASONS, type FeedPostDto, type FeedReportReason } from "@gafus/types";
import { feedApi } from "./api";
import styles from "./Feed.module.css";

export function FeedReportForm({ type, id, onClose }: { type: "post" | "comment"; id: string; onClose: () => void }) {
  const [reason, setReason] = useState<FeedReportReason>("spam");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  return <form className={styles.reportForm} aria-label="Жалоба" onSubmit={async event => {
    event.preventDefault(); if (busy || sent) return;
    setBusy(true); setMessage("");
    try { await feedApi.report(type, id, { reason, comment }); setSent(true); setMessage("Жалоба отправлена на рассмотрение. Спасибо."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось отправить жалобу. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }}>
    <h3>Пожаловаться</h3>
    {!sent && <><label>Причина<select className={styles.input} value={reason} onChange={event => setReason(event.target.value as FeedReportReason)}>
      {Object.entries(FEED_REPORT_REASONS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
    </select></label>
    <label>Комментарий (необязательно)<textarea className={styles.input} maxLength={1000} value={comment} onChange={event => setComment(event.target.value)} /></label>
    <button className={styles.primary} disabled={busy} type="submit">{busy ? "Отправляем…" : "Отправить жалобу"}</button></>}
    {message && <p role={sent ? "status" : "alert"}>{message}</p>}
    <button className={styles.textButton} type="button" disabled={busy} onClick={onClose}>{sent ? "Закрыть" : "Отмена"}</button>
  </form>;
}

export function FeedActions({ post }: { post: FeedPostDto }) {
  const cache = useQueryClient();
  const menu = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [report, setReport] = useState(false);
  const [undo, setUndo] = useState(false);
  async function run(action: () => Promise<unknown>, text: string) {
    if (busy) return;
    setBusy(true); setMessage("");
    try { await action(); if (menu.current) menu.current.open = false; setMessage(text); await cache.invalidateQueries({ queryKey: ["feed"] }); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось выполнить действие."); }
    finally { setBusy(false); }
  }
  return <div className={styles.postActions}>
    <details ref={menu}><summary aria-label="Действия с публикацией">Действия</summary>
      <div className={styles.postActionList}>
        <button type="button" disabled={busy} onClick={() => void run(() => feedApi.setBookmark(post.id, !post.bookmarked), post.bookmarked ? "Публикация убрана из закладок" : "Публикация сохранена")}>{post.bookmarked ? "Убрать из закладок" : "Сохранить в закладках"}</button>
        {!post.canDelete && <button type="button" disabled={busy} onClick={() => void run(() => feedApi.setAuthorPreference(post.author.id, { notify: !post.authorNotify }), post.authorNotify ? "Уведомления об авторе отключены" : "Подписка включена. Разрешите push в настройках уведомлений, чтобы получать новые посты.")}>{post.authorNotify ? "Не уведомлять о постах" : "Уведомлять о постах"}</button>}
        <button type="button" disabled={busy} onClick={() => void run(() => navigator.clipboard.writeText(`${window.location.origin}/feed/${encodeURIComponent(post.id)}`), "Ссылка скопирована")}>Скопировать ссылку</button>
        {!post.canDelete && <><button type="button" disabled={busy} onClick={() => {
          setUndo(true); void run(async () => { await feedApi.setAuthorPreference(post.author.id, { hidden: true }); window.dispatchEvent(new CustomEvent("feed-author-hidden", { detail: post.author })); }, "Все публикации автора скрыты из вашей ленты");
        }}>Не интересно</button>
        <button type="button" disabled={busy} onClick={() => { if (menu.current) menu.current.open = false; setReport(true); }}>Пожаловаться</button></>}
      </div>
    </details>
    {message && <p role="status">{message}</p>}
    {undo && <button className={styles.textButton} disabled={busy} type="button" onClick={() => void run(() => feedApi.setAuthorPreference(post.author.id, { hidden: false }), "Публикации автора возвращены в ленту")}>Отменить скрытие</button>}
    {report && <FeedReportForm type="post" id={post.id} onClose={() => setReport(false)} />}
  </div>;
}
