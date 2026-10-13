"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  BookmarkBorderRounded,
  BookmarkRounded,
  ContentCopyRounded,
  DeleteOutlineRounded,
  EditOutlined,
  InfoOutlined,
  MoreHorizRounded,
  NotificationsNoneRounded,
  NotificationsOffOutlined,
  ReportOutlined,
  VisibilityOffOutlined,
} from "@mui/icons-material";
import { reportClientError } from "@gafus/error-handling";
import { useQueryClient } from "@tanstack/react-query";
import { FEED_REPORT_REASONS, type FeedPostDto, type FeedReportReason } from "@gafus/types";
import { PrimaryButton, SecondaryButton, SecondaryButtonLink } from "@/shared/components/ui";
import { feedApi } from "./api";
import styles from "./Feed.module.css";
import cardStyles from "./FeedCard.module.css";

export function FeedReportForm({
  type,
  id,
  onClose,
}: {
  type: "post" | "comment";
  id: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<FeedReportReason>("spam");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <form
      className={styles.reportForm}
      aria-label="Жалоба"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || sent) return;
        setBusy(true);
        setMessage("");
        try {
          await feedApi.report(type, id, { reason, comment });
          setSent(true);
          setMessage("Жалоба отправлена на рассмотрение. Спасибо.");
        } catch (error) {
          reportClientError(error, { issueKey: "FeedActions", keys: { operation: "report" } });
          setMessage(
            error instanceof Error
              ? error.message
              : "Не удалось отправить жалобу. Попробуйте ещё раз.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Пожаловаться</h3>
      {!sent && (
        <>
          <label>
            Причина
            <select
              className={styles.input}
              value={reason}
              onChange={(event) => setReason(event.target.value as FeedReportReason)}
            >
              {Object.entries(FEED_REPORT_REASONS).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Комментарий (необязательно)
            <textarea
              className={styles.input}
              maxLength={1000}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          <PrimaryButton disabled={busy} type="submit">
            {busy ? "Отправляем…" : "Отправить жалобу"}
          </PrimaryButton>
        </>
      )}
      {message && <p role={sent ? "status" : "alert"}>{message}</p>}
      <SecondaryButton type="button" disabled={busy} onClick={onClose}>
        {sent ? "Закрыть" : "Отмена"}
      </SecondaryButton>
    </form>
  );
}

export function FeedActions({ post, onDeleted }: { post: FeedPostDto; onDeleted?: () => void }) {
  const cache = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [report, setReport] = useState(false);
  const [undo, setUndo] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        rootRef.current
          ?.querySelector<HTMLButtonElement>('[aria-label="Действия с публикацией"]')
          ?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  async function run(action: () => Promise<unknown>, text: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMenuOpen(false);
      setMessage(text);
      await cache.invalidateQueries({ queryKey: ["feed"] });
    } catch (error) {
      reportClientError(error, { issueKey: "FeedActions", keys: { operation: "action" } });
      setMessage(error instanceof Error ? error.message : "Не удалось выполнить действие.");
    } finally {
      setBusy(false);
    }
  }

  async function removePost() {
    if (
      busy ||
      !post.canDelete ||
      !window.confirm(
        "Удалить публикацию без возможности восстановления? Её фото и видео также будут удалены из хранилища.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await feedApi.deletePost(post.id);
      setMenuOpen(false);
      void cache.invalidateQueries({ queryKey: ["feed"] });
      onDeleted?.();
    } catch (error) {
      reportClientError(error, { issueKey: "FeedActions", keys: { operation: "delete_post" } });
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось удалить публикацию. Попробуйте ещё раз.",
      );
    } finally {
      setBusy(false);
    }
  }

  const explain = () => {
    const descriptions = {
      same_city: "Автор из вашего города.",
      similar_pet: "У вас похожие питомцы.",
      author_affinity: "Вам интересны публикации этого автора.",
      trending: "Публикация интересна другим пользователям.",
      discovery: "Знакомим вас с новыми авторами.",
    };
    if (post.recommendationReason) setMessage(descriptions[post.recommendationReason]);
    setMenuOpen(false);
  };

  return (
    <div ref={rootRef} className={[styles.postActions, cardStyles.postActionControls].join(" ")}>
      <SecondaryButton
        className={cardStyles.menuTrigger}
        type="button"
        aria-label="Действия с публикацией"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? panelId : undefined}
        title="Действия с публикацией"
        onClick={() => {
          setReport(false);
          setMenuOpen((open) => !open);
        }}
      >
        <MoreHorizRounded aria-hidden="true" />
      </SecondaryButton>
      {menuOpen && (
        <div
          id={panelId}
          className={cardStyles.menuPanel}
          role="group"
          aria-label="Действия с публикацией"
        >
          {post.canEdit && (
            <SecondaryButtonLink
              className={cardStyles.menuItem}
              href={"/feed/create?edit=" + encodeURIComponent(post.id)}
            >
              <EditOutlined aria-hidden="true" /> Изменить публикацию
            </SecondaryButtonLink>
          )}
          <SecondaryButton
            className={cardStyles.menuItem}
            disabled={busy}
            onClick={() =>
              void run(
                () => feedApi.setBookmark(post.id, !post.bookmarked),
                post.bookmarked ? "Публикация убрана из закладок" : "Публикация сохранена",
              )
            }
          >
            {post.bookmarked ? (
              <BookmarkRounded aria-hidden="true" />
            ) : (
              <BookmarkBorderRounded aria-hidden="true" />
            )}
            {post.bookmarked ? "Убрать из закладок" : "Сохранить в закладках"}
          </SecondaryButton>
          <SecondaryButton
            className={cardStyles.menuItem}
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  navigator.clipboard.writeText(
                    window.location.origin + "/feed/" + encodeURIComponent(post.id),
                  ),
                "Ссылка скопирована",
              )
            }
          >
            <ContentCopyRounded aria-hidden="true" /> Скопировать ссылку
          </SecondaryButton>
          {post.canDelete ? (
            <>
              <div className={cardStyles.menuDivider} role="separator" />
              <SecondaryButton
                className={[cardStyles.menuItem, cardStyles.menuDanger].join(" ")}
                variant="red"
                disabled={busy}
                onClick={() => void removePost()}
              >
                <DeleteOutlineRounded aria-hidden="true" />
                {busy ? "Удаляем…" : "Удалить публикацию"}
              </SecondaryButton>
            </>
          ) : (
            <>
              <div className={cardStyles.menuDivider} role="separator" />
              <SecondaryButton
                className={cardStyles.menuItem}
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      feedApi.setAuthorPreference(post.author.id, { notify: !post.authorNotify }),
                    post.authorNotify
                      ? "Уведомления об авторе отключены"
                      : "Подписка включена. Разрешите push в настройках уведомлений, чтобы получать новые посты.",
                  )
                }
              >
                {post.authorNotify ? (
                  <NotificationsOffOutlined aria-hidden="true" />
                ) : (
                  <NotificationsNoneRounded aria-hidden="true" />
                )}
                {post.authorNotify ? "Не уведомлять о постах" : "Уведомлять о постах"}
              </SecondaryButton>
              {post.recommendationReason && (
                <>
                  <SecondaryButton className={cardStyles.menuItem} onClick={explain}>
                    <InfoOutlined aria-hidden="true" /> Почему я вижу эту публикацию?
                  </SecondaryButton>
                  <SecondaryButton
                    className={cardStyles.menuItem}
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => feedApi.setPostFeedback(post.id),
                        "Эта публикация больше не будет появляться в рекомендациях",
                      )
                    }
                  >
                    <VisibilityOffOutlined aria-hidden="true" /> Не интересно
                  </SecondaryButton>
                </>
              )}
              <SecondaryButton
                className={cardStyles.menuItem}
                disabled={busy}
                onClick={() => {
                  setUndo(true);
                  void run(async () => {
                    await feedApi.setAuthorPreference(post.author.id, { hidden: true });
                    window.dispatchEvent(
                      new CustomEvent("feed-author-hidden", { detail: post.author }),
                    );
                  }, "Публикации автора скрыты в разделе «Моменты»");
                }}
              >
                <VisibilityOffOutlined aria-hidden="true" /> Скрыть автора
              </SecondaryButton>
              <SecondaryButton
                className={cardStyles.menuItem}
                disabled={busy}
                onClick={() => {
                  setMenuOpen(false);
                  setReport(true);
                }}
              >
                <ReportOutlined aria-hidden="true" /> Пожаловаться
              </SecondaryButton>
            </>
          )}
        </div>
      )}
      {message && (
        <p className={cardStyles.feedbackMessage} role="status">
          {message}
        </p>
      )}
      {undo && (
        <SecondaryButton
          className={cardStyles.undoButton}
          disabled={busy}
          onClick={() =>
            void run(
              () => feedApi.setAuthorPreference(post.author.id, { hidden: false }),
              "Публикации автора снова видны в «Моментах»",
            )
          }
        >
          Отменить скрытие
        </SecondaryButton>
      )}
      {report && <FeedReportForm type="post" id={post.id} onClose={() => setReport(false)} />}
    </div>
  );
}
