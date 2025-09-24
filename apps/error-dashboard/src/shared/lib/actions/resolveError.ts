"use server";

import { prisma } from "@gafus/prisma";
import { createErrorDashboardLogger } from "@gafus/logger";

const logger = createErrorDashboardLogger('error-dashboard-resolve');

export async function resolveErrorAction(errorId: string) {
  try {
    logger.info("🔧 Resolving error", { errorId, operation: 'resolve' });

    // Проверяем, существует ли ошибка
    const existingError = await prisma.errorReport.findUnique({
      where: { id: errorId }
    });

    if (!existingError) {
      logger.warn("⚠️ Error not found", { errorId, operation: 'resolve' });
      return {
        success: false,
        error: "Ошибка не найдена"
      };
    }

    if (existingError.resolved) {
      logger.info("ℹ️ Error already resolved", { errorId, operation: 'resolve' });
      return {
        success: true,
        message: "Ошибка уже была решена"
      };
    }

    // Обновляем ошибку как решенную
    const updatedError = await prisma.errorReport.update({
      where: { id: errorId },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy: "system" // В будущем можно добавить информацию о пользователе
      }
    });

    logger.info("✅ Error resolved successfully", { 
      errorId, 
      operation: 'resolve',
      resolvedAt: updatedError.resolvedAt
    });

    return {
      success: true,
      message: "Ошибка успешно помечена как решенная",
      error: updatedError
    };

  } catch (error) {
    logger.error("❌ Failed to resolve error", error as Error, { 
      errorId, 
      operation: 'resolve' 
    });
    
    return {
      success: false,
      error: "Не удалось разрешить ошибку"
    };
  }
}

export async function unresolveErrorAction(errorId: string) {
  try {
    logger.info("🔄 Unresolving error", { errorId, operation: 'unresolve' });

    // Проверяем, существует ли ошибка
    const existingError = await prisma.errorReport.findUnique({
      where: { id: errorId }
    });

    if (!existingError) {
      logger.warn("⚠️ Error not found", { errorId, operation: 'unresolve' });
      return {
        success: false,
        error: "Ошибка не найдена"
      };
    }

    if (!existingError.resolved) {
      logger.info("ℹ️ Error already unresolved", { errorId, operation: 'unresolve' });
      return {
        success: true,
        message: "Ошибка уже не решена"
      };
    }

    // Обновляем ошибку как не решенную
    const updatedError = await prisma.errorReport.update({
      where: { id: errorId },
      data: {
        resolved: false,
        resolvedAt: null,
        resolvedBy: null
      }
    });

    logger.info("✅ Error unresolved successfully", { 
      errorId, 
      operation: 'unresolve'
    });

    return {
      success: true,
      message: "Ошибка успешно помечена как не решенная",
      error: updatedError
    };

  } catch (error) {
    logger.error("❌ Failed to unresolve error", error as Error, { 
      errorId, 
      operation: 'unresolve' 
    });
    
    return {
      success: false,
      error: "Не удалось изменить статус ошибки"
    };
  }
}
