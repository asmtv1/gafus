import {
  createFeedClient,
  type FeedCommentInput,
  type FeedRevisionInput,
  type FeedPublishInput,
  type FeedReaction,
  type FeedReportReason,
  type FeedTransport,
} from "@gafus/types";
import { apiClient } from "./client";

export const feedTransport: FeedTransport = async <T>(
  path: string,
  options: Parameters<FeedTransport>[1] = {},
): Promise<T> => {
  const response = await apiClient<T>(`/api/v1/feed/${path}`, {
    ...options,
    suppressSubscriptionPaywall: true,
  });
  if (!response.success || response.data === undefined) {
    const error = new Error(response.error ?? "Не удалось загрузить «Моменты»") as Error & {
      code?: string;
    };
    error.code = response.code;
    throw error;
  }
  return response.data;
};
export const feedApi = createFeedClient(feedTransport);

/** Existing edit-only revision PUT with native actor epoch guard and no refresh replay. */
export function feedSaveRevisionGuarded(
  postId: string,
  body: FeedRevisionInput,
  requestGuard: () => boolean,
) {
  const client = createFeedClient(
    async <T>(path: string, options: Parameters<FeedTransport>[1] = {}) => {
      if (!requestGuard()) throw new Error("FEED_EDIT_REVISION_SESSION_CHANGED");
      const response = await apiClient<T>(`/api/v1/feed/${path}`, {
        ...options,
        requestGuard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      });
      if (!requestGuard()) throw new Error("FEED_EDIT_REVISION_SESSION_CHANGED");
      if (!response.success || response.data === undefined)
        throw new Error("FEED_EDIT_REVISION_UNCONFIRMED");
      return response.data;
    },
  );
  return client.saveRevision(postId, body);
}

/** Existing edit-only publish POST; ACK may be accepted pending, not live immediately. */
export function feedPublishPostGuarded(
  postId: string,
  body: FeedPublishInput,
  requestGuard: () => boolean,
) {
  const client = createFeedClient(
    async <T>(path: string, options: Parameters<FeedTransport>[1] = {}) => {
      if (!requestGuard()) throw new Error("FEED_EDIT_PUBLISH_SESSION_CHANGED");
      const response = await apiClient<T>(`/api/v1/feed/${path}`, {
        ...options,
        requestGuard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      });
      if (!requestGuard()) throw new Error("FEED_EDIT_PUBLISH_SESSION_CHANGED");
      if (!response.success || response.data === undefined)
        throw new Error("FEED_EDIT_PUBLISH_UNCONFIRMED");
      return response.data;
    },
  );
  return client.publishPost(postId, body);
}

/** Existing typed comment POST with a verified request actor. No refresh replay after uncertainty. */
export function feedCreateCommentGuarded(
  postId: string,
  body: FeedCommentInput,
  requestGuard: () => boolean,
) {
  const client = createFeedClient(
    async <T>(path: string, options: Parameters<FeedTransport>[1] = {}) => {
      if (!requestGuard()) throw new Error("FEED_CREATE_COMMENT_SESSION_CHANGED");
      const response = await apiClient<T>(`/api/v1/feed/${path}`, {
        ...options,
        requestGuard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      });
      if (!requestGuard()) throw new Error("FEED_CREATE_COMMENT_SESSION_CHANGED");
      if (!response.success || response.data === undefined)
        throw new Error("FEED_CREATE_COMMENT_RESULT_UNCONFIRMED");
      return response.data;
    },
  );
  return client.createComment(postId, body);
}

