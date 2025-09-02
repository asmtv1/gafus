#!/usr/bin/env node

/**
 * Скрипт для очистки дублированных push-подписок
 * Удаляет дубликаты, оставляя только самую новую подписку для каждого endpoint
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cleanDuplicateSubscriptions() {
  console.log('🧹 Начинаем очистку дублированных подписок...');
  
  try {
    // Находим все дублированные endpoint'ы
    const duplicates = await prisma.$queryRaw`
      SELECT endpoint, COUNT(*) as count
      FROM "PushSubscription"
      GROUP BY endpoint
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `;
    
    console.log(`📊 Найдено ${duplicates.length} дублированных endpoint'ов`);
    
    if (duplicates.length === 0) {
      console.log('✅ Дублированных подписок не найдено');
      return;
    }
    
    // Показываем статистику
    for (const duplicate of duplicates) {
      console.log(`🔗 ${duplicate.endpoint.substring(0, 50)}... - ${duplicate.count} дубликатов`);
    }
    
    // Удаляем дубликаты, оставляя только самую новую подписку
    let totalDeleted = 0;
    
    for (const duplicate of duplicates) {
      const subscriptions = await prisma.pushSubscription.findMany({
        where: { endpoint: duplicate.endpoint },
        orderBy: { createdAt: 'desc' },
      });
      
      // Оставляем первую (самую новую), удаляем остальные
      const toDelete = subscriptions.slice(1);
      
      for (const subscription of toDelete) {
        await prisma.pushSubscription.delete({
          where: { id: subscription.id },
        });
        totalDeleted++;
        console.log(`🗑️ Удалена дублированная подписка: ${subscription.id}`);
      }
    }
    
    console.log(`✅ Очистка завершена. Удалено ${totalDeleted} дублированных подписок`);
    
    // Показываем финальную статистику
    const finalCount = await prisma.pushSubscription.count();
    console.log(`📊 Итого подписок в БД: ${finalCount}`);
    
  } catch (error) {
    console.error('❌ Ошибка при очистке дублированных подписок:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем скрипт
cleanDuplicateSubscriptions();
