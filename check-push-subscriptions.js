const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function checkPushSubscriptions() {
  try {
    console.log("🔍 Проверяем push-подписки в базе данных...");

    // Проверяем все push-подписки
    const subscriptions = await prisma.pushSubscription.findMany({
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    console.log(`📊 Найдено push-подписок: ${subscriptions.length}`);

    if (subscriptions.length === 0) {
      console.log("❌ Push-подписок не найдено!");
      console.log("💡 Возможные причины:");
      console.log("   1. Пользователи не разрешили уведомления в браузере");
      console.log("   2. Push-подписки не были сохранены в БД");
      console.log("   3. Проблема с Service Worker");
      return;
    }

    // Показываем детали каждой подписки
    subscriptions.forEach((sub, index) => {
      console.log(`\n📱 Подписка ${index + 1}:`);
      console.log(`   ID: ${sub.id}`);
      console.log(`   User ID: ${sub.userId}`);
      console.log(`   Username: ${sub.user?.username || "N/A"}`);
      console.log(`   Endpoint: ${sub.endpoint.substring(0, 50)}...`);
      console.log(`   Keys: ${JSON.stringify(sub.keys)}`);
      console.log(`   Created: ${sub.createdAt}`);
    });

    // Проверяем уведомления
    console.log("\n🔔 Проверяем уведомления...");
    const notifications = await prisma.stepNotification.findMany({
      include: {
        user: {
          select: {
            username: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
    });

    console.log(`📊 Последние уведомления: ${notifications.length}`);

    notifications.forEach((notif, index) => {
      console.log(`\n📨 Уведомление ${index + 1}:`);
      console.log(`   ID: ${notif.id}`);
      console.log(`   User: ${notif.user?.username || "N/A"}`);
      console.log(`   Day: ${notif.day}, Step: ${notif.stepIndex}`);
      console.log(`   Sent: ${notif.sent}`);
      console.log(`   Job ID: ${notif.jobId || "N/A"}`);
      console.log(`   Created: ${notif.createdAt}`);
    });
  } catch (error) {
    console.error("❌ Ошибка при проверке:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPushSubscriptions();
