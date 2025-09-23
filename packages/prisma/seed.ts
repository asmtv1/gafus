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
        title: "Упражнение 1",
        description: "Описание 1",
        durationSec: 60,
        authorId: admin.id,
      },
    }),
    prismaClient.step.create({
      data: {
        title: "Упражнение 2",
        description: "Описание 2",
        durationSec: 90,
        authorId: admin.id,
      },
    }),
    prismaClient.step.create({
      data: {
        title: "Упражнение 3",
        description: "Описание 3",
        durationSec: 120,
        authorId: admin.id,
      },
    }),
  ]);
  logger.success("Базовые шаги созданы", {
    stepCount: steps.length,
    stepTypes: steps.map(s => s.type)
  });

  const baseDay = await prismaClient.trainingDay.create({
    data: {
      title: "Базовый день",
      type: "base",
      equipment: "Поводок, игрушки, лакомства",
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
    stepCount: steps.length
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
      title: "Щенячий день",
      type: "puppy",
      equipment: "Игрушки, лакомства, пеленки",
      authorId: admin.id,
    },
  });
  const [stepP1, stepP2] = await prismaClient.$transaction([
    prismaClient.step.create({
      data: {
        title: "Игры для щенка",
        description: "",
        durationSec: 30,
        authorId: admin.id,
      },
    }),
    prismaClient.step.create({
      data: {
        title: "Первый выход на улицу",
        description: "",
        durationSec: 30,
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
    stepCount: puppySteps.length
  });

  const authorDay = await prismaClient.trainingDay.create({
    data: {
      title: "Авторский день",
      type: "authors",
      equipment: "Специальное оборудование",
      authorId: admin.id,
    },
  });
  const authorStep = await prismaClient.step.create({
    data: {
      title: "Спец-методика",
      description: "",
      durationSec: 120,
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
    stepCount: authorSteps.length
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
    reviewCount: reviews.length,
    averageRating: reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
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
    courseCount: 4,
    averageRatings: courses.map(c => ({ id: c.id, rating: c.averageRating }))
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
        title: "Разминка для собаки",
        description: "Небольшая разминка перед тренировкой",
        durationSec: 45,
        authorId: trainer.id,
      },
    }),
    prismaClient.step.create({
      data: {
        title: "Аппортировка",
        description: "Учимся приносить предметы",
        durationSec: 90,
        authorId: trainer.id,
      },
    }),
  ]);
  logger.success("Шаги тренера созданы", {
    trainerId: trainer.id,
    stepCount: trainerSteps.length,
    stepTypes: trainerSteps.map(s => s.type)
  });

  const [trainerDay1, trainerDay2] = await prismaClient.$transaction([
    prismaClient.trainingDay.create({
      data: {
        title: "День тренировок A",
        type: "trainer",
        equipment: "Базовое оборудование",
        authorId: trainer.id,
      },
    }),
    prismaClient.trainingDay.create({
      data: {
        title: "День тренировок B",
        type: "trainer",
        equipment: "Продвинутое оборудование",
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
    dayCount: trainerDays.length,
    totalSteps: trainerDays.reduce((sum, day) => sum + day.steps.length, 0)
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
    courseCount: trainerCourses.length,
    totalDays: trainerCourses.reduce((sum, course) => sum + course.days.length, 0)
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
