import { z } from "zod/v3";
import { FEED_REPORT_REASONS } from "@gafus/types";
import { FeedError } from "./errors";
import { feedIdSchema, feedListSchema, feedParse } from "./schemas";

export const feedPreferenceSchema = z
  .object({ hidden: z.boolean().optional(), notify: z.boolean().optional() })
  .strict()
  .refine((value) => value.hidden !== undefined || value.notify !== undefined);
export const feedReportSchema = z
  .object({
    reason: z.enum(
      Object.keys(FEED_REPORT_REASONS) as [
        keyof typeof FEED_REPORT_REASONS,
        ...(keyof typeof FEED_REPORT_REASONS)[],
      ],
    ),
    comment: z.string().trim().max(1000).default(""),
  })
  .strict();
export const feedModerationSchema = z
  .object({
    action: z.enum(["dismiss", "hide", "delete", "restore", "block", "unblock"]),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export function assertFeedPublishingAllowed(blocked: boolean | null | undefined) {
  if (blocked)
    throw new FeedError("FORBIDDEN", "Публикации и комментарии ограничены модератором", 403);
}

export function assertFeedModerator(role: string | undefined) {
  if (role !== "ADMIN" && role !== "MODERATOR") throw new FeedError("FORBIDDEN", undefined, 403);
}

export function assertFeedReportable(actorId: string, authorId: string) {
  if (authorId === actorId)
    throw new FeedError("VALIDATION_ERROR", "Нельзя пожаловаться на свой контент", 400);
}

export type FeedReportContent = z.output<typeof feedReportSchema>;
export type FeedModerationDecision = z.output<typeof feedModerationSchema>;

export interface FeedPreferenceOperations {
  readActor(id: string): Promise<{ role: string } | null>;
  removeBookmark(actorId: string, postId: string): Promise<void>;
  saveVisibleBookmark(actorId: string, postId: string): Promise<boolean>;
  saveAuthorPreference(
    actorId: string,
    authorId: string,
    value: z.output<typeof feedPreferenceSchema>,
  ): Promise<{ hidden: boolean; notify: boolean } | null>;
  readHiddenAuthors(
    actorId: string,
    cursor: string | null | undefined,
    take: number,
  ): Promise<
    Array<{
      authorId: string;
      author: {
        id: string;
        username: string;
        profile: { fullName: string | null; avatarUrl: string | null } | null;
      };
    }>
  >;
  submitReport(
    actorId: string,
    targetType: "post" | "comment",
    targetId: string,
    value: FeedReportContent,
  ): Promise<{ id: string }>;
  readReports(
    cursor: string | null | undefined,
    take: number,
  ): Promise<{
    rows: Array<{
      id: string;
      reporterId: string;
      authorId: string;
      targetType: string;
      targetId: string;
      postId: string;
      snapshotText: string;
      reason: string;
      comment: string;
      status: string;
      resolution: string | null;
      resolutionReason: string | null;
      moderatorId: string | null;
      createdAt: Date;
      resolvedAt: Date | null;
    }>;
    users: Array<{ id: string; username: string; feedPublishingBlocked: boolean }>;
    pendingCount: number;
  }>;
  resolveReport(
    actorId: string,
    reportId: string,
    value: FeedModerationDecision,
  ): Promise<{ id: string }>;
}

export function createFeedPreferences({
  operations,
  enabled = () => false,
  now = () => new Date(),
}: {
  operations: FeedPreferenceOperations;
  enabled?: () => boolean;
  now?: () => Date;
}) {
  async function auth(id: string, moderator = false) {
    if (!enabled()) throw new FeedError("FEED_DISABLED", undefined, 503);
    feedParse(feedIdSchema, id);
    const user = await operations.readActor(id);
    if (!user) throw new FeedError("UNAUTHENTICATED", undefined, 401);
    if (moderator) assertFeedModerator(user.role);
  }
  return {
    async bookmark(actorId: string, postId: string, saved: boolean) {
      await auth(actorId);
      feedParse(feedIdSchema, postId);
      if (!saved) await operations.removeBookmark(actorId, postId);
      else if (!(await operations.saveVisibleBookmark(actorId, postId)))
        throw new FeedError("NOT_FOUND", undefined, 404);
      return { saved };
    },
    async preference(actorId: string, authorId: string, input: unknown) {
      await auth(actorId);
      feedParse(feedIdSchema, authorId);
      if (actorId === authorId)
        throw new FeedError("VALIDATION_ERROR", "Нельзя скрыть себя или подписаться на себя", 400);
      const value = feedParse(feedPreferenceSchema, input);
      const row = await operations.saveAuthorPreference(actorId, authorId, value);
      if (!row) throw new FeedError("NOT_FOUND", undefined, 404);
      return { hidden: row.hidden, notify: row.notify };
    },
    async hiddenAuthors(actorId: string, input: unknown = {}) {
      await auth(actorId);
      const q = feedParse(feedListSchema, input);
      if (q.cursor) feedParse(feedIdSchema, q.cursor);
      const rows = await operations.readHiddenAuthors(actorId, q.cursor, q.pageSize + 1);
      return {
        items: rows
          .slice(0, q.pageSize)
          .map(({ author }) => ({
            id: author.id,
            username: author.username,
            name: author.profile?.fullName ?? author.username,
            avatarUrl: author.profile?.avatarUrl ?? null,
          })),
        nextCursor: rows.length > q.pageSize ? rows[q.pageSize - 1]!.authorId : null,
        serverNow: now().toISOString(),
      };
    },
    async report(
      actorId: string,
      targetType: "post" | "comment",
      targetId: string,
      input: unknown,
    ) {
      await auth(actorId);
      feedParse(feedIdSchema, targetId);
      const value = feedParse(feedReportSchema, input);
      return operations.submitReport(actorId, targetType, targetId, value);
    },
    async reports(actorId: string, input: unknown = {}) {
      await auth(actorId, true);
      const q = feedParse(feedListSchema, input);
      if (q.cursor) feedParse(feedIdSchema, q.cursor);
      const { rows, users, pendingCount } = await operations.readReports(q.cursor, q.pageSize + 1);
      return {
        items: rows
          .slice(0, q.pageSize)
          .map((row) => ({
            ...row,
            author: users.find((user) => user.id === row.authorId) ?? null,
            reporter: users.find((user) => user.id === row.reporterId) ?? null,
            createdAt: row.createdAt.toISOString(),
            resolvedAt: row.resolvedAt?.toISOString() ?? null,
          })),
        pendingCount,
        nextCursor: rows.length > q.pageSize ? rows[q.pageSize - 1]!.id : null,
      };
    },
    async moderate(actorId: string, reportId: string, input: unknown) {
      await auth(actorId, true);
      feedParse(feedIdSchema, reportId);
      const value = feedParse(feedModerationSchema, input);
      return operations.resolveReport(actorId, reportId, value);
    },
  };
}
