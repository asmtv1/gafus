/** AG1-001: lazy Core getters and unchanged strict statistics projectors. */
import { getCourseStatistics, getStepStatistics } from "@gafus/core/services/statistics";
import {
  projectCourseStatisticsForTrainer,
  projectStepStatisticsForTrainer,
} from "../../../lib/trainer-statistics-g1-proposal.js";
import { createReadTrainerStatisticsApplication } from "../application/read-trainer-statistics.js";

export const readTrainerStatisticsApplication = createReadTrainerStatisticsApplication({
  readCourses: (userId, isElevated) => getCourseStatistics(userId, isElevated),
  readSteps: (userId, isElevated) => getStepStatistics(userId, isElevated),
  projectCourses: projectCourseStatisticsForTrainer,
  projectSteps: projectStepStatisticsForTrainer,
});
