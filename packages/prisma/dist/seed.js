import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
const prisma = new PrismaClient();
async function main() {
    // 1. Админ-пользователь
    const hashedPassword = await bcrypt.hash("2407041", 10);
    const admin = await prisma.user.create({
        data: {
            username: "admin",
            phone: "+79198031371",
            password: hashedPassword,
            role: "ADMIN",
        },
    });
    // 2. Курсы
    await prisma.course.createMany({
        data: [
            {
                name: "Тренировки дома",
                type: "home",
                description: "Как тренировать хвостика дома",
                shortDesc: "Кратко о курсе",
                duration: "2 недели",
                logoImg: "/course-logo.jpg",
                authorId: admin.id,
            },
            {
                name: "Тренировки на улице",
                type: "street",
                description: "Как тренировать хвостика на улице",
                shortDesc: "Кратко о курсе",
                duration: "2 недели",
                logoImg: "/course-logo.jpg",
                authorId: admin.id,
            },
            {
                name: "Щенок на карантине",
                type: "puppy",
                description: "Что делать, пока он маленький",
                shortDesc: "Кратко о курсе",
                duration: "1 месяц",
                logoImg: "/course-logo.jpg",
                authorId: admin.id,
            },
            {
                name: "Авторский курс",
                type: "authors",
                description: "Супер-методика by Буй с Бугра",
                shortDesc: "Кратко о курсе",
                duration: "много лет",
                logoImg: "/course-logo.jpg",
                authorId: admin.id,
            },
        ],
        skipDuplicates: true,
    });
    // 3. Дни и шаги для курса "Тренировки дома" (id: 1)
    for (let day = 1; day <= 14; day++) {
        await prisma.trainingDay.create({
            data: {
                title: `День ${day}`,
                dayNumber: day,
                type: "home",
                course: { connect: { id: 1 } },
                steps: {
                    create: [
                        {
                            title: "Упражнение 1",
                            durationSec: 60,
                            description: "Описание 1",
                        },
                        {
                            title: "Упражнение 2",
                            durationSec: 60,
                            description: "Описание 2",
                        },
                        {
                            title: "Упражнение 3",
                            durationSec: 60,
                            description: "Описание 3",
                        },
                    ],
                },
            },
        });
    }
    // 4. Дни и шаги для курса "Тренировки на улице" (id: 2)
    for (let day = 1; day <= 14; day++) {
        await prisma.trainingDay.create({
            data: {
                title: `День ${day}`,
                dayNumber: day,
                type: "street",
                course: { connect: { id: 2 } },
                steps: {
                    create: [
                        {
                            title: "Упражнение A",
                            durationSec: 120,
                            description: "Описание A",
                        },
                        {
                            title: "Упражнение B",
                            durationSec: 90,
                            description: "Описание B",
                        },
                    ],
                },
            },
        });
    }
    // 5. Пример дня для "Щенок на карантине" (id: 3)
    await prisma.trainingDay.create({
        data: {
            title: "День 1",
            dayNumber: 1,
            type: "puppy",
            course: { connect: { id: 3 } },
            steps: {
                create: [
                    { title: "Игры для щенка", durationSec: 30, description: "" },
                    { title: "Первый выход на улицу", durationSec: 30, description: "" },
                ],
            },
        },
    });
    // 6. Пример дня для "Авторский курс" (id: 4)
    await prisma.trainingDay.create({
        data: {
            title: "День 1",
            dayNumber: 1,
            type: "authors",
            course: { connect: { id: 4 } },
            steps: {
                create: [{ title: "Спец-методика", durationSec: 120, description: "" }],
            },
        },
    });
    // 7. Добавление избранных курсов пользователю
    await prisma.favoriteCourse.createMany({
        data: [
            { userId: admin.id, courseId: 1 },
            { userId: admin.id, courseId: 2 },
        ],
        skipDuplicates: true,
    });
    // 8. Отзывы пользователя на курсы
    await prisma.courseReview.createMany({
        data: [
            {
                userId: admin.id,
                courseId: 1,
                rating: 5,
                comment: "Отличный курс, все понравилось!",
            },
            {
                userId: admin.id,
                courseId: 2,
                rating: 4,
                comment: "Хороший курс, но хотелось бы больше примеров.",
            },
        ],
        skipDuplicates: true,
    });
    // 9. Обновление avgRating для каждого курса
    const courses = await prisma.course.findMany({
        include: { reviews: true },
    });
    for (const course of courses) {
        const ratings = course.reviews
            .map((r) => r.rating)
            .filter((r) => r !== null);
        const averageRating = ratings.length
            ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
            : null;
        await prisma.course.update({
            where: { id: course.id },
            data: { avgRating: averageRating },
        });
    }
    console.log("Seed completed!");
}
main()
    .then(() => prisma.$disconnect())
    .catch((e) => prisma.$disconnect().finally(() => {
    throw e;
}));
