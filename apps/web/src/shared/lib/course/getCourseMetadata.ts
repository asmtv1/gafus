"use server";

import { unstable_cache } from "next/cache";
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

const courseTypeSchema = z.string().trim().min(1);

// Создаем логгер для getCourseMetadata
const logger = createWebLogger('web-get-course-metadata');

/**
 * Получает базовые метаданные курса для Open Graph (без пользовательских данных)
 * Кэшируется на 20 минут с тегом courses-metadata
 */
export async function getCourseMetadata(courseType: string) {
  const safeCourseType = courseTypeSchema.parse(courseType);

  const cachedFunction = unstable_cache(
    async () => {
      try {
        logger.warn("[React Cache] Fetching course metadata for courseType:", { safeCourseType, operation: 'warn' });

        const course = await prisma.course.findFirst({
          where: { type: safeCourseType },
          select: {
            id: true,
            name: true,
            shortDesc: true,
            logoImg: true,
            description: true,
          },
        });

        logger.warn("[React Cache] Course metadata cached successfully", { courseType: safeCourseType, operation: 'warn' });
        return course;
      } catch (error) {
        logger.error("❌ Error in getCourseMetadata:", error as Error, { operation: 'error' });
        throw error;
      }
    },
    ["course-metadata", safeCourseType], // Включаем courseType в ключ кэша
    {
      revalidate: 20 * 60, // 20 минут
      tags: ["courses-metadata"],
    },
  );

  return await cachedFunction();
}


