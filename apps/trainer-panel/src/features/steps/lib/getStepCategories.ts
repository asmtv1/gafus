"use server";

import { prisma } from "@gafus/prisma";
// Избегаем кастомного логгера в серверной функции, чтобы исключить worker

export interface StepCategoryWithCount {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  order: number;
  templateCount: number;
}

/**
 * Получает список категорий шаблонов
 * @returns Список категорий с количеством шаблонов
 */
export async function getStepCategories(): Promise<StepCategoryWithCount[]> {
  try {
    console.info('[trainer-panel] Получение списка категорий шаблонов');

    const categories = await prisma.stepCategory.findMany({
      include: {
        _count: {
          select: {
            templates: {
              where: {
                isPublic: true,
              },
            },
          },
        },
      },
      orderBy: {
        order: 'asc',
      },
    });

    const result = categories.map(category => ({
      id: category.id,
      name: category.name,
      description: category.description,
      icon: category.icon,
      order: category.order,
      templateCount: category._count.templates,
    }));

    console.info('[trainer-panel] Категории успешно получены', { count: result.length });

    return result;
  } catch (error) {
    console.error('[trainer-panel] Ошибка при получении категорий', error);
    throw error;
  }
}

