/**
 * ADMIN analytics read port. Pure application contract: no Prisma, Hono,
 * Redis, or server-side implementation imports.
 *
 * Authentication and live ADMIN role are enforced by the Hono route BEFORE
 * invoking these reads. Data remains aggregate-only and uncached.
 */
export type AnalyticsPeriodDays = 7 | 30 | 90;
export type ReengagementQueryResult =
  | { success: true; data: object }
  | { success: false; error: string };

export interface AdminAnalyticsReads {
  reengagement(): Promise<ReengagementQueryResult>;
  rewarded(input: Readonly<{ days: AnalyticsPeriodDays }>): Promise<object>;
}

export function createAdminAnalyticsQueries(port: AdminAnalyticsReads): AdminAnalyticsReads {
  return {
    reengagement: () => port.reengagement(),
    rewarded: (input) => port.rewarded(input),
  };
}
