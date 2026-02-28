#!/usr/bin/env node

/**
 * Скрипт для автоматической настройки дашбордов в Seq
 * Создает дашборды для каждого контейнера и общий дашборд с ошибками
 */

const https = require("https");
const http = require("http");

// Конфигурация
const SEQ_URL = process.env.SEQ_URL || "http://localhost:5341";
const SEQ_API_KEY = process.env.SEQ_API_KEY || ""; // API ключ Seq (обязателен для создания сигналов и дашбордов)

// Контейнеры для создания дашбордов
const CONTAINERS = [
  { name: "gafus-web", title: "Web Application" },
  { name: "gafus-trainer-panel", title: "Trainer Panel" },
  { name: "gafus-admin-panel", title: "Admin Panel" },
  { name: "gafus-worker", title: "Worker" },
  { name: "gafus-telegram-bot", title: "Telegram Bot" },
];

// Функция для выполнения HTTP запросов
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const client = isHttps ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        // Пробуем оба формата аутентификации (Seq может использовать Authorization или X-Seq-ApiKey)
        ...(SEQ_API_KEY
          ? {
              "X-Seq-ApiKey": SEQ_API_KEY,
              Authorization: `ApiKey ${SEQ_API_KEY}`,
            }
          : {}),
        Accept: "application/json",
        ...(options.headers || {}),
      },
    };

    if (options.body) {
      requestOptions.headers["Content-Length"] = Buffer.byteLength(options.body);
    }

    const req = client.request(requestOptions, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const jsonData = data ? JSON.parse(data) : null;
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, data: jsonData });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

// Создание сигнала в Seq
async function createSignal(title, filter) {
  try {
    // Seq API использует заглавные буквы для полей
    const signalData = {
      Title: title,
      Description: `Auto-generated signal for: ${title}`,
      Filters: filter,
    };

    console.log(`📊 Creating signal: ${title}`);
    console.log(`   Filter: ${filter}`);

    // Seq API: POST /api/signals (может требовать workspace или другой endpoint)
    let response;
    try {
      // Пробуем стандартный endpoint
      response = await makeRequest(SEQ_URL + "/api/signals", {
        method: "POST",
        body: JSON.stringify(signalData),
      });
    } catch (error) {
      // Если 404, пробуем с workspace или другой формат
      if (error.message.includes("404")) {
        try {
          // Пробуем без /api префикса (некоторые версии)
          response = await makeRequest(SEQ_URL + "/signals", {
            method: "POST",
            body: JSON.stringify(signalData),
          });
        } catch (error2) {
          throw error; // Выбрасываем оригинальную ошибку
        }
      } else {
        throw error;
      }
    }

    console.log(`   ✅ Signal created: ${response.data?.Id || response.data?.id || "success"}`);
    return response.data;
  } catch (error) {
    // Если сигнал уже существует, попробуем обновить или пропустить
    if (
      error.message.includes("409") ||
      error.message.includes("Conflict") ||
      error.message.includes("already exists")
    ) {
      console.log(`   ⚠️  Signal already exists, skipping...`);
      return null;
    }
    console.error(`   ❌ Error creating signal: ${error.message}`);
    throw error;
  }
}

// Создание дашборда в Seq
async function createDashboard(title, description, widgets) {
  try {
    // Seq API использует заглавные буквы для полей
    const dashboardData = {
      Title: title,
      Description: description,
      Charts: widgets, // Seq использует Charts вместо widgets
    };

    console.log(`\n📈 Creating dashboard: ${title}`);

    // Seq API: POST /api/dashboards
    const response = await makeRequest(SEQ_URL + "/api/dashboards", {
      method: "POST",
      body: JSON.stringify(dashboardData),
    });

    console.log(`   ✅ Dashboard created: ${response.data?.Id || response.data?.id || "success"}`);
    return response.data;
  } catch (error) {
    if (
      error.message.includes("409") ||
      error.message.includes("Conflict") ||
      error.message.includes("already exists")
    ) {
      console.log(`   ⚠️  Dashboard already exists, skipping...`);
      return null;
    }
    console.error(`   ❌ Error creating dashboard: ${error.message}`);
    throw error;
  }
}

