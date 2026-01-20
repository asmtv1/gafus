export { apiClient, type ApiResponse } from "./client";
export { authApi, type User, type LoginResponse, type RegisterData } from "./auth";
export { coursesApi, type Course, type CoursesResponse, type CourseFilters } from "./courses";
export {
  trainingApi,
  type TrainingDay,
  type TrainingDaysResponse,
  type UserStep,
  type TrainingDayResponse,
  type StepActionParams,
  type StartStepParams,
  type PauseStepParams,
  type CompleteStepParams,
} from "./training";
export { petsApi, type Pet, type CreatePetData, type UpdatePetData } from "./pets";
export { achievementsApi, type TrainingDatesResponse, type UserStats } from "./achievements";
export { userApi, type UpdateProfileData, type UserPreferences } from "./user";
export { subscriptionsApi, type PushSubscription } from "./subscriptions";