/** Existing post-reaction PUT/DELETE, fenced to a verified native actor epoch. */
export function feedPostReactionGuarded(
  postId: string,
  reaction: FeedReaction | null,
  requestGuard: () => boolean,
) {
  const client = createFeedClient(
    async <T>(path: string, options: Parameters<FeedTransport>[1] = {}) => {
      if (!requestGuard()) throw new Error("FEED_POST_REACTION_SESSION_CHANGED");
      const response = await apiClient<T>(`/api/v1/feed/${path}`, {
        ...options,
        requestGuard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      });
      if (!requestGuard()) throw new Error("FEED_POST_REACTION_SESSION_CHANGED");
      if (!response.success || response.data === undefined)
        throw new Error("FEED_POST_REACTION_UNCONFIRMED");
      return response.data;
    },
  );
  return reaction === null
    ? client.removePostReaction(postId)
    : client.setPostReaction(postId, reaction);
}

/** Current typed Comment reaction PUT/DELETE, no replay after ambiguous response. */
export function feedCommentReactionGuarded(
  commentId: string,
  reaction: FeedReaction | null,
  requestGuard: () => boolean,
) {
  const client = createFeedClient(
    async <T>(path: string, options: Parameters<FeedTransport>[1] = {}) => {
      if (!requestGuard()) throw new Error("FEED_COMMENT_REACTION_SESSION_CHANGED");
      const response = await apiClient<T>(`/api/v1/feed/${path}`, {
        ...options,
        requestGuard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      });
      if (!requestGuard()) throw new Error("FEED_COMMENT_REACTION_SESSION_CHANGED");
      if (!response.success || response.data === undefined)
        throw new Error("FEED_COMMENT_REACTION_UNCONFIRMED");
      return response.data;
    },
  );
  return reaction === null
    ? client.removeCommentReaction(commentId)
    : client.setCommentReaction(commentId, reaction);
}

/** Existing typed Comment PATCH, never replay an uncertain owner write on 401. */
export function feedEditCommentGuarded(
  commentId: string,
  body: { text: string },
  requestGuard: () => boolean,
) {
  const client = createFeedClient(
    async <T>(path: string, options: Parameters<FeedTransport>[1] = {}) => {
      if (!requestGuard()) throw new Error("FEED_COMMENT_EDIT_SESSION_CHANGED");
      const response = await apiClient<T>(`/api/v1/feed/${path}`, {
        ...options,
        requestGuard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      });
      if (!requestGuard()) throw new Error("FEED_COMMENT_EDIT_SESSION_CHANGED");
      if (!response.success || response.data === undefined)
        throw new Error("FEED_COMMENT_EDIT_UNCONFIRMED");
      return response.data;
    },
  );
  return client.editComment(commentId, body);
}

/** Existing typed Comment DELETE, never replay an uncertain owner write on 401. */
export function feedDeleteCommentGuarded(
  commentId: string,
  requestGuard: () => boolean,
): Promise<{ id: string }> {
  const client = createFeedClient(
    async <T>(path: string, options: Parameters<FeedTransport>[1] = {}) => {
      if (!requestGuard()) throw new Error("FEED_COMMENT_DELETE_SESSION_CHANGED");
      const response = await apiClient<T>(`/api/v1/feed/${path}`, {
        ...options,
        requestGuard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      });
      if (!requestGuard()) throw new Error("FEED_COMMENT_DELETE_SESSION_CHANGED");
      if (!response.success || response.data === undefined)
        throw new Error("FEED_COMMENT_DELETE_UNCONFIRMED");
      return response.data;
    },
  );
  return client.deleteComment(commentId);
}

/** Owner-only existing Feed post DELETE with native actor/epoch guard, no 401 replay. */
export function feedDeletePostGuarded(
  postId: string,
  requestGuard: () => boolean,
): Promise<{ id: string }> {
  const client = createFeedClient(
    async <T>(path: string, options: Parameters<FeedTransport>[1] = {}) => {
      if (!requestGuard()) throw new Error("FEED_DELETE_SESSION_CHANGED");
      const response = await apiClient<T>(`/api/v1/feed/${path}`, {
        ...options,
        requestGuard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      });
      if (!requestGuard()) throw new Error("FEED_DELETE_SESSION_CHANGED");
      if (!response.success || response.data === undefined)
        throw new Error("FEED_DELETE_RESULT_UNCONFIRMED");
      return response.data;
    },
  );
  return client.deletePost(postId);
}