// Вывод инструкций для ручной настройки
function printManualInstructions() {
  console.log("\n📖 ИНСТРУКЦИИ ДЛЯ РУЧНОЙ НАСТРОЙКИ ДАШБОРДОВ\n");
  console.log("Если автоматическая настройка через API недоступна, следуйте этим инструкциям:\n");

  console.log("1. Создание сигналов для контейнеров:\n");
  for (const container of CONTAINERS) {
    console.log(`   - Сигнал: "Logs: ${container.title}"`);
    console.log(`     Фильтр: ContainerName = '${container.name}'`);
    console.log(`     Как создать:`);
    console.log(`       a) Откройте Seq: ${SEQ_URL}`);
    console.log(`       b) В поиске введите: ContainerName = '${container.name}'`);
    console.log(`       c) Нажмите "Save as signal"`);
    console.log(`       d) Название: "Logs: ${container.title}"`);
    console.log("");
  }

  console.log("2. Создание сигнала для ошибок:\n");
  console.log('   - Сигнал: "Errors - All Containers"');
  console.log("   - Фильтр: Level in ('Error', 'Fatal', 'Warning')");
  console.log("   - Как создать:");
  console.log("     a) В поиске введите: Level in ('Error', 'Fatal', 'Warning')");
  console.log('     b) Нажмите "Save as signal"');
  console.log('     c) Название: "Errors - All Containers"');
  console.log("");

  console.log("3. Создание дашбордов для контейнеров:\n");
  for (const container of CONTAINERS) {
    console.log(`   Дашборд: "${container.title}"`);
    console.log(`   - Название: "${container.title}"`);
    console.log(`   - Сигнал: "Logs: ${container.title}"`);
    console.log(`   - Виджеты:`);
    console.log(`     * Timeline график логов`);
    console.log(`     * Таблица последних логов`);
    console.log(`     * Статистика по уровням логов`);
    console.log(`   - Как создать:`);
    console.log(`     a) Перейдите в "Dashboards"`);
    console.log(`     b) Нажмите "New Dashboard"`);
    console.log(`     c) Название: "${container.title}"`);
    console.log(`     d) Добавьте виджеты, используя сигнал "Logs: ${container.title}"`);
    console.log("");
  }

  console.log("4. Создание дашборда с ошибками:\n");
  console.log('   - Название: "Errors - All Containers"');
  console.log('   - Сигнал: "Errors - All Containers"');
  console.log("   - Виджеты:");
  console.log("     * Timeline график ошибок по времени");
  console.log("     * Bar Chart - распределение ошибок по контейнерам");
  console.log("     * Table - таблица последних ошибок с деталями");
  console.log("   - Как создать:");
  console.log('     a) Перейдите в "Dashboards"');
  console.log('     b) Нажмите "New Dashboard"');
  console.log('     c) Название: "Errors - All Containers"');
  console.log('     d) Добавьте виджеты, используя сигнал "Errors - All Containers"');
  console.log("");

  console.log("📚 Подробная документация: docs/deployment/seq-dashboards.md\n");
}

