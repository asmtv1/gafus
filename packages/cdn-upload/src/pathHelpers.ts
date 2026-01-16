import { randomUUID } from "crypto";

/**
 * Генерирует путь для аватара пользователя
 * @param userId - ID пользователя
 * @param uuid - UUID файла (или будет сгенерирован автоматически)
 * @param ext - Расширение файла
 * @returns Путь вида: users/{userId}/avatar/{uuid}.{ext}
 */
export function getUserAvatarPath(
  userId: string,
  uuid: string = randomUUID(),
  ext: string
): string {
  return `users/${userId}/avatar/${uuid}.${ext}`;
}

/**
 * Генерирует путь для фото питомца
 * @param userId - ID пользователя (владелец питомца)
 * @param petId - ID питомца
 * @param uuid - UUID файла (или будет сгенерирован автоматически)
 * @param ext - Расширение файла
 * @returns Путь вида: users/{userId}/pets/{petId}/{uuid}.{ext}
 */
export function getPetPhotoPath(
  userId: string,
  petId: string,
  uuid: string = randomUUID(),
  ext: string
): string {
  return `users/${userId}/pets/${petId}/${uuid}.${ext}`;
}

/**
 * Генерирует путь для изображения шага
 * @param trainerId - ID тренера (автора шага)
 * @param stepId - ID шага
 * @param uuid - UUID файла (или будет сгенерирован автоматически)
 * @param ext - Расширение файла
 * @returns Путь вида: trainers/{trainerId}/steps/{stepId}/{uuid}.{ext}
 */
export function getStepImagePath(
  trainerId: string,
  stepId: string,
  uuid: string = randomUUID(),
  ext: string
): string {
  return `trainers/${trainerId}/steps/${stepId}/${uuid}.${ext}`;
}

/**
 * Генерирует путь для изображения курса
 * @param trainerId - ID тренера (автора курса)
 * @param courseId - ID курса
 * @param uuid - UUID файла (или будет сгенерирован автоматически)
 * @param ext - Расширение файла
 * @returns Путь вида: trainers/{trainerId}/courses/{courseId}/{uuid}.{ext}
 */
export function getCourseImagePath(
  trainerId: string,
  courseId: string,
  uuid: string = randomUUID(),
  ext: string
): string {
  return `trainers/${trainerId}/courses/${courseId}/${uuid}.${ext}`;
}

/**
 * Генерирует путь для видео экзамена
 * @param userStepId - ID userStep (связка пользователя и шага)
 * @param uuid - UUID файла (или будет сгенерирован автоматически)
 * @param ext - Расширение файла
 * @returns Путь вида: exams/{userStepId}/{uuid}.{ext}
 */
export function getExamVideoPath(
  userStepId: string,
  uuid: string = randomUUID(),
  ext: string
): string {
  return `exams/${userStepId}/${uuid}.${ext}`;
}
