#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Анализ использования зависимостей
function analyzeDependencies() {
  console.warn("🔍 Анализ использования зависимостей...");

  const apps = ["apps/web", "apps/trainer-panel", "apps/error-dashboard"];
  const results = {};

  apps.forEach((app) => {
    if (fs.existsSync(path.join(app, "package.json"))) {
      const packageJson = JSON.parse(fs.readFileSync(path.join(app, "package.json"), "utf8"));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

      console.warn(`\n📦 ${app}:`);
      console.warn(`  Всего зависимостей: ${Object.keys(dependencies).length}`);

      // Анализируем размер зависимостей
      const largeDeps = Object.entries(dependencies)
        .filter(([name, version]) => {
          // Исключаем workspace зависимости
          return !version.startsWith("workspace:");
        })
        .sort((a, b) => {
          // Сортируем по размеру (примерно)
          const sizeA = getPackageSize(a[0]);
          const sizeB = getPackageSize(b[0]);
          return sizeB - sizeA;
        })
        .slice(0, 10);

      console.warn("  Крупнейшие зависимости:");
      largeDeps.forEach(([name, version]) => {
        const size = getPackageSize(name);
        console.warn(`    ${name}@${version}: ~${size}KB`);
      });

      results[app] = {
        total: Object.keys(dependencies).length,
        largeDeps,
      };
    }
  });

  return results;
}

// Примерные размеры пакетов
function getPackageSize(packageName) {
  const sizes = {
    "@mui/material": 500,
    "@mui/icons-material": 300,
    react: 100,
    "react-dom": 100,
    next: 200,
    "@emotion/react": 50,
    "@emotion/styled": 50,
    zustand: 20,
    swr: 30,
    prisma: 150,
    bcrypt: 80,
    sharp: 200,
    workbox: 100,
  };

  return sizes[packageName] || 50;
}

// Поиск неиспользуемых импортов
function findUnusedImports(appPath) {
  console.warn(`\n🔍 Поиск неиспользуемых импортов в ${appPath}...`);

  const srcPath = path.join(appPath, "src");
  if (!fs.existsSync(srcPath)) return [];

  const files = getAllFiles(srcPath, [".ts", ".tsx"]);
  const unusedImports = [];

  files.forEach((file) => {
    const content = fs.readFileSync(file, "utf8");
    const imports = extractImports(content);

    imports.forEach((importInfo) => {
      if (!isImportUsed(content, importInfo.name, file)) {
        unusedImports.push({
          file: path.relative(appPath, file),
          import: importInfo,
        });
      }
    });
  });

  return unusedImports;
}

// Получение всех файлов
function getAllFiles(dir, extensions) {
  const files = [];

  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir);

    items.forEach((item) => {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory() && !item.startsWith(".")) {
        traverse(fullPath);
      } else if (extensions.some((ext) => item.endsWith(ext))) {
        files.push(fullPath);
      }
    });
  }

  traverse(dir);
  return files;
}

// Извлечение импортов из файла
function extractImports(content) {
  const imports = [];

  // Импорты из node_modules
  const moduleImports = content.match(/import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g);
  if (moduleImports) {
    moduleImports.forEach((imp) => {
      const match = imp.match(/import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/);
      if (match) {
        const names = match[1].split(",").map((s) => s.trim());
        const module = match[2];

        names.forEach((name) => {
          const cleanName = name.replace(/\s+as\s+\w+/, "");
          imports.push({
            name: cleanName,
            module,
            fullImport: imp,
          });
        });
      }
    });
  }

  // Отдельные импорты
  const singleImports = content.match(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g);
  if (singleImports) {
    singleImports.forEach((imp) => {
      const match = imp.match(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
      if (match) {
        imports.push({
          name: match[1],
          module: match[2],
          fullImport: imp,
        });
      }
    });
  }

  return imports;
}

// Проверка использования импорта
function isImportUsed(content, importName, filePath) {
  // Убираем импорты из поиска
  const contentWithoutImports = content.replace(/import\s+.*?from\s+['"][^'"]+['"];?\n?/g, "");

  // Ищем использование
  const usagePatterns = [
    new RegExp(`\\b${importName}\\b`, "g"),
    new RegExp(`<${importName}`, "g"),
    new RegExp(`</${importName}`, "g"),
  ];

  return usagePatterns.some((pattern) => pattern.test(contentWithoutImports));
}

// Рекомендации по оптимизации
function generateRecommendations(results) {
  console.warn("\n📋 Рекомендации по оптимизации:");

  Object.entries(results).forEach(([app, data]) => {
    console.warn(`\n🎯 ${app}:`);

    if (data.largeDeps.length > 0) {
      console.warn("  Крупные зависимости для оптимизации:");
      data.largeDeps.forEach(([name, version]) => {
        const size = getPackageSize(name);
        console.warn(`    - ${name}: ${size}KB`);

        if (name.includes("@mui")) {
          console.warn(`      💡 Используйте tree shaking и оптимизированные импорты`);
        }
        if (name.includes("react")) {
          console.warn(`      💡 Рассмотрите React.lazy для code splitting`);
        }
        if (size > 100) {
          console.warn(`      ⚠️  Большая зависимость - рассмотрите альтернативы`);
        }
      });
    }
  });
}

// Основная функция
function main() {
  console.warn("🚀 Анализ зависимостей для оптимизации бандла\n");

  try {
    // Анализируем зависимости
    const results = analyzeDependencies();

    // Ищем неиспользуемые импорты
    const apps = ["apps/web", "apps/trainer-panel", "apps/error-dashboard"];
    apps.forEach((app) => {
      const unusedImports = findUnusedImports(app);
      if (unusedImports.length > 0) {
        console.warn(`\n❌ Найдены неиспользуемые импорты в ${app}:`);
        unusedImports.slice(0, 10).forEach((item) => {
          console.warn(`  ${item.file}: ${item.import.name} из ${item.import.module}`);
        });
        if (unusedImports.length > 10) {
          console.warn(`  ... и еще ${unusedImports.length - 10} импортов`);
        }
      }
    });

    // Генерируем рекомендации
    generateRecommendations(results);

    console.warn("\n✅ Анализ завершен!");
    console.warn("\n📝 Следующие шаги:");
    console.warn("1. Удалите неиспользуемые импорты");
    console.warn("2. Замените крупные зависимости на более легкие альтернативы");
    console.warn("3. Используйте tree shaking для MUI");
    console.warn("4. Добавьте code splitting для тяжелых компонентов");
  } catch (error) {
    console.error("❌ Ошибка при анализе:", error.message);
  }
}

if (require.main === module) {
  main();
}
