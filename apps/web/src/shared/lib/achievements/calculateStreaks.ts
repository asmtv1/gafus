/**
 * Функции для правильного подсчета серий занятий на основе реальных дат
 */

/**
 * Вычисляет текущую серию (сколько дней подряд пользователь занимался до сегодня)
 * 
 * Текущая серия считается от последней даты занятий назад до первого пропущенного дня.
 * Если последняя активность была вчера или сегодня, серия продолжается.
 * Если последняя активность была позавчера или раньше, серия = 0.
 * 
 * @param trainingDates - Массив дат, когда пользователь завершал шаги или дни тренировок
 * @returns Количество дней подряд в текущей серии
 * 
 * @example
 * ```typescript
 * // Пользователь занимался: сегодня, вчера, позавчера
 * const dates = [new Date('2024-01-03'), new Date('2024-01-02'), new Date('2024-01-01')];
 * calculateCurrentStreak(dates); // 3
 * 
 * // Пользователь занимался: вчера, позавчера (сегодня не занимался)
 * const dates2 = [new Date('2024-01-02'), new Date('2024-01-01')];
 * calculateCurrentStreak(dates2); // 2
 * ```
 */
export function calculateCurrentStreak(trainingDates: Date[] | string[]): number {
  if (trainingDates.length === 0) {
    return 0;
  }

  // Нормализуем даты до начала дня и удаляем дубликаты
  // Обрабатываем как Date объекты, так и строки (после сериализации)
  const normalizedDates = new Set<string>();
  trainingDates.forEach((date) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) {
      return; // Пропускаем невалидные даты
    }
    d.setHours(0, 0, 0, 0);
    normalizedDates.add(d.toISOString());
  });

  if (normalizedDates.size === 0) {
    return 0;
  }

  // Преобразуем обратно в Date и сортируем по убыванию
  const uniqueDates = Array.from(normalizedDates)
    .map((iso) => new Date(iso))
    .sort((a, b) => b.getTime() - a.getTime());

  // Получаем сегодняшнюю дату нормализованную
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Если последняя дата не сегодня и не вчера, серия прервана
  const lastDate = uniqueDates[0];
  const daysDiff = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

  // Если последняя активность была больше 1 дня назад, серия прервана
  if (daysDiff > 1) {
    return 0;
  }

  // Начинаем отсчет серии от последней даты
  let streak = 0;
  const expectedDate = new Date(lastDate);

  // Проверяем последовательность дней от последней даты назад
  // Создаем Set для быстрого поиска дат
  const dateSet = new Set(uniqueDates.map(d => d.toISOString()));

  // Ограничиваем максимальное количество итераций (на случай ошибок)
  const MAX_ITERATIONS = 365; // Максимум год назад
  let iterations = 0;

  // Начинаем с последней даты и идем назад, пока находим последовательные дни
  while (iterations < MAX_ITERATIONS) {
    const expectedDateStr = expectedDate.toISOString();
    
    // Если эта дата есть в списке занятий, увеличиваем серию
    if (dateSet.has(expectedDateStr)) {
      streak++;
      // Переходим к предыдущему дню
      expectedDate.setDate(expectedDate.getDate() - 1);
      iterations++;
    } else {
      // Серия прервана
      break;
    }
  }

  return streak;
}

/**
 * Вычисляет самую длинную серию занятий за все время
 * 
 * Анализирует все даты занятий и находит самую длинную последовательность дней подряд.
 * 
 * @param trainingDates - Массив дат, когда пользователь завершал шаги или дни тренировок
 * @returns Максимальное количество дней подряд в истории занятий
 * 
 * @example
 * ```typescript
 * // Пользователь занимался: 1,2,3,5,6,7 января
 * const dates = [
 *   new Date('2024-01-01'), new Date('2024-01-02'), new Date('2024-01-03'),
 *   new Date('2024-01-05'), new Date('2024-01-06'), new Date('2024-01-07')
 * ];
 * calculateLongestStreak(dates); // 3 (1-3 января)
 * ```
 */
export function calculateLongestStreak(trainingDates: Date[] | string[]): number {
  if (trainingDates.length === 0) {
    return 0;
  }

  // Нормализуем даты до начала дня
  // Обрабатываем как Date объекты, так и строки (после сериализации)
  const normalizedDates = new Set<string>();
  trainingDates.forEach((date) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) {
      return; // Пропускаем невалидные даты
    }
    d.setHours(0, 0, 0, 0);
    normalizedDates.add(d.toISOString());
  });

  if (normalizedDates.size === 0) {
    return 0;
  }

  // Сортируем даты по возрастанию (старые первыми)
  const sortedDates = Array.from(normalizedDates)
    .map((iso) => new Date(iso))
    .sort((a, b) => a.getTime() - b.getTime());

  let longestStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = sortedDates[i - 1];
    const currentDate = sortedDates[i];

    // Вычисляем разницу в днях
    const daysDiff = Math.floor(
      (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff === 1) {
      // Последовательные дни - продолжаем серию
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      // Серия прервана - начинаем новую
      currentStreak = 1;
    }
  }

  return longestStreak;
}

