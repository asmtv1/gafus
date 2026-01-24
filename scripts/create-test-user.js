const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    console.log("🔐 Хэширование пароля...");
    const hashedPassword = await bcrypt.hash("2407041", 10);

    console.log("👤 Создание пользователя asmtv1...\n");

    const user = await prisma.user.create({
      data: {
        username: "asmtv1",
        phone: "89198031379",
        password: hashedPassword,
        isConfirmed: true,
        role: "USER",
        profile: {
          create: {
            fullName: "Test User ASMTV1",
          },
        },
      },
      include: {
        profile: true,
      },
    });

    console.log("✅ Пользователь успешно создан!\n");
    console.log("📋 Данные:");
    console.log(`   ID: ${user.id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Phone: ${user.phone}`);
    console.log(`   Confirmed: ${user.isConfirmed}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Profile ID: ${user.profile?.id}`);
    console.log("\n🔑 Для входа:");
    console.log(`   Username: asmtv1`);
    console.log(`   Password: 2407041`);
  } catch (error) {
    if (error.code === "P2002") {
      console.error("❌ Ошибка: Пользователь с таким username или phone уже существует");
    } else {
      console.error("❌ Ошибка:", error.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();
