import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FEED_LIMITS, FEED_REACTIONS, FEED_REPORT_REASONS, formatFeedTime,
  type FeedReaction, type FeedReportReason,
} from "@gafus/types";
import {
  deleteMomentComment, editMomentComment, setMomentCommentReaction,
  type MomentComment,
} from "./momentsApi";
import { feedClient } from "./feedClient";
import { MomentCommentAvatar } from "./MomentCommentAvatar";
import { MomentMediaGallery } from "./MomentMediaGallery";
import { MomentCommentMediaProcessing } from "./MomentCommentMediaProcessing";
import { RouteLink, momentProfilePath } from "../../shared/router/location";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { AuthUser } from "../../shared/auth/authApi";
import {PrimaryButton,SecondaryButton} from "../../shared/ui";

export type ReplyTarget = { id: string; name: string };

type MomentCommentProps = {
  comment: MomentComment;
  postId: string;
  userId: string;
  rootId: string;
  onReply: (target: ReplyTarget) => void;
};

export function MomentCommentCard(props: MomentCommentProps) {
  return <MomentCommentTarget key={JSON.stringify([
    props.userId, props.postId, props.rootId, props.comment.id,
  ])} {...props} />;
}

function MomentCommentTarget({ comment, postId, userId, rootId, onReply }: MomentCommentProps) {
  const writeFlight = useRef(false);
  const active = useRef(true);
  // The same server comment can render in root and nested threads at once.
  const editorId = useId();
  const fieldId = `edit-moment-comment-${editorId}`;
  const errorId = `${fieldId}-error`;
  const formRef = useRef<HTMLFormElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreTriggerFocus = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<FeedReportReason>("spam");
  const [reportComment, setReportComment] = useState("");
  const [reportSent, setReportSent] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportProblem, setReportProblem] = useState("");
  const reportFlight = useRef(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.text);
  useEffect(() => {
    if (!active.current) return;
    if (editing) {
      fieldRef.current?.focus();
    } else if (restoreTriggerFocus.current) {
      restoreTriggerFocus.current = false;
      editTriggerRef.current?.focus();
    }
  }, [editing]);
  const cache = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["moments", "comments", userId, postId] }),
      cache.invalidateQueries({ queryKey: ["moments", "replies", userId, postId, rootId] }),
      cache.invalidateQueries({ queryKey: ["moments", "post", userId, postId] }),
      cache.invalidateQueries({ queryKey: ["moments", "list", userId] }),
    ]);
  };
  const edit = useMutation({
    mutationFn: (submittedText: string) => editMomentComment(comment.id, submittedText),
    onSuccess: async () => {
      await refresh();
      if (active.current) {
        // Restore only when focus still belonged to this editor. No focus steal
        // from another comment, a retired owner, or a user tabbing elsewhere.
        restoreTriggerFocus.current = !!formRef.current?.contains(document.activeElement);
        setEditing(false);
      }
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteMomentComment(comment.id),
    onSuccess: refresh,
  });
  const reaction = useMutation({
    mutationFn: (emoji: FeedReaction | null) => setMomentCommentReaction(comment.id, emoji),
    onSuccess: refresh,
  });
  const busy = edit.isPending || remove.isPending || reaction.isPending;
  // Only a verified current actor and public username are used. Never retain
  // internal author IDs, emails or moderation fields in the shared comment cache.
  const reportEligibleNow = () => {
    const actor = cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY);
    return !comment.deleted && actor?.id === userId &&
      typeof actor.username === "string" && actor.username.length > 0 &&
      actor.username !== comment.username;
  };
  const canReport = reportEligibleNow();
  const submitReport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canReport || !reportEligibleNow() || reportBusy || reportFlight.current || reportSent ||
        !!reportProblem || reportComment.length > 1000 || !active.current) return;
    reportFlight.current = true;
    setReportBusy(true);
    setReportProblem("");
    void (async () => {
      const result = await feedClient.report("comment", comment.id, {
        reason: reportReason, comment: reportComment.trim(),
      });
      // Core returns the new report receipt ID, NOT the reported comment ID.
      if (!result || typeof result.id !== "string" ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(result.id))
        throw Error("COMMENT_REPORT_ACK_INVALID");
      if (active.current) {
        setReportSent(true);
        setReportOpen(false);
      }
    })().catch(() => {
      // No API idempotency key for reports: do not offer blind POST retry
      // following an ambiguous response/ACK loss.
      if (active.current) setReportProblem(
        "Не удалось подтвердить жалобу. Обновите комментарии перед повтором.",
      );
    }).finally(() => {
      reportFlight.current = false;
      if (active.current) setReportBusy(false);
    });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!comment.canEdit || busy || writeFlight.current || !text.trim()) return;
    writeFlight.current = true;
    void edit.mutateAsync(text).catch(() => undefined).finally(() => {
      writeFlight.current = false;
    });
  };
  const cancelEditing = () => {
    if (busy || writeFlight.current) return;
    restoreTriggerFocus.current = !!formRef.current?.contains(document.activeElement);
    setEditing(false);
    setText(comment.text);
    edit.reset();
  };
  const confirmDelete = () => {
    if (!comment.canDelete || comment.deleted || busy || writeFlight.current) return;
    writeFlight.current = true;
    if (!window.confirm("Удалить комментарий? Это действие нельзя отменить.")) {
      writeFlight.current = false;
      return;
    }
    void remove.mutateAsync().catch(() => undefined).finally(() => {
      writeFlight.current = false;
    });
  };
  const submitReaction = (emoji: FeedReaction) => {
    // The existing owner edit/delete flight also guards emoji changes: React's
    // pending UI can render after two different commands have already fired.
    if (comment.deleted || busy || writeFlight.current) return;
    writeFlight.current = true;
    const intent = comment.myReaction === emoji ? null : emoji;
    void reaction.mutateAsync(intent).catch(() => undefined).finally(() => {
      writeFlight.current = false;
    });
  };
  const primaryEmoji = comment.myReaction ?? FEED_REACTIONS[0];
  return <div className="moment-comment-card">
    <MomentCommentAvatar commentId={comment.id} username={comment.username} name={comment.authorName} />
    <div className="web4-comment-byline">
      <RouteLink to={momentProfilePath(comment.username)}>{comment.authorName}</RouteLink>
      <time dateTime={comment.createdAt}>
        {formatFeedTime(comment.createdAt)}{comment.editedAt ? " · Изменён" : ""}
      </time>
      {comment.roleBadge && <small>{comment.roleBadge}</small>}
    </div>
    {comment.replyToName &&
      <p className="web4-comment-reply-target">Ответ для {comment.replyToName}</p>}
    {!!(comment.text || comment.deleted) && <p className="web4-comment-body">
      {comment.deleted ? "Комментарий удалён" : comment.text}
    </p>}
    {!comment.deleted && <>
      {(comment.media?.length ?? 0) > 0 && <MomentMediaGallery
        postId={postId} count={comment.media?.length ?? 0} initialMedia={comment.media ?? []} inline />}
      <MomentCommentMediaProcessing count={comment.mediaProcessing ?? 0}
        createdAt={comment.createdAt} />
      {comment.mediaFailed && <p role="alert">Не удалось обработать одно из вложений.</p>}
      <div className="question-controls">
        <button type="button" disabled={busy}
          onClick={() => onReply({ id: comment.id, name: comment.authorName })}>
          Ответить
        </button>
        {(canReport && !reportSent || comment.canEdit && !editing || comment.canDelete) &&
          <details className="moment-comment-more">
            <summary aria-label="Действия с комментарием" title="Действия с комментарием">•••</summary>
            <div className="moment-comment-more-menu">
              {canReport && !reportSent && <button type="button"
                disabled={busy || reportBusy || reportFlight.current || !!reportProblem}
                onClick={() => { if (reportEligibleNow()) setReportOpen(true); }}>Пожаловаться</button>}
              {comment.canEdit && !editing &&
                <button type="button" aria-label="Редактировать комментарий"
                  ref={editTriggerRef} disabled={busy} onClick={() => {
                  if (busy || writeFlight.current) return;
                  setText(comment.text); setEditing(true); edit.reset();
                }}>Изменить</button>}
              {comment.canDelete &&
                <button className="moment-comment-delete-action" type="button"
                  aria-label="Удалить комментарий" disabled={busy}
                  onClick={confirmDelete}>Удалить</button>}
            </div>
          </details>}
      </div>
      {reportOpen && canReport && !reportSent && <form onSubmit={submitReport}
        className="web4-comment-report-form" aria-label="Жалоба на комментарий">
        <label htmlFor={`${editorId}-report-reason`}>Причина
          <select id={`${editorId}-report-reason`} value={reportReason}
            disabled={reportBusy || !!reportProblem}
            onChange={event => setReportReason(event.target.value as FeedReportReason)}>
            {Object.entries(FEED_REPORT_REASONS).map(([reason, label]) =>
              <option key={reason} value={reason}>{label}</option>)}
          </select>
        </label>
        <label htmlFor={`${editorId}-report-comment`}>Комментарий (необязательно)
          <textarea id={`${editorId}-report-comment`} maxLength={1000}
            value={reportComment} disabled={reportBusy || !!reportProblem}
            onChange={event => setReportComment(event.target.value)} />
        </label>
        <div className="web4-comment-report-buttons">
          <PrimaryButton type="submit" disabled={reportBusy || !!reportProblem}>
            {reportBusy ? "Отправляем…" : "Отправить жалобу"}
          </PrimaryButton>
          <SecondaryButton variant="red" type="button" disabled={reportBusy} onClick={() => setReportOpen(false)}>
            Отмена
          </SecondaryButton>
        </div>
      </form>}
      {reportSent && <p role="status">Жалоба отправлена на рассмотрение.</p>}
      {reportProblem && <p role="alert">{reportProblem}</p>}
      {editing && comment.canEdit && <form ref={formRef} onSubmit={submit}
        aria-label="Редактирование комментария">
        <label htmlFor={fieldId}>Текст комментария</label>
        <textarea ref={fieldRef} id={fieldId} name="comment-text" value={text} required rows={3}
          maxLength={FEED_LIMITS.commentCharacters}
          aria-invalid={edit.isError || undefined}
          aria-describedby={edit.isError ? errorId : undefined}
          onChange={event => setText(event.target.value)} />
        <PrimaryButton type="submit" disabled={busy}>
          {edit.isPending ? "Сохраняем…" : "Сохранить"}
        </PrimaryButton>
        <SecondaryButton variant="red" type="button" disabled={busy} onClick={cancelEditing}>Отмена</SecondaryButton>
      </form>}
      <div className="question-controls" role="group" aria-label="Реакции комментария">
        <button type="button" className="moment-comment-primary-reaction"
          aria-label={"Реакция комментария " + primaryEmoji}
          aria-pressed={comment.myReaction === primaryEmoji} disabled={busy}
          onClick={() => submitReaction(primaryEmoji)}>
          {primaryEmoji} {comment.reactions.find(item => item.emoji === primaryEmoji)?.count || ""}
        </button>
        <details className="moment-comment-reaction-picker">
          <summary aria-label="Другие реакции" title="Другие реакции">+</summary>
          <div className="moment-comment-reaction-options">
            {FEED_REACTIONS.filter(emoji => emoji !== primaryEmoji).map(emoji =>
              <button type="button" key={emoji}
                aria-label={"Реакция комментария " + emoji}
                aria-pressed={comment.myReaction === emoji} disabled={busy}
                onClick={() => submitReaction(emoji)}>
                {emoji} {comment.reactions.find(item => item.emoji === emoji)?.count || ""}
              </button>)}
          </div>
        </details>
      </div>
    </>}
    {edit.isError && <p id={errorId} role="alert">Не удалось изменить комментарий.</p>}
    {remove.isError && <p role="alert">Не удалось удалить комментарий.</p>}
    {reaction.isError && <p role="alert">Не удалось изменить реакцию.</p>}
  </div>;
}
