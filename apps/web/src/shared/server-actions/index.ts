/**
 * Server Actions - точка входа для всех Server Actions
 */

// Cache Actions
export {
  invalidateUserProgressCache,
  invalidateCoursesCache,
  invalidateTrainingCache,
} from "./cache";

// Push Actions
export { getPublicKeyAction } from "./push";

// Auth Actions
export {
  checkUserStateAction,
  serverCheckUserConfirmedAction,
  sendPasswordResetRequestAction,
  registerUserAction,
  resetPasswordAction,
  checkPhoneMatchesUsernameAction,
} from "./auth";

// Achievements Actions
export { getUserTrainingDatesAction } from "./achievements";

// Tracking Actions
export {
  trackPresentationViewAction,
  trackPresentationEventAction,
  trackReengagementClickAction,
} from "./tracking";

// Notification Actions
export {
  pauseNotificationAction,
  resetNotificationAction,
  resumeNotificationAction,
  toggleStepNotificationPauseAction,
  toggleStepNotificationPauseByDayOnCourseAction,
  deleteStepNotificationAction,
  createStepNotificationAction,
} from "./notifications";

// Subscription Actions
export {
  savePushSubscriptionAction,
  updateSubscriptionAction,
  deleteSubscriptionAction,
  getSubscriptionStatusAction,
  getSubscriptionCountAction,
  getUserSubscriptionsAction,
} from "./subscriptions";

// Course Actions
export {
  getCoursesWithProgressAction,
  checkCourseAccessAction,
  checkCourseAccessByIdAction,
  getCourseMetadataAction,
  getFavoritesCoursesAction,
  toggleFavoriteCourseAction,
  addFavoriteCourseAction,
  removeFavoriteCourseAction,
  getCourseReviewsAction,
  createCourseReviewAction,
  updateCourseReviewAction,
  deleteCourseReviewAction,
  rateCourseAction,
  updateCourseRatingAction,
  getAuthoredCoursesAction,
} from "./course";

// Course Types (re-export from services)
export type {
  CourseReviewData,
  UserReviewStatus,
  CourseReviewsResult,
  ReviewActionResult,
} from "@gafus/core/services/course";

// User & Profile Actions
export {
  getUserProfileAction,
  updateUserProfileAction,
  getPublicProfileAction,
  updateAvatarAction,
  getUserPreferencesAction,
  updateUserPreferencesAction,
} from "./user";

// Notes Actions
export { getStudentNotes } from "./notes";
