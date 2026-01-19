/**
 * ШАБЛОН ДЛЯ СОЗДАНИЯ API ROUTE
 *
 * API Routes для React Native приложения.
 * Вызывают services напрямую, используют getServerSession, CSRF защиту
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { NextRequest, NextResponse } from "next/server";
import { createWebLogger } from "@gafus/logger";
import { ValidationError, AuthorizationError, NotFoundError, ConflictError } from "@shared/errors";

// Импорт из соответствующего service
import {
  createEntity,
  getEntity,
  getUserEntities,
  updateEntity,
  deleteEntity,
  type CreateEntityData,
  type UpdateEntityData,
  type EntityData
} from "@shared/services/entity/entityService";

const logger = createWebLogger('api-entity');

/**
 * GET /api/entity - Получить все сущности пользователя
 */
export async function GET(request: NextRequest) {
  try {
    // Авторизация
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;

    // Получаем параметры запроса
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);

    // Вызываем service
    const entities = await getUserEntities(userId);

    // Применяем пагинацию (если нужно)
    const paginatedEntities = entities.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      data: paginatedEntities,
      pagination: {
        offset,
        limit,
        total: entities.length,
        hasMore: offset + limit < entities.length
      }
    });
  } catch (error) {
    logger.error("GET /api/entity failed", error as Error);

    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/entity - Создать новую сущность
 * CSRF защита обязательна для мутирующих операций
 */
export const POST = withCSRFProtection(async (request: NextRequest) => {
  try {
    // Авторизация
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;

    // Получаем JSON данные из тела запроса
    const body: CreateEntityData = await request.json();

    // Базовая валидация (service сделает бизнес-валидацию)
    if (!body.name?.trim()) {
      return NextResponse.json(
        { success: false, error: "Название обязательно" },
        { status: 400 }
      );
    }

    // Вызываем service
    const result = await createEntity(userId, body);

    logger.info("Entity created via API", { entityId: result.id, userId });

    return NextResponse.json({
      success: true,
      data: result
    }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/entity failed", error as Error);

    // Обработка типизированных ошибок
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { success: false, error: error.message, fields: error.fields },
        { status: 400 }
      );
    }

    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 }
      );
    }

    if (error instanceof ConflictError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Не удалось создать сущность" },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/entity/[entityId] - Обновить сущность
 * CSRF защита обязательна для мутирующих операций
 */
export const PUT = withCSRFProtection(async (
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) => {
  try {
    // Авторизация
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const { entityId } = await params;

    // Получаем JSON данные
    const body: UpdateEntityData = await request.json();

    // Вызываем service
    const result = await updateEntity(userId, entityId, body);

    logger.info("Entity updated via API", { entityId, userId });

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error("PUT /api/entity/[entityId] failed", error as Error, { entityId });

    if (error instanceof ValidationError) {
      return NextResponse.json(
        { success: false, error: error.message, fields: error.fields },
        { status: 400 }
      );
    }

    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Не удалось обновить сущность" },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/entity/[entityId] - Удалить сущность
 * CSRF защита обязательна для мутирующих операций
 */
export const DELETE = withCSRFProtection(async (
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) => {
  try {
    // Авторизация
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const { entityId } = await params;

    // Вызываем service
    await deleteEntity(userId, entityId);

    logger.info("Entity deleted via API", { entityId, userId });

    return NextResponse.json({
      success: true,
      message: "Сущность успешно удалена"
    });
  } catch (error) {
    logger.error("DELETE /api/entity/[entityId] failed", error as Error, { entityId });

    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Не удалось удалить сущность" },
      { status: 500 }
    );
  }
});

/**
 * PATCH /api/entity/[entityId]/restore - Восстановить сущность (если поддерживается)
 * CSRF защита обязательна для мутирующих операций
 */
export const PATCH = withCSRFProtection(async (
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) => {
  // Реализация аналогична PUT, но для частичных обновлений
  // или специальных операций типа restore, toggle и т.д.
});