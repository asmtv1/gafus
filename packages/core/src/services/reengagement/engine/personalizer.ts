/**
 * Персонализация сообщений для re-engagement уведомлений
 */

import { createWorkerLogger } from "@gafus/logger";
import type { MessageVariant, UserData, PersonalizedMessage } from "./reengagement-types";

const logger = createWorkerLogger("personalizer");

/**
 * Персонализировать сообщение для конкретного пользователя
 */
export function personalizeMessage(
  variant: MessageVariant,
  userData: UserData,
): PersonalizedMessage {
  try {
    // 1. Персонализировать заголовок
    const personalizedTitle = replacePlaceholders(variant.title, userData);

    // 2. Персонализировать текст
    const personalizedBody = replacePlaceholders(variant.body, userData);

    // 3. Сгенерировать URL
    const url = generateUrl(variant.urlTemplate, userData);

    // 4. Подготовить metadata
    const data = {
      reengagement: true,
      variantId: variant.id,
      messageType: variant.type,
      level: variant.level,
      userId: userData.userId,
    };

    return {
      title: personalizedTitle,
      body: personalizedBody,
      url,
      data,
    };
  } catch (error) {
    logger.error("Ошибка персонализации сообщения", error as Error, {
      variantId: variant.id,
      userId: userData.userId,
    });

    // Fallback - вернуть базовое сообщение без персонализации
    return {
      title: variant.title,
      body: variant.body,
      url: "/trainings/group",
      data: {
        reengagement: true,
        variantId: variant.id,
        messageType: variant.type,
        level: variant.level,
      },
    };
  }
}

/**
 * Заменить плейсхолдеры в тексте
 * Поддерживаемые плейсхолдеры:
 * - {username} - имя пользователя
 * - {dogName} - имя собаки
 * - {completedCourses} - количество завершенных курсов
 * - {totalSteps} - общее количество шагов
 * - {bestCourseName} - название лучшего курса
 * - {weeklyStats} - количество завершений за неделю
 * - {activeTodayUsers} - активных пользователей сегодня
 */
function replacePlaceholders(text: string, userData: UserData): string {
  let result = text;

  // Базовые замены
  result = result.replace(/{username}/g, userData.username || "друг");
  result = result.replace(/{dogName}/g, userData.dogName || "ваша собака");

  // Статистика
  result = result.replace(/{completedCourses}/g, String(userData.completedCourses.length));
  result = result.replace(/{totalSteps}/g, String(userData.totalSteps));

  // Лучший курс
  const bestCourse = getBestCourse(userData);
  result = result.replace(/{bestCourseName}/g, bestCourse?.name || "пройденном курсе");

  // Статистика платформы
  if (userData.platformStats) {
    result = result.replace(/{weeklyStats}/g, String(userData.platformStats.weeklyCompletions));
    result = result.replace(/{activeTodayUsers}/g, String(userData.platformStats.activeTodayUsers));
  }

  return result;
}

/**
 * Сгенерировать персонализированный URL
 * Поддерживаемые шаблоны:
 * - /trainings/group - главная страница тренировок
 * - /trainings/group/{bestCourseId} - лучший курс пользователя
 * - /profile - личный кабинет
 */
function generateUrl(urlTemplate: string, userData: UserData): string {
  let url = urlTemplate;

  // Замена ID лучшего курса
  if (url.includes("{bestCourseId}")) {
    const bestCourse = getBestCourse(userData);
    if (bestCourse) {
      url = url.replace(/{bestCourseId}/g, bestCourse.id);
    } else {
      // Fallback - если нет лучшего курса, ведем на главную
      url = "/trainings/group";
    }
  }

  return url;
}

/**
 * Получить лучший курс пользователя (с наивысшей оценкой)
 */
function getBestCourse(userData: UserData): { id: string; name: string } | null {
  if (userData.completedCourses.length === 0) {
    return null;
  }

  // Найти курс с максимальной оценкой
  const sortedCourses = [...userData.completedCourses].sort((a, b) => b.rating - a.rating);
  const best = sortedCourses[0];

  // Вернуть только если оценка >= 4
  if (best && best.rating >= 4) {
    return {
      id: best.id,
      name: best.name,
    };
  }

  // Если нет курса с высокой оценкой, вернуть последний завершенный
  return {
    id: userData.completedCourses[0].id,
    name: userData.completedCourses[0].name,
  };
}

/**
 * Валидировать персонализированное сообщение
 * Проверяет, что не осталось незамененных плейсхолдеров
 */
export function validatePersonalizedMessage(message: PersonalizedMessage): boolean {
  const hasPlaceholders = message.title.includes("{") || message.body.includes("{");

  if (hasPlaceholders) {
    logger.warn("В персонализированном сообщении остались незамененные плейсхолдеры", {
      title: message.title,
      body: message.body,
    });
    return false;
  }

  return true;
}
