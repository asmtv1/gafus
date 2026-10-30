import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { formatFeedTime } from "@gafus/types";
import type { MomentItem } from "./momentsApi";
import { MomentAuthorAvatar } from "./MomentAuthorAvatar";
import { MomentActions } from "./MomentActions";
import { Loading } from "../../shared/ui";
import { MomentPostMenu } from "./MomentPostMenu";
import menuStyles from "./MomentPostMenu.module.css";
import { MomentMediaGallery } from "./MomentMediaGallery";
import { momentPath, momentProfilePath, RouteLink } from "../../shared/router/location";
import { isSafeMomentUsername } from "./momentsApi";
import styles from "../../brand/LegacyFeedCard.module.css";

// The poll has its own 35 KiB JS module. A video/text-only card must not
// fetch it; a real poll still mounts the existing owner-scoped component.
const DeferredMomentPoll = lazy(() => import("./MomentPoll")
  .then(module => ({ default: module.MomentPoll })));

/** A rejected import is cached by React.lazy: a page reload (not a retry loop)
 * is required. Keep the remainder of the post visible on failure. */
class MomentPollChunkErrorBoundary extends Component<
  { children: ReactNode }, { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="moment-poll" role="alert">
      <p>Не удалось загрузить опрос. Проверьте соединение.</p>
      <button type="button" onClick={() => window.location.reload()}>
        Перезагрузить страницу
      </button>
    </div>;
    return this.props.children;
  }
}

export function MomentSummary({ post, userId }: { post: MomentItem; userId: string }) {
  const [expandedText, setExpandedText] = useState(false);
  const longText = post.text.length > 360;
  return (
    <li className={`${styles.postCard} moment-summary-card`}>
      <div className={[styles.postMeta, menuStyles.postMetaWithActions,
        "web4-moment-compact-author"].join(" ")}>
        <MomentAuthorAvatar postId={post.id} username={post.username}
          name={post.authorName} />
        <div className="web4-moment-author-identity">
        <h3><RouteLink to={momentPath(post.id)}>{post.authorName}</RouteLink></h3>
        <div className="moment-author-subline">
          <small>
            {isSafeMomentUsername(post.username) ? (
              <RouteLink to={momentProfilePath(post.username)}>@{post.username}</RouteLink>
            ) : <>@{post.username}</>}
          </small>
          <span aria-hidden="true">·</span>
          <time className="web4-moment-date" dateTime={post.publishedAt ?? post.createdAt}>
            {formatFeedTime(post.publishedAt ?? post.createdAt)}
          </time>
          {post.roleBadge && <span className="moment-role-badge">{post.roleBadge}</span>}
        </div>
        </div>
        <MomentPostMenu postId={post.id} username={post.username} userId={userId} />
      </div>
      <MomentMediaGallery postId={post.id} count={post.media.length} initialMedia={post.media} autoLoad />
      {post.text && !(post.hasPoll && post.text === "Опрос") &&
        <div className="moment-post-copy">
          <p className="article-plain-text" data-collapsed={longText && !expandedText}>
            {post.text}
          </p>
          {longText && <button className="moment-read-more" type="button"
            aria-expanded={expandedText} onClick={() => setExpandedText(value => !value)}>
            {expandedText ? "Свернуть" : "Читать полностью"}
          </button>}
        </div>}
      {post.hasPoll && <MomentPollChunkErrorBoundary key={userId + ":" + post.id}>
        <Suspense fallback={<Loading variant="compact" message="Загружаем опрос…" />}>
          <DeferredMomentPoll userId={userId} postId={post.id} />
        </Suspense>
      </MomentPollChunkErrorBoundary>}
      <div className="moment-engagement-actions">
        <MomentActions post={post} userId={userId} />
        <RouteLink to={momentPath(post.id)} className="moment-comment-action">
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden="true">
            <path d="M20 11.5a8 8 0 0 1-8 8 8.8 8.8 0 0 1-3.3-.7L4 20l1.2-4.7A8.8 8.8 0 0 1 4 11.5a8 8 0 1 1 16 0Z"/>
          </svg>
          Комментировать
        </RouteLink>
      </div>
      <div className={styles.postStats}>
        <span className={styles.statItem} aria-label={`Просмотры: ${post.viewCount}`}>
          {post.viewCount} просмотров
        </span>
        <RouteLink to={momentPath(post.id)} className={styles.statItem}>
          {post.commentCount} комментариев
        </RouteLink>
      </div>
    </li>
  );
}
