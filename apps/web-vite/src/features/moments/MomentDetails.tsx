import { Loading } from "../../shared/ui";
import { BackButtonLink, PrimaryButton } from "../../shared/ui";
import { useQuery } from "@tanstack/react-query";
import { formatFeedTime } from "@gafus/types";
import { getMoment, getMomentsStatus } from "./momentsApi";
import { RouteLink, momentProfilePath, useRouteSearch } from "../../shared/router/location";
import { isSafeMomentUsername } from "./momentsApi";
import { MomentAuthorAvatar } from "./MomentAuthorAvatar";
import { MomentActions } from "./MomentActions";
import { MomentPostMenu } from "./MomentPostMenu";
import menuStyles from "./MomentPostMenu.module.css";
import styles from "../../brand/LegacyFeedCard.module.css";
import { MomentComments } from "./MomentComments";
import { focusedMomentCommentId } from "./postDetailReadApi";
export { focusedMomentCommentId } from "./postDetailReadApi";
import { MomentMediaGallery } from "./MomentMediaGallery";
import { MomentPoll } from "./MomentPoll";
import { MomentEditPublishedText } from "./MomentEditPublishedText";
import { ApiError } from "../../shared/api/client";
import "./web4-social-visual-parity.css";
import "./moment-detail-refresh.css";
// Loaded last so compact comments override legacy Next geometry, not unrelated pages.
import "./moment-comments-minimal.css";
import "./moment-comment-composer.css";

export function MomentDetails({ userId, postId }: { userId: string; postId: string }) {
  const search = useRouteSearch();
  const focusedCommentId = focusedMomentCommentId(search);
  const status = useQuery({
    queryKey: ["moments", "status", userId],
    queryFn: getMomentsStatus,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  // Cached rollout status is not current authorization for a post GET.
  const statusReady = status.isSuccess && !status.isFetching;
  const post = useQuery({
    queryKey: ["moments", "post", userId, postId],
    queryFn: () => getMoment(postId),
    enabled: statusReady && status.data.enabled === true,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  // Post data and dependent actions/comments must never mount from old cache.
  const postReady = statusReady && status.data.enabled && post.isSuccess && !post.isFetching;
  const sessionExpired = status.error instanceof ApiError && status.error.status === 401;
  const postExpired = post.error instanceof ApiError && post.error.status === 401;
  const postForbidden = post.error instanceof ApiError && post.error.status === 403;
  const postMissing = post.error instanceof ApiError && post.error.status === 404;
  return (
    <section className="collection-section moment-detail-section web4-moment-detail" aria-label="Публикация">
      <p className="moment-detail-back">
        <BackButtonLink to="/moments">К ленте «Моментов»</BackButtonLink>
      </p>
      {status.isPending && <Loading message="Проверяем доступ…" />}
      {status.isFetching && status.data && <Loading variant="compact" message="Перепроверяем доступ…" />}
      {status.isError && (
        <div role="alert">
          <p>
            {sessionExpired
              ? "Сессия завершена. Войдите снова."
              : "Не удалось проверить доступность."}
          </p>
          {sessionExpired ? (
            <RouteLink to="/login">Войти</RouteLink>
          ) : (
            <PrimaryButton type="button" onClick={() => void status.refetch()}>
              Повторить проверку
            </PrimaryButton>
          )}
        </div>
      )}
      {statusReady && !status.data.enabled && <p role="alert">Моменты сейчас недоступны.</p>}
      {statusReady && status.data.enabled && (
        <>
          {post.isPending && <Loading message="Загружаем публикацию…" />}
          {post.isFetching && post.data && <Loading variant="compact" message="Перепроверяем публикацию…" />}
          {post.isError && (
            <div role="alert">
              <p>
                {postExpired
                  ? "Сессия завершена. Войдите снова."
                  : "Публикация недоступна или была удалена."}
              </p>
              {postExpired ? (
                <RouteLink to="/login">Войти</RouteLink>
              ) : (
                !postForbidden &&
                !postMissing && (
                  <PrimaryButton type="button" onClick={() => void post.refetch()}>
                    Повторить
                  </PrimaryButton>
                )
              )}
            </div>
          )}
          {postReady && (
            <div className="web4-moment-post-and-comments">
              <article className="web4-moment-detail-card moment-detail-post">
                <header className={[styles.postMeta, menuStyles.postMetaWithActions,
                  "web4-moment-compact-author", "moment-detail-author"].join(" ")}>
                  <MomentAuthorAvatar postId={post.data.id}
                    username={post.data.username} name={post.data.authorName} />
                  <div className="web4-moment-author-identity">
                    <h2>{isSafeMomentUsername(post.data.username) ?
                      <RouteLink to={momentProfilePath(post.data.username)}>
                        {post.data.authorName}
                      </RouteLink> : post.data.authorName}</h2>
                    <div className="moment-detail-author-meta">
                      {isSafeMomentUsername(post.data.username) ?
                        <RouteLink to={momentProfilePath(post.data.username)}>
                          @{post.data.username}
                        </RouteLink> : <span>@{post.data.username}</span>}
                      <span className="moment-detail-meta-divider" aria-hidden="true">·</span>
                      <time dateTime={post.data.publishedAt ?? post.data.createdAt}>
                        {formatFeedTime(post.data.publishedAt ?? post.data.createdAt)}
                      </time>
                    </div>
                    {post.data.roleBadge && <span className="moment-detail-author-role">
                      {post.data.roleBadge}
                    </span>}
                  </div>
                  <MomentPostMenu postId={post.data.id} username={post.data.username}
                    userId={userId} />
                </header>
                {post.data.text && !(post.data.hasPoll && post.data.text === "Опрос") &&
                  <div className="moment-detail-text">
                    <p className="article-plain-text">{post.data.text}</p>
                  </div>}
                {post.data.canEdit && <div className="moment-detail-edit">
                  <MomentEditPublishedText userId={userId} postId={postId} />
                </div>}
                <MomentMediaGallery key={post.data.id} postId={post.data.id}
                  count={post.data.media.length} inline />
                {post.data.hasPoll && <div className="moment-detail-poll">
                  <MomentPoll userId={userId} postId={postId} />
                </div>}
                <div className="moment-detail-engagement">
                  <div className="moment-detail-stats" aria-label="Активность публикации">
                    <span>{post.data.reactions.reduce((total, row) =>
                      total + row.count, 0)} реакций</span>
                    <span>{post.data.commentCount} комментариев</span>
                    <span>{post.data.viewCount} просмотров</span>
                  </div>
                  <MomentActions userId={userId} post={post.data} compact
                    commentHref={"#moment-comments-" + post.data.id} />
                </div>
              </article>
              <MomentComments userId={userId} postId={postId} focusedCommentId={focusedCommentId} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
