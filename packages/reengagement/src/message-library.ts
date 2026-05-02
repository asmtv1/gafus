/**
 * Библиотека вариантов сообщений для re-engagement уведомлений
 * Включает 25 различных вариантов для разнообразия
 */

import type { MessageVariant, MessageType, UserData } from "./reengagement-types";

/**
 * Полная библиотека сообщений
 */
export const messageLibrary: MessageVariant[] = [
  // ===== LEVEL 1: Эмоциональные (День 5) =====
  {
    id: "emo_miss_1",
    type: "emotional",
    level: 1,
    title: "🐕 Мы скучаем по вам!",
    body: "Как дела у вас и {dogName}? Возвращайтесь к тренировкам!",
    conditions: { requiresDogName: true },
    urlTemplate: "/trainings/group",
    emoji: "🐕",
  },
  {
    id: "emo_miss_2",
    type: "emotional",
    level: 1,
    title: "Давно не виделись!",
    body: "Ваша собака готова к новым занятиям. Продолжим обучение?",
    urlTemplate: "/trainings/group",
    emoji: "👋",
  },
  {
    id: "emo_miss_3",
    type: "emotional",
    level: 1,
    title: "Привет!",
    body: "Возвращайтесь к тренировкам: ваш следующий маленький шаг уже может дать результат.",
    urlTemplate: "/trainings/group",
  },
  {
    id: "emo_welcome_back",
    type: "emotional",
    level: 1,
    title: "🏠 Добро пожаловать обратно!",
    body: "Мы рады видеть вас снова. Готовы продолжить тренировки?",
    urlTemplate: "/trainings/group",
    emoji: "🏠",
  },

  // ===== LEVEL 2: Образовательные/Практические (День 12) =====
  // Для пользователей с завершенными курсами
  {
    id: "edu_repeat_1",
    type: "educational",
    level: 2,
    title: "🔄 Без практики навыки теряются",
    body: 'Навыки крепнут через повторение. Освежим упражнения из курса "{bestCourseName}"?',
    conditions: { requiresCompletedCourses: true },
    urlTemplate: "/trainings/group/{bestCourseId}",
    emoji: "🔄",
  },
  {
    id: "edu_repeat_2",
    type: "educational",
    level: 2,
    title: "Регулярность - залог успеха",
    body: "Повторите упражнения из пройденных курсов, чтобы ваша собака не забыла команды",
    conditions: { requiresCompletedCourses: true },
    urlTemplate: "/trainings/group",
    emoji: "💪",
  },
  {
    id: "edu_repeat_3",
    type: "educational",
    level: 2,
    title: "📚 Время освежить память",
    body: "Регулярные занятия помогают поддерживать навыки. Повторим любимый курс?",
    conditions: { requiresCompletedCourses: true },
    urlTemplate: "/trainings/group",
    emoji: "📚",
  },
  // Для новичков без завершенных курсов
  {
    id: "edu_regular_1",
    type: "educational",
    level: 2,
    title: "⏰ Небольшая тренировка сегодня",
    body: "Короткие и регулярные занятия дают заметный прогресс. Попробуйте прямо сейчас",
    urlTemplate: "/trainings/group",
    emoji: "⏰",
  },
  {
    id: "edu_regular_2",
    type: "educational",
    level: 2,
    title: "Регулярные тренировки важны",
    body: "Собаки учатся лучше при регулярных занятиях. Продолжим обучение?",
    urlTemplate: "/trainings/group",
  },
  {
    id: "edu_benefit_1",
    type: "educational",
    level: 2,
    title: "🎓 Польза тренировок",
    body: "Регулярные занятия улучшают поведение собаки и укрепляют вашу связь",
    urlTemplate: "/trainings/group",
    emoji: "🎓",
  },

  // ===== LEVEL 3: Мотивационные/Социальные (День 20) =====
  {
    id: "mot_social_1",
    type: "motivational",
    level: 3,
    title: "🏆 Присоединяйтесь к активным!",
    body: "Сейчас отличное время вернуться в ритм занятий. Ваша следующая победа уже рядом!",
    urlTemplate: "/trainings/group",
    emoji: "🏆",
  },
  {
    id: "mot_social_2",
    type: "motivational",
    level: 3,
    title: "📈 Регулярность меняет все",
    body: "Постоянная практика помогает быстрее видеть изменения в поведении. Продолжим?",
    urlTemplate: "/trainings/group",
    emoji: "📈",
  },
  {
    id: "mot_community",
    type: "motivational",
    level: 3,
    title: "👥 Сообщество растет",
    body: "Многие владельцы продолжают путь вместе с питомцами. Присоединяйтесь к тренировкам!",
    urlTemplate: "/trainings/group",
    emoji: "👥",
  },
  // Для пользователей с достижениями
  {
    id: "mot_achievement_1",
    type: "motivational",
    level: 3,
    title: "🌟 Ваши достижения",
    body: "Вы уже проделали большую работу. Продолжайте, чтобы закрепить отличный результат",
    conditions: { requiresCompletedCourses: true, minSteps: 5 },
    urlTemplate: "/profile",
    emoji: "🌟",
  },
  {
    id: "mot_achievement_2",
    type: "motivational",
    level: 3,
    title: "💎 Отличный прогресс!",
    body: "Вы уже прошли важную часть пути. Давайте сделаем следующий шаг вместе",
    conditions: { minSteps: 10 },
    urlTemplate: "/profile",
    emoji: "💎",
  },
  {
    id: "mot_new_content",
    type: "motivational",
    level: 3,
    title: "✨ Новые курсы",
    body: "Появились новые интересные курсы! Посмотрите, что подойдет вам",
    urlTemplate: "/trainings/group",
  },

  // ===== LEVEL 4: Комбинированные (День 30) =====
  {
    id: "mix_final_1",
    type: "mixed",
    level: 4,
    title: "💪 Время вернуться!",
    body: "Вы уже доказали, что умеете двигаться вперед. Регулярные занятия делают питомца спокойнее и увереннее 🐕",
    conditions: { minSteps: 3 },
    urlTemplate: "/profile",
    emoji: "💪",
  },
  {
    id: "mix_final_2",
    type: "mixed",
    level: 4,
    title: "🎯 Ваш прогресс сохранен",
    body: 'Помните ваши успехи в "{bestCourseName}"? Регулярность укрепляет связь с питомцем. Вернитесь!',
    conditions: { requiresCompletedCourses: true },
    urlTemplate: "/trainings/group/{bestCourseId}",
    emoji: "🎯",
  },
  {
    id: "mix_final_3",
    type: "mixed",
    level: 4,
    title: "🌈 Новая неделя - новые возможности!",
    body: "Тренировки помогают собаке оставаться послушной и счастливой. Начнем сегодня?",
    urlTemplate: "/trainings/group",
    emoji: "🌈",
  },
  {
    id: "mix_benefit_progress",
    type: "mixed",
    level: 4,
    title: "❤️ Ваша собака ждет",
    body: "Регулярные занятия важны для развития и счастья питомца. Ваш прогресс сохранен - продолжайте!",
    urlTemplate: "/trainings/group",
    emoji: "❤️",
  },
  {
    id: "mix_all_complete",
    type: "mixed",
    level: 4,
    title: "🏅 Вы завершили все курсы!",
    body: "Повторение закрепит навыки навсегда. Или ждите новый контент - скоро!",
    conditions: { requiresCompletedCourses: true, minSteps: 30 },
    urlTemplate: "/profile",
    emoji: "🏅",
  },
  {
    id: "mix_community_benefit",
    type: "mixed",
    level: 4,
    title: "🎊 Последнее напоминание",
    body: "Пора снова вернуться к привычному ритму: даже одно занятие сегодня станет хорошим стартом",
    urlTemplate: "/trainings/group",
    emoji: "🎊",
  },
];