// Основная функция
async function setupDashboards() {
  console.log("🚀 Настройка дашбордов в Seq\n");
  console.log(`📍 Seq URL: ${SEQ_URL}\n`);

  // Проверка наличия API ключа (обязателен для Seq 2025+)
  if (!SEQ_API_KEY) {
    console.log("⚠️  API ключ не указан!\n");
    console.log("Для создания дашбордов через API необходим API ключ Seq.\n");
    console.log("📝 Как создать API ключ:");
    console.log("   1. Откройте Seq: " + SEQ_URL);
    console.log('   2. Перейдите в "Personal" (ваш аккаунт) → "API Keys"');
    console.log('   3. Нажмите "New API Key" или создайте новый ключ');
    console.log(
      '   4. Установите разрешение "Ingest" (минимум, для полного доступа можно все разрешения)',
    );
    console.log("   5. Скопируйте сгенерированный токен");
    console.log("   6. Запустите скрипт с переменной окружения:\n");
    console.log("      export SEQ_API_KEY=your-api-key-here");
    console.log("      node scripts/setup-seq-dashboards.js\n");
    console.log("Или добавьте API ключ в команду:\n");
    console.log("      SEQ_API_KEY=your-api-key-here node scripts/setup-seq-dashboards.js\n");
    printManualInstructions();
    process.exit(1);
  }

  console.log(`🔑 API ключ: ${SEQ_API_KEY.substring(0, 8)}...\n`);

  let apiAvailable = false;

  try {
    // Проверка доступности Seq API с аутентификацией
    console.log("🔍 Проверка доступности Seq API...");
    try {
      // Проверяем API с ключом через запрос к signals
      const testResponse = await makeRequest(SEQ_URL + "/api/signals", {
        method: "GET",
      });
      apiAvailable = true;
      console.log("   ✅ Seq API доступен и аутентифицирован\n");
    } catch (error) {
      if (error.message.includes("401") || error.message.includes("403")) {
        console.log("   ❌ Ошибка аутентификации (401/403)\n");
        console.log("   💡 Проверьте правильность API ключа и наличие разрешений\n");
        process.exit(1);
      } else if (error.message.includes("404")) {
        console.log("   ⚠️  API endpoint не найден - возможно используется старая версия Seq\n");
        console.log("   Используем ручную настройку\n");
      } else if (error.message.includes("ECONNREFUSED")) {
        console.log("   ❌ Seq недоступен - проверьте, что Seq запущен\n");
        console.log(
          `   💡 Запустите: docker-compose -f ci-cd/docker/docker-compose.prod.yml up -d seq\n`,
        );
        printManualInstructions();
        process.exit(1);
      } else {
        console.log(`   ⚠️  Предупреждение: ${error.message}`);
        console.log("   Продолжаем... (возможно API работает, но endpoint другой)\n");
        apiAvailable = true; // Попробуем все равно
      }
    }

    // Если API недоступен, выводим инструкции и завершаем
    if (!apiAvailable) {
      console.log("📝 Автоматическое создание через API недоступно.\n");
      printManualInstructions();
      process.exit(0);
    }

    // Создание сигналов для каждого контейнера
    console.log("📊 Создание сигналов для контейнеров...\n");
    const containerSignals = [];

    for (const container of CONTAINERS) {
      const filter = `ContainerName = '${container.name}'`;
      const signalTitle = `Logs: ${container.title}`;

      try {
        const signal = await createSignal(signalTitle, filter);
        if (signal) {
          containerSignals.push({
            ...container,
            signalId: signal.id,
            signalTitle,
            filter,
          });
        } else {
          // Если сигнал уже существует, используем его название для поиска
          containerSignals.push({
            ...container,
            signalTitle,
            filter,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 200)); // Небольшая задержка между запросами
      } catch (error) {
        if (error.message.includes("404")) {
          console.log(`   ⚠️  API endpoint не найден - используем ручную настройку\n`);
          printManualInstructions();
          process.exit(0);
        }
        throw error;
      }
    }

    // Создание сигнала для ошибок
    console.log("\n📊 Создание сигнала для ошибок...");
    const errorsFilter = "Level in ('Error', 'Fatal', 'Warning')";
    const errorsSignalTitle = "Errors - All Containers";
    try {
      await createSignal(errorsSignalTitle, errorsFilter);
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      if (error.message.includes("404")) {
        console.log(`   ⚠️  API endpoint не найден - используем ручную настройку\n`);
        printManualInstructions();
        process.exit(0);
      }
      throw error;
    }

    // Создание дашбордов для каждого контейнера
    console.log("\n📈 Создание дашбордов для контейнеров...\n");

    for (const container of containerSignals) {
      const widgets = [
        {
          Title: `${container.title} - Logs`,
          Type: "Timeline",
          Signal: container.signalTitle || `Logs: ${container.title}`,
          Query: container.filter,
        },
      ];

      await createDashboard(
        container.title,
        `Logs dashboard for ${container.name} container`,
        widgets,
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Создание общего дашборда с ошибками
    console.log("\n📈 Создание дашборда с ошибками...");
    const errorsWidgets = [
      {
        Title: "Errors and Warnings",
        Type: "Timeline",
        Signal: errorsSignalTitle,
        Query: errorsFilter,
      },
    ];

    await createDashboard(
      "Errors - All Containers",
      "Dashboard showing all errors, fatal errors, and warnings from all containers",
      errorsWidgets,
    );

    console.log("\n✅ Настройка дашбордов завершена!");
    console.log("\n📝 Итоги:");
    console.log(`   - Создано сигналов: ${CONTAINERS.length + 1}`);
    console.log(`   - Создано дашбордов: ${CONTAINERS.length + 1}`);
    console.log(`\n🌐 Откройте Seq: ${SEQ_URL}`);
  } catch (error) {
    console.error("\n❌ Ошибка при настройке дашбордов:");
    console.error(error.message);

    if (error.message.includes("ECONNREFUSED")) {
      console.error("\n💡 Убедитесь, что Seq запущен и доступен по адресу:", SEQ_URL);
      console.error(
        "   Можно запустить: docker-compose -f ci-cd/docker/docker-compose.prod.yml up -d seq\n",
      );
    } else if (error.message.includes("404")) {
      console.error("\n💡 Seq API endpoint не найден.");
      console.error("   Возможно, ваша версия Seq не поддерживает API для создания дашбордов.\n");
    }

    console.log("📖 Используйте ручную настройку согласно инструкциям ниже:\n");
    printManualInstructions();
    process.exit(1);
  }
}

// Запуск скрипта
if (require.main === module) {
  setupDashboards().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

module.exports = { setupDashboards };
