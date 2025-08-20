"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcrypt_1 = __importDefault(require("bcrypt"));
const index_1 = require("./src/index");
const prismaClient = index_1.prisma;
async function main() {
    console.warn("💡 Начинаем сидирование базы данных...");
    const hashedPassword = await bcrypt_1.default.hash("2407041", 10);
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
    console.warn("✅ Админ создан или найден");
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
                logoImg: "/shared/uploads/courses/3122311.jpg",
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
                logoImg: "/shared/uploads/course-logo.png",
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
                logoImg: "/shared/uploads/courses/21312123.jpeg",
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
                logoImg: "/shared/uploads/courses/92086288.jpg",
                equipment: "Специальное оборудование",
                trainingLevel: "EXPERT",
                authorId: admin.id,
            },
        }),
    ]);
    console.warn("✅ Курсы созданы");
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
    console.warn("✅ Базовые шаги созданы");
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
    console.warn("✅ Связка шагов с базовым днём выполнена");
    for (let i = 1; i <= 14; i++) {
        await prismaClient.dayOnCourse.createMany({
            data: [
                { courseId: homeCourse.id, dayId: baseDay.id, order: i },
                { courseId: streetCourse.id, dayId: baseDay.id, order: i },
            ],
        });
    }
    console.warn("✅ Базовый день добавлен в курсы на 14 дней");
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
    console.warn("✅ Щенячий день добавлен в курс");
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
    console.warn("✅ Авторский день добавлен в курс");
    await prismaClient.favoriteCourse.createMany({
        data: [
            { userId: admin.id, courseId: homeCourse.id },
            { userId: admin.id, courseId: streetCourse.id },
        ],
        skipDuplicates: true,
    });
    console.warn("⭐ Курсы добавлены в избранное");
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
    console.warn("✅ Отзывы добавлены");
    const allCourses = await prismaClient.course.findMany({
        include: { reviews: true },
    });
    for (const course of allCourses) {
        const ratings = course.reviews
            .map((r) => r.rating)
            .filter((r) => typeof r === "number");
        const avg = ratings.length ? ratings.reduce((acc, r) => acc + r, 0) / ratings.length : null;
        await prismaClient.course.update({
            where: { id: course.id },
            data: { avgRating: avg },
        });
    }
    console.warn("📊 Средние рейтинги обновлены");
    const hashedTrainerPassword = await bcrypt_1.default.hash("trainer123", 10);
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
    console.warn("👨‍🏫 Тренер создан");
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
    console.warn("✅ Шаги тренера созданы");
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
    console.warn("✅ Дни тренера со связанными шагами созданы");
    const [trainerCourse1, trainerCourse2] = await prismaClient.$transaction([
        prismaClient.course.create({
            data: {
                name: "Курс тренера 1",
                type: "trainer-course-1",
                description: "Первый курс от тренера",
                shortDesc: "Кратко о первом курсе",
                duration: "3 дня",
                logoImg: "/shared/uploads/courses/trainer1.jpg",
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
                logoImg: "/shared/uploads/courses/trainer2.jpg",
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
    console.warn("✅ Курсы тренера созданы и дни добавлены в них");
    console.warn("✅ Seed успешно выполнен");
}
main()
    .then(() => prismaClient.$disconnect())
    .catch((e) => {
    console.error("❌ Ошибка при сидировании", e);
    prismaClient.$disconnect().finally(() => process.exit(1));
});
