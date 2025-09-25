import bcrypt from "bcrypt";
import { createWebLogger } from "@gafus/logger";

import { prisma } from "./src/index";

// Создаем логгер для prisma seed
const logger = createWebLogger('prisma-seed');

const prismaClient = prisma;

async function main() {
  const startTime = Date.now();
  
  logger.info("Начинаем сидирование базы данных", {
    environment: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.DATABASE_URL ? 'configured' : 'missing'
  });

  const hashedPassword = await bcrypt.hash("2407041", 10);

  const admin = await prismaClient.user.upsert({
    where: { phone: "+79198031371" },
    update: {},
    create: {
      username: "admin",
      phone: "+79198031371",
      password: hashedPassword,
      role: "ADMIN",
      isConfirmed: true,
    },
  });
  logger.success("Админ создан или найден", {
    username: admin.username,
    phone: admin.phone,
    role: admin.role,
    isConfirmed: admin.isConfirmed
  });

  const [homeCourse, streetCourse, puppyCourse, authorCourse] = await prismaClient.$transaction([
    prismaClient.course.upsert({
      where: { type: "home" },
      update: {},
      create: {
        name: "Тренировки дома",
        type: "home",
        description: "Как тренировать хвостика дома",
        shortDesc: "Кратко о курсе",
        duration: "2 недели",
        logoImg: "/uploads/courses/3122311.jpg",
        equipment: "Поводок, игрушки, лакомства",
        trainingLevel: "BEGINNER",
        authorId: admin.id,
        videoUrl: "https://www.youtube.com/watch?v=4GdobPQTB40", // Смешные моменты с собаками
      },
    }),
    prismaClient.course.upsert({
      where: { type: "street" },
      update: {},
      create: {
        name: "Тренировки на улице",
        type: "street",
        description: "Как тренировать хвостика на улице",
        shortDesc: "Кратко о курсе",
        duration: "2 недели",
        logoImg: "/uploads/course-logo.webp",
        equipment: "Поводок, ошейник, лакомства",
        trainingLevel: "INTERMEDIATE",
        authorId: admin.id,
        isPaid: true,
        videoUrl: "https://www.youtube.com/watch?v=4GdobPQTB40", // Смешные собаки на улице
      },
    }),
    prismaClient.course.upsert({
      where: { type: "puppy" },
      update: {},
      create: {
        name: "Щенок на карантине",
        type: "puppy",
        description: "Что делать, пока он маленький",
        shortDesc: "Кратко о курсе",
        duration: "1 месяц",
        logoImg: "/uploads/courses/21312123.jpeg",
        equipment: "Игрушки, лакомства, пеленки",
        trainingLevel: "BEGINNER",
        authorId: admin.id,
        videoUrl: "https://www.youtube.com/watch?v=4GdobPQTB40", // Смешные щенки
      },
    }),
    prismaClient.course.upsert({
      where: { type: "authors" },
      update: {},
      create: {
        name: "Авторский курс",
        type: "authors",
        description: "Супер-методика by Буй с Бугра",
        shortDesc: "Кратко о курсе",
        duration: "много лет",
        logoImg: "/uploads/courses/92086288.jpg",
        equipment: "Специальное оборудование",
        trainingLevel: "EXPERT",
        authorId: admin.id,
        videoUrl: "https://www.youtube.com/watch?v=4GdobPQTB40", // Профессиональная дрессировка
      },
    }),
  ]);
  logger.success("Курсы созданы", {
    courseCount: 4,
    courseTypes: ["home", "street", "puppy", "author"]
  });

  const [stepA, stepB, stepC] = await prismaClient.$transaction([
    prismaClient.step.create({
      data: {
        title: "Базовые команды",
        description: `## Основы дрессировки

**Цель:** Обучить собаку базовым командам

### Что изучаем:
- Команда "Сидеть"
- Команда "Лежать" 
- Команда "Стоять"

### Методика:
1. Используйте лакомства как поощрение
2. Повторяйте команды 10-15 раз за сессию
3. Постепенно увеличивайте время выполнения команды

### Оборудование:
- Лакомства
- Поводок`,
        durationSec: 60,
        videoUrl: "https://www.youtube.com/watch?v=4GdobPQTB40",
        authorId: admin.id,
      },
    }),
    prismaClient.step.create({
      data: {
        title: "Работа с поводком",
        description: `## Правильное использование поводка

**Цель:** Научить собаку ходить рядом без натяжения

### Техника:
- Поводок должен быть свободным
- Собака идет слева от хозяина
- При натяжении - останавливаемся

### Упражнения:
1. Ходьба по прямой
2. Повороты
3. Остановки

### Оборудование:
- Поводок длиной 1.5-2 метра
- Ошейник или шлейка`,
        durationSec: 90,
        videoUrl: "https://www.youtube.com/watch?v=4GdobPQTB40",
        authorId: admin.id,
      },
    }),
    prismaClient.step.create({
      data: {
        title: "Социализация",
        description: `## Социализация собаки

**Цель:** Приучить собаку к различным ситуациям

### Что включает:
- Встречи с другими собаками
- Контакт с людьми
- Адаптация к шуму

### Этапы:
1. Начинаем с тихих мест
2. Постепенно увеличиваем нагрузку
3. Контролируем реакцию собаки

### Оборудование:
- Поводок
- Лакомства для поощрения
- Игрушки для отвлечения`,
        durationSec: 120,
        videoUrl: "https://www.youtube.com/watch?v=4GdobPQTB40",
        authorId: admin.id,
      },
    }),
  ]);
  logger.success("Базовые шаги созданы", {
    stepCount: 3,
    stepTitles: ["Базовые команды", "Работа с поводком", "Социализация"]
  });

  const baseDay = await prismaClient.trainingDay.create({
    data: {
      title: "Основы дрессировки",
      type: "base",
      equipment: "Поводок длиной 1.5-2 метра, ошейник или шлейка, лакомства, игрушки для отвлечения",
      description: `## День 1: Основы дрессировки

**Цель дня:** Заложить фундамент для дальнейшего обучения собаки

### Что изучаем:
- Базовые команды управления
- Правильную работу с поводком
- Основы социализации

### Структура дня:
1. **Базовые команды** (60 сек) - изучение основных команд
2. **Работа с поводком** (90 сек) - обучение правильной ходьбе
3. **Социализация** (120 сек) - адаптация к различным ситуациям

### Рекомендации:
- Начинайте с коротких сессий
- Используйте позитивное подкрепление
- Будьте терпеливы и последовательны

### Ожидаемый результат:
Собака должна понимать базовые команды и спокойно реагировать на поводок.

`,
      authorId: admin.id,
    },
  });
  await prismaClient.stepOnDay.createMany({
    data: [
      { dayId: baseDay.id, stepId: stepA.id, order: 1 },
      { dayId: baseDay.id, stepId: stepB.id, order: 2 },
      { dayId: baseDay.id, stepId: stepC.id, order: 3 },
    ],
  });
  logger.success("Связка шагов с базовым днём выполнена", {
    dayId: baseDay.id,
    stepCount: 3
  });

  for (let i = 1; i <= 14; i++) {
    await prismaClient.dayOnCourse.createMany({
      data: [
        { courseId: homeCourse.id, dayId: baseDay.id, order: i },
        { courseId: streetCourse.id, dayId: baseDay.id, order: i },
      ],
    });
  }
  logger.success("Базовый день добавлен в курсы на 14 дней", {
    dayId: baseDay.id,
    courseCount: 4,
    durationDays: 14
  });

  const puppyDay = await prismaClient.trainingDay.create({
    data: {
      title: "Адаптация щенка",
      type: "puppy",
      equipment: "Мягкие игрушки, специальные лакомства для щенков, пеленки, миски для воды и еды",
      description: `## День 1: Адаптация щенка

**Цель дня:** Помочь щенку адаптироваться к новому дому и начать обучение

### Что изучаем:
- Развивающие игры для щенка
- Подготовку к первым прогулкам
- Основы социализации в раннем возрасте

### Структура дня:
1. **Игровая активность** (30 сек) - развивающие игры
2. **Первые прогулки** (30 сек) - подготовка к выходу на улицу

### Особенности работы со щенками:
- Короткие сессии (не более 10-15 минут)
- Много поощрений и игр
- Безопасная среда обучения
- Учет возраста и физических возможностей

### Важные моменты:
- Убедитесь в завершении вакцинации перед прогулками
- Используйте только безопасные игрушки
- Следите за усталостью щенка

### Ожидаемый результат:
Щенок должен быть заинтересован в играх и готов к первым прогулкам.

`,
      authorId: admin.id,
    },
  });
  const [stepP1, stepP2] = await prismaClient.$transaction([
    prismaClient.step.create({
      data: {
        title: "Игровая активность",
        description: `## Развивающие игры для щенка

**Цель:** Развитие координации и социализации

### Рекомендуемые игры:
- Перетягивание мягкой игрушки
- Поиск лакомств
- Игры с мячиком

### Правила:
1. Играйте не более 10-15 минут подряд
2. Следите за усталостью щенка
3. Используйте только безопасные игрушки

### Оборудование:
- Мягкие игрушки без мелких деталей
- Лакомства для щенков

`,
        durationSec: 30,
        videoUrl: "https://www.youtube.com/watch?v=4GdobPQTB40",
        authorId: admin.id,
      },
    }),
    prismaClient.step.create({
      data: {
        title: "Первые прогулки",
        description: `## Подготовка к прогулкам

**Цель:** Безопасное знакомство с внешним миром

### Подготовка:
- Убедитесь в завершении вакцинации
- Выберите тихое место для первых прогулок
- Начните с коротких выходов (5-10 минут)

### Что изучаем:
- Реакцию на новые звуки
- Поведение при встрече с людьми
- Привыкание к поводку

### Оборудование:
- Легкий поводок
- Ошейник подходящего размера
- Лакомства для поощрения

`,
        durationSec: 30,
        videoUrl: "https://www.youtube.com/watch?v=4GdobPQTB40",
        authorId: admin.id,
      },
    }),
  ]);
  await prismaClient.stepOnDay.createMany({
    data: [
      { dayId: puppyDay.id, stepId: stepP1.id, order: 1 },
      { dayId: puppyDay.id, stepId: stepP2.id, order: 2 },
    ],
  });
  await prismaClient.dayOnCourse.create({
    data: { courseId: puppyCourse.id, dayId: puppyDay.id, order: 1 },
  });
  logger.success("Щенячий день добавлен в курс", {
    dayId: puppyDay.id,
    courseType: "puppy",
    stepCount: 2
  });

  const authorDay = await prismaClient.trainingDay.create({
    data: {
      title: "Продвинутая дрессировка",
      type: "authors",
      equipment: "Кликер, мишени для обучения, препятствия для аджилити, профессиональные лакомства",
      description: `## День 1: Продвинутая дрессировка

**Цель дня:** Освоение профессиональных методов дрессировки по методике "Буй с Бугра"

### Что изучаем:
- Методику позитивного подкрепления
- Использование кликера для точного тайминга
- Поэтапное формирование сложных навыков

### Структура дня:
1. **Методика позитивного подкрепления** (120 сек) - профессиональные техники

### Особенности авторской методики:
- Точный тайминг с помощью кликера
- Поэтапное формирование поведения
- Работа с мотивацией собаки
- Развитие концентрации и интеллекта

### Этапы обучения:
1. **Маркировка поведения** - кликер в момент правильного действия
2. **Подкрепление** - лакомство после кликера
3. **Формирование** - постепенное усложнение задачи

### Практические упражнения:
- Обучение трюкам
- Работа с препятствиями
- Развитие концентрации

### Ожидаемый результат:
Собака должна понимать принципы кликер-дрессировки и быть готова к изучению сложных навыков.

`,
      authorId: admin.id,
    },
  });
  const authorStep = await prismaClient.step.create({
    data: {
      title: "Методика позитивного подкрепления",
      description: `## Продвинутые техники дрессировки

**Цель:** Освоение профессиональных методов обучения

### Методика "Буй с Бугра":
- Использование кликера для точного тайминга
- Поэтапное формирование сложных навыков
- Работа с мотивацией собаки

### Этапы обучения:
1. **Маркировка поведения** - кликер в момент правильного действия
2. **Подкрепление** - лакомство после кликера
3. **Формирование** - постепенное усложнение задачи

### Практические упражнения:
- Обучение трюкам
- Работа с препятствиями
- Развитие концентрации

### Оборудование:
- Кликер для дрессировки
- Разнообразные лакомства
- Мишени и препятствия

`,
        durationSec: 120,
        videoUrl: "https://www.youtube.com/watch?v=4GdobPQTB40",
        authorId: admin.id,
    },
  });
  await prismaClient.stepOnDay.create({
    data: { dayId: authorDay.id, stepId: authorStep.id, order: 1 },
  });
  await prismaClient.dayOnCourse.create({
    data: { courseId: authorCourse.id, dayId: authorDay.id, order: 1 },
  });
  logger.success("Авторский день добавлен в курс", {
    dayId: authorDay.id,
    courseType: "author",
    stepCount: 1
  });

  await prismaClient.favoriteCourse.createMany({
    data: [
      { userId: admin.id, courseId: homeCourse.id },
      { userId: admin.id, courseId: streetCourse.id },
    ],
    skipDuplicates: true,
  });
  logger.success("Курсы добавлены в избранное", {
    userId: admin.id,
    favoriteCount: 4,
    courseTypes: ["home", "street", "puppy", "author"]
  });

  await prismaClient.courseReview.createMany({
    data: [
      {
        userId: admin.id,
        courseId: homeCourse.id,
        rating: 5,
        comment: "Отличный курс, все понравилось!",
      },
      {
        userId: admin.id,
        courseId: streetCourse.id,
        rating: 4,
        comment: "Хороший курс, но хотелось бы больше примеров.",
      },
    ],
    skipDuplicates: true,
  });
  logger.success("Отзывы добавлены", {
    reviewCount: 2,
    averageRating: 4.5
  });

  const allCourses = await prismaClient.course.findMany({
    include: { reviews: true },
  });

  for (const course of allCourses) {
    const ratings = course.reviews
      .map((r: { rating: number | null }) => r.rating)
      .filter((r): r is number => typeof r === "number");

    const avg = ratings.length ? ratings.reduce((acc, r) => acc + r, 0) / ratings.length : null;

    await prismaClient.course.update({
      where: { id: course.id },
      data: { avgRating: avg },
    });
  }
  logger.success("Средние рейтинги обновлены", {
    courseCount: allCourses.length,
    averageRatings: allCourses.map(c => ({ id: c.id, rating: c.avgRating }))
  });
  const hashedTrainerPassword = await bcrypt.hash("trainer123", 10);

  const trainer = await prismaClient.user.upsert({
    where: { phone: "+79998887766" },
    update: {},
    create: {
      username: "trainer",
      phone: "+79998887766",
      password: hashedTrainerPassword,
      role: "TRAINER",
      isConfirmed: true,
    },
  });
  logger.success("Тренер создан", {
    trainerId: trainer.id,
    username: trainer.username,
    phone: trainer.phone,
    role: trainer.role
  });

  const [trainerStep1, trainerStep2] = await prismaClient.$transaction([
    prismaClient.step.create({
      data: {
        title: "Подготовительная разминка",
        description: `## Разминка перед тренировкой

**Цель:** Подготовить собаку к активной работе

### Упражнения разминки:
- Легкая пробежка на поводке
- Растяжка и разогрев мышц
- Психологическая подготовка

### Длительность:
- 5-10 минут для молодых собак
- 10-15 минут для взрослых собак

### Оборудование:
- Поводок
- Лакомства для мотивации

`,
        durationSec: 45,
        videoUrl: "https://www.youtube.com/watch?v=4GdobPQTB40",
        authorId: trainer.id,
      },
    }),
    prismaClient.step.create({
      data: {
        title: "Обучение аппортировке",
        description: `## Развитие навыка аппортировки

**Цель:** Научить собаку приносить и отдавать предметы

### Этапы обучения:
1. **Заинтересованность** - игра с предметом
2. **Преследование** - собака идет за брошенным предметом
3. **Возврат** - принесение предмета хозяину
4. **Отдача** - отпускание предмета по команде

### Методика:
- Начинайте с любимых игрушек собаки
- Используйте лакомства как поощрение
- Постепенно увеличивайте расстояние

### Оборудование:
- Мягкие игрушки для аппортировки
- Лакомства
- Поводок для контроля

`,
        durationSec: 90,
        videoUrl: "https://www.youtube.com/watch?v=4GdobPQTB40",
        authorId: trainer.id,
      },
    }),
  ]);
  logger.success("Шаги тренера созданы", {
    trainerId: trainer.id,
    stepCount: 2,
    stepTitles: ["Подготовительная разминка", "Обучение аппортировке"]
  });

  const [trainerDay1, trainerDay2] = await prismaClient.$transaction([
    prismaClient.trainingDay.create({
      data: {
        title: "Базовая физическая подготовка",
        type: "trainer",
        equipment: "Поводок, лакомства, игрушки для аппортировки, конусы для упражнений",
        description: `## День 1: Базовая физическая подготовка

**Цель дня:** Развить физические способности собаки и подготовить к активным тренировкам

### Что изучаем:
- Подготовительную разминку
- Обучение аппортировке
- Развитие координации и выносливости

### Структура дня:
1. **Подготовительная разминка** (45 сек) - разогрев перед тренировкой
2. **Обучение аппортировке** (90 сек) - развитие навыка принесения предметов

### Особенности физической подготовки:
- Постепенное увеличение нагрузки
- Контроль за состоянием собаки
- Разнообразие упражнений
- Правильная техника выполнения

### Рекомендации:
- Начинайте с легких упражнений
- Следите за дыханием собаки
- Делайте перерывы при необходимости
- Используйте поощрения для мотивации

### Ожидаемый результат:
Собака должна быть физически активной и готовой к более сложным упражнениям.

`,
        authorId: trainer.id,
      },
    }),
    prismaClient.trainingDay.create({
      data: {
        title: "Развитие интеллектуальных навыков",
        type: "trainer",
        equipment: "Пазлы для собак, интерактивные игрушки, кликер, разнообразные лакомства",
        description: `## День 2: Развитие интеллектуальных навыков

**Цель дня:** Стимулировать умственное развитие собаки и развить концентрацию

### Что изучаем:
- Работу с интерактивными игрушками
- Решение простых задач
- Развитие концентрации и памяти

### Структура дня:
1. **Обучение аппортировке** (90 сек) - развитие интеллектуальных навыков
2. **Подготовительная разминка** (45 сек) - умственная разминка

### Особенности интеллектуального развития:
- Постепенное усложнение задач
- Использование различных типов игрушек
- Развитие логического мышления
- Стимулирование любознательности

### Методы обучения:
- Пазлы для собак
- Интерактивные игрушки
- Игры на поиск
- Обучение трюкам

### Рекомендации:
- Начинайте с простых задач
- Поощряйте попытки решения
- Не перегружайте собаку
- Делайте занятия интересными

### Ожидаемый результат:
Собака должна проявлять интерес к решению задач и быть более сосредоточенной.

`,
        authorId: trainer.id,
      },
    }),
  ]);

  await prismaClient.stepOnDay.createMany({
    data: [
      { dayId: trainerDay1.id, stepId: trainerStep1.id, order: 1 },
      { dayId: trainerDay1.id, stepId: trainerStep2.id, order: 2 },
      { dayId: trainerDay2.id, stepId: trainerStep2.id, order: 1 },
      { dayId: trainerDay2.id, stepId: trainerStep1.id, order: 2 },
    ],
  });
  logger.success("Дни тренера со связанными шагами созданы", {
    trainerId: trainer.id,
    dayCount: 2,
    totalSteps: 4
  });

  const [trainerCourse1, trainerCourse2] = await prismaClient.$transaction([
    prismaClient.course.create({
      data: {
        name: "Курс тренера 1",
        type: "trainer-course-1",
        description: "Первый курс от тренера",
        shortDesc: "Кратко о первом курсе",
        duration: "3 дня",
        logoImg: "/uploads/courses/trainer1.jpg",
        equipment: "Базовое оборудование для тренировок",
        trainingLevel: "INTERMEDIATE",
        authorId: trainer.id,
      },
    }),
    prismaClient.course.create({
      data: {
        name: "Курс тренера 2",
        type: "trainer-course-2",
        description: "Второй курс от тренера",
        shortDesc: "Кратко о втором курсе",
        duration: "5 дней",
        logoImg: "/uploads/courses/trainer2.jpg",
        equipment: "Продвинутое оборудование",
        trainingLevel: "ADVANCED",
        authorId: trainer.id,
      },
    }),
  ]);

  // Добавляем тренерские дни в оба курса
  await prismaClient.dayOnCourse.createMany({
    data: [
      { courseId: trainerCourse1.id, dayId: trainerDay1.id, order: 1 },
      { courseId: trainerCourse1.id, dayId: trainerDay2.id, order: 2 },
      { courseId: trainerCourse2.id, dayId: trainerDay2.id, order: 1 },
      { courseId: trainerCourse2.id, dayId: trainerDay1.id, order: 2 },
    ],
  });

  logger.success("Курсы тренера созданы и дни добавлены в них", {
    trainerId: trainer.id,
    courseCount: 2,
    totalDays: 4
  });
  logger.success("Seed успешно выполнен", {
    totalOperations: 15,
    duration: Date.now() - startTime,
    environment: process.env.NODE_ENV || 'development'
  });
}

main()
  .then(() => prismaClient.$disconnect())
  .catch((e) => {
    logger.error("Ошибка при сидировании", e as Error, {
      environment: process.env.NODE_ENV || 'development',
      databaseUrl: process.env.DATABASE_URL ? 'configured' : 'missing'
    });
    prismaClient.$disconnect().finally(() => process.exit(1));
  });
