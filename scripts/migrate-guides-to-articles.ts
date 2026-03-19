/**
 * Миграция мини-гайдов из Course в сущность Article.
 * Запуск: pnpm tsx scripts/migrate-guides-to-articles.ts [--dry-run]
 */
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("migrate-guides-to-articles");
const DRY_RUN = process.argv.includes("--dry-run");

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function main() {
  const courses = await prisma.course.findMany({
    where: { guideContent: { not: null } },
    select: {
      id: true,
      name: true,
      type: true,
      authorId: true,
      guideContent: true,
      isPaid: true,
      priceRub: true,
      logoImg: true,
      videoUrl: true,
      access: { select: { userId: true } },
    },
  });

  const guideCourses = courses.filter(
    (c) => c.guideContent && c.guideContent.trim() !== ""
  );

  logger.info(`Найдено ${guideCourses.length} курсов-гайдов для миграции`);
  if (DRY_RUN) {
    logger.info("DRY RUN — данные не будут записаны");
  }

  let created = 0;
  for (const course of guideCourses) {
    const baseSlug = slugify(course.type || course.name);
    const slug = baseSlug || `article-${course.id.slice(0, 8)}`;
    const existing = await prisma.article.findUnique({ where: { slug } });
    const finalSlug = existing ? `${slug}-${course.id.slice(0, 8)}` : slug;

    if (DRY_RUN) {
      logger.info(`Создастся статья: "${course.name}" → slug: ${finalSlug}`);
      created++;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const article = await tx.article.create({
        data: {
          authorId: course.authorId,
          title: course.name,
          content: course.guideContent!,
          contentType: "HTML",
          visibility: course.isPaid ? "PAID" : "PUBLIC",
          priceRub: course.isPaid ? course.priceRub : null,
          videoUrl: course.videoUrl,
          imageUrls: course.logoImg ? [course.logoImg] : [],
          slug: finalSlug,
        },
      });

      if (course.isPaid && course.access.length > 0) {
        await tx.articleAccess.createMany({
          data: course.access.map((a) => ({
            userId: a.userId,
            articleId: article.id,
          })),
          skipDuplicates: true,
        });
      }

      created++;
      logger.info(`Создана статья "${article.title}" (slug: ${finalSlug})`);
    });
  }

  logger.info(
    `Миграция завершена: ${created} статей ${DRY_RUN ? "было бы создано" : "создано"}`
  );
}

main().catch((e) => {
  logger.error("Миграция не выполнена", e as Error);
  process.exit(1);
});
