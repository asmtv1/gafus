import type { SubscriptionAccessPorts } from "../appSubscription";

/** Read-only, owner-scoped paid content and video occurrence projections.
 * Persistence must not infer a grant from a raw URL/global Step. Core retains
 * private assignment, active subscription, Gafus eligibility and public error.
 */
type CoursePolicyRow = { id: string; isPaid: boolean; isPrivate: boolean };
type StepOccurrence = { id: string; step: { type: string } };
export type RewardedUserStepRow = {
  stepOnDay: StepOccurrence;
  userTraining: { dayOnCourse: { course: CoursePolicyRow } };
};
export type RewardedDailyUserStepRow = {
  bundleStepId: string;
  dailyCourseUserTraining: { scheduleId: string };
  bundleStep: { step: { type: string } };
};
export type RewardedVideoOccurrenceRow = {
  course: CoursePolicyRow;
  day: { stepLinks: StepOccurrence[] };
};
export interface RewardedAccessReadPort {
  getAppSubscriptionAccess(
    ...args: Parameters<SubscriptionAccessPorts["getAppSubscriptionAccess"]>
  ): Promise<{ hasActiveSubscription: boolean }>;
  readOwnedCourseDayRewardedSteps(userId: string, dayOnCourseId: string): Promise<{day:{stepLinks:StepOccurrence[]}} | null>;
  readOwnedRewardedUserStep(userId: string, userStepId: string): Promise<RewardedUserStepRow | null>;
  readRewardedPrivateCourseAssignment(userId: string, courseId: string): Promise<{courseId:string} | null>;
  readOwnedDailyRewardedUserStep(userId: string, userStepId: string): Promise<RewardedDailyUserStepRow | null>;
  readPublishedDailyRewardedVideo(videoUrl: string, at: Date): Promise<{id:string} | null>;
  readOwnedRewardedVideoStep(userId: string, videoUrl: string): Promise<RewardedUserStepRow | null>;
  readActiveLegacyRewardedGrant(userId: string, targetType: "ARTICLE" | "COURSE_STEP", targetId: string, at: Date): Promise<{id:string} | null>;
  readRewardedViewerRole(userId: string): Promise<{role:string} | null>;
  readRewardedCourseVideoOccurrences(videoUrl: string): Promise<RewardedVideoOccurrenceRow[]>;
  readPendingRewardedStepNotificationUrl(userId: string, day: number, stepIndex: number): Promise<{url:string|null} | null>;
}
let bound: Readonly<RewardedAccessReadPort> | null = null;
export function registerRewardedAccessReadPort(port: RewardedAccessReadPort): void {
  if (bound !== null && bound !== port) throw new Error("REWARDED_ACCESS_READ_PORT_ALREADY_BOUND");
  bound = port;
}
export function requireRewardedAccessReadPort(): Readonly<RewardedAccessReadPort> {
  if (!bound) throw new Error("REWARDED_ACCESS_READ_PORT_UNBOUND");
  return bound;
}
