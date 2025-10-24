"use server";

import { prisma } from "@gafus/prisma";
import { z } from "zod";

const courseTypeSchema = z.string().trim().min(1);

/**
 * Получает базовые метаданные курса для Open Graph (без пользовательских данных)
 */
export async function getCourseMetadata(courseType: string) {
  const safeCourseType = courseTypeSchema.parse(courseType);

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

  return course;
}


