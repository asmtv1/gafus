"use server";

import { prisma } from "@gafus/prisma";
// В серверных функциях избегаем кастомного логгера, чтобы не задействовать worker в dev окружении

export interface StepTemplateWithCategory {
  id: string;
  title: string;
  description: string;
  durationSec: number | null;
  type: string;
  imageUrls: string[];
  pdfUrls: string[];
  videoUrl: string | null;
  checklist: unknown;
  requiresVideoReport: boolean;
  requiresWrittenFeedback: boolean;
  hasTestQuestions: boolean;
  tags: string[];
  isPublic: boolean;
  usageCount: number;
  category: {
    id: string;
    name: string;
    icon: string | null;
  } | null;
  author: {
    id: string;
    username: string;
  };
  createdAt: Date;
}

/**
 * Получает список шаблонов шагов
 * @param categoryId - ID категории для фильтрации (необязательно)
 * @returns Список шаблонов
 */
export async function getStepTemplates(categoryId?: string): Promise<StepTemplateWithCategory[]> {
  try {
    console.info("[trainer-panel] Получение списка шаблонов шагов", { categoryId });

    const templates = await prisma.stepTemplate.findMany({
      where: {
        isPublic: true,
        ...(categoryId ? { categoryId } : {}),
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            icon: true,
          },
        },
        author: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: [{ usageCount: "desc" }, { createdAt: "desc" }],
    });

    console.info("[trainer-panel] Шаблоны успешно получены", { count: templates.length });

    return templates.map((template) => ({
      ...template,
      type: template.type as string,
    }));
  } catch (error) {
    console.error("[trainer-panel] Ошибка при получении шаблонов", error);
    throw error;
  }
}

/**
 * Получает один шаблон по ID
 */
export async function getStepTemplateById(id: string): Promise<StepTemplateWithCategory | null> {
  try {
    console.info("[trainer-panel] Получение шаблона по ID", { id });

    const template = await prisma.stepTemplate.findUnique({
      where: { id },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            icon: true,
          },
        },
        author: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!template) {
      console.warn("[trainer-panel] Шаблон не найден", { id });
      return null;
    }

    return {
      ...template,
      type: template.type as string,
    };
  } catch (error) {
    console.error("[trainer-panel] Ошибка при получении шаблона", error, { id });
    throw error;
  }
}

/**
 * Поиск шаблонов по запросу
 */
export async function searchStepTemplates(query: string): Promise<StepTemplateWithCategory[]> {
  try {
    console.info("[trainer-panel] Поиск шаблонов", { query });

    const templates = await prisma.stepTemplate.findMany({
      where: {
        isPublic: true,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { tags: { has: query.toLowerCase() } },
        ],
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            icon: true,
          },
        },
        author: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: [{ usageCount: "desc" }],
      take: 20,
    });

    console.info("[trainer-panel] Поиск завершен", { count: templates.length, query });

    return templates.map((template) => ({
      ...template,
      type: template.type as string,
    }));
  } catch (error) {
    console.error("[trainer-panel] Ошибка при поиске шаблонов", error, { query });
    throw error;
  }
}