/** Existing not_interested feedback POST, fenced to one verified native actor epoch. */
export function feedPostFeedbackGuarded(
  postId: string,
  requestGuard: () => boolean,
): Promise<{ saved: boolean }> {
  const client = createFeedClient(
    async <T>(path: string, options: Parameters<FeedTransport>[1] = {}) => {
      if (!requestGuard()) throw new Error("FEED_FEEDBACK_SESSION_CHANGED");
      const response = await apiClient<T>(`/api/v1/feed/${path}`, {
        ...options,
        requestGuard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      });
      if (!requestGuard()) throw new Error("FEED_FEEDBACK_SESSION_CHANGED");
      if (!response.success || response.data === undefined)
        throw new Error("FEED_FEEDBACK_RESULT_UNCONFIRMED");
      return response.data;
    },
  );
  return client.setPostFeedback(postId);
}

/** Existing Feed bookmark PUT/DELETE under one verified Mobile principal+epoch. */
export function feedBookmarkGuarded(
  postId: string,
  saved: boolean,
  requestGuard: () => boolean,
): Promise<{ saved: boolean }> {
  const client = createFeedClient(
    async <T>(path: string, options: Parameters<FeedTransport>[1] = {}) => {
      if (!requestGuard()) throw new Error("FEED_BOOKMARK_SESSION_CHANGED");
      const response = await apiClient<T>(`/api/v1/feed/${path}`, {
        ...options,
        requestGuard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      });
      if (!requestGuard()) throw new Error("FEED_BOOKMARK_SESSION_CHANGED");
      if (!response.success || response.data === undefined)
        throw new Error("FEED_BOOKMARK_RESULT_UNCONFIRMED");
      return response.data;
    },
  );
  return client.setBookmark(postId, saved);
}

/** One actor-scoped PATCH for author visibility/notify: no auth-refresh mutation replay. */
export function feedAuthorPreferenceGuarded(
  authorId: string,
  body: { hidden?: boolean; notify?: boolean },
  requestGuard: () => boolean,
): Promise<{ hidden: boolean; notify: boolean }> {
  const client = createFeedClient(
    async <T>(path: string, options: Parameters<FeedTransport>[1] = {}) => {
      if (!requestGuard()) throw new Error("FEED_AUTHOR_SESSION_CHANGED");
      const response = await apiClient<T>(`/api/v1/feed/${path}`, {
        ...options,
        requestGuard,
        skipAuthRefreshReplay: true,
        suppressSubscriptionPaywall: true,
      });
      if (!requestGuard()) throw new Error("FEED_AUTHOR_SESSION_CHANGED");
      if (!response.success || response.data === undefined)
        throw new Error("FEED_AUTHOR_RESULT_UNCONFIRMED");
      return response.data;
    },
  );
  return client.setAuthorPreference(authorId, body);
}

/** Existing report route with native requestGuard: never replay a session-ambiguous POST. */
export function feedReportGuarded(
  type: "post" | "comment",
  id: string,
  body: { reason: FeedReportReason; comment?: string },
  requestGuard: () => boolean,
): Promise<{ id: string }> {
  const client = createFeedClient(
    async <T>(path: string, options: Parameters<FeedTransport>[1] = {}) => {
      if (!requestGuard()) throw new Error("FEED_REPORT_SESSION_CHANGED");
      const response = await apiClient<T>(`/api/v1/feed/${path}`, {
        ...options,
        suppressSubscriptionPaywall: true,
        skipAuthRefreshReplay: true,
        requestGuard,
      });
      if (!requestGuard()) throw new Error("FEED_REPORT_SESSION_CHANGED");
      if (!response.success || response.data === undefined)
        throw new Error("FEED_REPORT_UNCONFIRMED");
      return response.data;
    },
  );
  return client.report(type, id, body);
}