/**
 * Получить все варианты сообщений для конкретного уровня
 */
export function getVariantsByLevel(level: number): MessageVariant[] {
  return messageLibrary.filter((v) => v.level === level);
}

/**
 * Получить варианты по типу
 */
export function getVariantsByType(type: MessageType): MessageVariant[] {
  return messageLibrary.filter((v) => v.type === type);
}

/**
 * Проверить, соответствует ли вариант условиям для данного пользователя
 */
export function checkConditions(variant: MessageVariant, userData: UserData): boolean {
  if (!variant.conditions) {
    return true; // Нет условий - подходит всем
  }

  const { conditions } = variant;

  // Требуется имя собаки
  if (conditions.requiresDogName && !userData.dogName) {
    return false;
  }

  // Требуются завершенные курсы
  if (conditions.requiresCompletedCourses && userData.completedCourses.length === 0) {
    return false;
  }

  // Минимальное количество шагов
  if (conditions.minSteps && userData.totalSteps < conditions.minSteps) {
    return false;
  }

  // Максимальное количество шагов
  if (conditions.maxSteps && userData.totalSteps > conditions.maxSteps) {
    return false;
  }

  return true;
}

/**
 * Получить доступные варианты для пользователя с учетом условий
 */
export function getAvailableVariants(
  level: number,
  userData: UserData,
  excludeIds: string[] = [],
): MessageVariant[] {
  const levelVariants = getVariantsByLevel(level);

  return levelVariants.filter((variant) => {
    // Исключаем уже использованные
    if (excludeIds.includes(variant.id)) {
      return false;
    }

    // Проверяем условия
    return checkConditions(variant, userData);
  });
}

/**
 * Случайный выбор варианта из списка
 */
export function selectRandomVariant(variants: MessageVariant[]): MessageVariant | null {
  if (variants.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * variants.length);
  return variants[randomIndex];
}

/**
 * Выбрать лучший вариант сообщения для пользователя
 */
export function selectMessageVariant(
  level: number,
  userData: UserData,
  sentVariantIds: string[] = [],
): MessageVariant | null {
  const availableVariants = getAvailableVariants(level, userData, sentVariantIds);

  if (availableVariants.length === 0) {
    // Если все варианты использованы, берем любой доступный (без учета истории)
    const allVariants = getAvailableVariants(level, userData, []);
    return selectRandomVariant(allVariants);
  }

  return selectRandomVariant(availableVariants);
}
