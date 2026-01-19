#!/usr/bin/env tsx

/**
 * Анализатор зависимостей для 61 файла рефакторинга
 * Создает граф зависимостей, проверяет на циклы, визуализирует импорты
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

// Список всех 61 файла для анализа (из плана рефакторинга)
const FILES_TO_ANALYZE = [
  // COURSE (10 + 1 cached)
  'apps/web/src/shared/lib/course/checkCourseAccess.ts',
  'apps/web/src/shared/lib/course/getCourses.ts',
  'apps/web/src/shared/lib/course/getCourseMetadata.ts',
  'apps/web/src/shared/lib/course/getFavoritesCourses.ts',
  'apps/web/src/shared/lib/course/getAuthoredCourses.ts',
  'apps/web/src/shared/lib/course/addtoFavorite.ts',
  'apps/web/src/shared/lib/course/rateCourse.ts',
  'apps/web/src/shared/lib/course/updateCourseRating.ts',
  'apps/web/src/shared/lib/course/manageCourseReview.ts',
  'apps/web/src/shared/lib/course/getCourseReviews.ts',
  'apps/web/src/shared/lib/actions/cachedCourses.ts',

  // TRAINING (9 файлов)
  'apps/web/src/shared/lib/training/checkDayAccess.ts',
  'apps/web/src/shared/lib/training/getTrainingDays.ts',
  'apps/web/src/shared/lib/training/getTrainingDayWithUserSteps.ts',
  'apps/web/src/shared/lib/training/updateUserStepStatus.ts',
  'apps/web/src/shared/lib/training/startUserStepServerAction.ts',
  'apps/web/src/shared/lib/training/markTheoryStepAsCompleted.ts',
  'apps/web/src/shared/lib/training/markPracticeStepAsCompleted.ts',
  'apps/web/src/shared/lib/training/pauseResumeUserStep.ts',

  // USER (8 файлов)
  'apps/web/src/shared/lib/user/getUserProfile.ts',
  'apps/web/src/shared/lib/user/updateUserProfile.ts',
  'apps/web/src/shared/lib/user/getUserPreferences.ts',
  'apps/web/src/shared/lib/user/updateUserPreferences.ts',
  'apps/web/src/shared/lib/user/getUserProgress.ts',
  'apps/web/src/shared/lib/user/userCourses.ts',
  'apps/web/src/shared/lib/user/getUserWithTrainings.ts',
  'apps/web/src/shared/lib/actions/userProgress.ts',

  // EXAM (3 файла)
  'apps/web/src/shared/lib/actions/submitExamResult.ts',
  'apps/web/src/shared/lib/actions/getExamResult.ts',
  'apps/web/src/shared/lib/actions/uploadExamVideo.ts',

  // PROFILE (2 файла)
  'apps/web/src/shared/lib/profile/getPublicProfile.ts',
  'apps/web/src/shared/lib/profile/updateAvatar.ts',

  // PET (7 файлов - объединено)
  'apps/web/src/shared/lib/pets/getUserPets.ts',
  'apps/web/src/shared/lib/pets/savePet.ts',
  'apps/web/src/shared/lib/pets/deletePet.ts',
  'apps/web/src/shared/lib/pets/updatePetAvatar.ts',
  'apps/web/src/shared/lib/pets/createPet.ts',
  'apps/web/src/shared/lib/pets/updatePet.ts',
  'apps/web/src/shared/lib/pets/index.ts',

  // NOTIFICATIONS (5 файлов)
  'apps/web/src/shared/lib/StepNotification/createStepNotification.ts',
  'apps/web/src/shared/lib/StepNotification/deletedStepNotification.ts',
  'apps/web/src/shared/lib/StepNotification/toggleStepNotificationPause.ts',
  'apps/web/src/shared/lib/StepNotification/manageStepNotification.ts',
  'apps/web/src/shared/lib/StepNotification/manageStepNotificationSimple.ts',

  // SUBSCRIPTIONS (4 файла)
  'apps/web/src/shared/lib/savePushSubscription/savePushSubscription.ts',
  'apps/web/src/shared/lib/savePushSubscription/deletePushSubscription.ts',
  'apps/web/src/shared/lib/savePushSubscription/getUserSubscriptionStatus.ts',
  'apps/web/src/shared/lib/actions/subscription.ts',

  // VIDEO (4 файла)
  'apps/web/src/shared/lib/video/getSignedVideoUrl.ts',
  'apps/web/src/shared/lib/video/getVideoMetadata.ts',
  'apps/web/src/shared/lib/video/getVideoUrlForPlayback.ts',
  'apps/web/src/shared/lib/actions/getVideoIdFromUrlAction.ts',
];

interface DependencyNode {
  file: string;
  imports: string[];
  importedBy: string[];
}

interface DependencyGraph {
  [file: string]: DependencyNode;
}

/**
 * Парсит импорты из файла
 */
function parseImports(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const imports: string[] = [];

    // Регулярные выражения для различных типов импортов
    const importPatterns = [
      // import { ... } from 'module'
      /import\s+{[^}]*}\s+from\s+['"]([^'"]+)['"]/g,
      // import * as ... from 'module'
      /import\s+\*\s+as\s+\w+\s+from\s+['"]([^'"]+)['"]/g,
      // import ... from 'module'
      /import\s+\w+\s+from\s+['"]([^'"]+)['"]/g,
      // import 'module'
      /import\s+['"]([^'"]+)['"]/g,
    ];

    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1];

        // Преобразуем относительные импорты в абсолютные пути
        if (importPath.startsWith('.')) {
          const dir = path.dirname(filePath);
          const resolvedPath = path.resolve(dir, importPath);

          // Нормализуем расширение .ts
          const normalizedPath = resolvedPath.endsWith('.ts')
            ? resolvedPath
            : resolvedPath + '.ts';

          imports.push(normalizedPath);
        } else if (importPath.startsWith('@/')) {
          // Алиас @/ указывает на src/
          const projectRoot = path.resolve(process.cwd());
          const resolvedPath = path.resolve(projectRoot, 'apps/web/src', importPath.slice(2));

          // Проверяем различные расширения
          const possiblePaths = [
            resolvedPath + '.ts',
            resolvedPath + '/index.ts',
            path.resolve(resolvedPath, 'index.ts')
          ];

          for (const possiblePath of possiblePaths) {
            if (fs.existsSync(possiblePath)) {
              imports.push(possiblePath);
              break;
            }
          }
        }
        // Игнорируем внешние импорты (node_modules, @gafus/*)
      }
    }

    // Фильтруем только импорты из нашего списка файлов
    return imports.filter(imp => FILES_TO_ANALYZE.some(file => {
      const fullPath = path.resolve(process.cwd(), file);
      return imp === fullPath;
    })).map(imp => {
      // Преобразуем обратно в относительные пути для читаемости
      return FILES_TO_ANALYZE.find(file => path.resolve(process.cwd(), file) === imp) || imp;
    });
  } catch (error) {
    console.error(`Ошибка при парсинге файла ${filePath}:`, error);
    return [];
  }
}

/**
 * Создает граф зависимостей
 */
function buildDependencyGraph(): DependencyGraph {
  const graph: DependencyGraph = {};

  console.log('🔍 Анализ зависимостей 61 файла...\n');

  for (const file of FILES_TO_ANALYZE) {
    const fullPath = path.resolve(process.cwd(), file);

    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️ Файл не найден: ${file}`);
      continue;
    }

    const imports = parseImports(fullPath);
    graph[file] = {
      file,
      imports,
      importedBy: []
    };

    console.log(`📄 ${file}`);
    console.log(`   📥 Импортирует: ${imports.length > 0 ? imports.join(', ') : 'ничего'}`);
    console.log('');
  }

  // Заполняем importedBy
  for (const [file, node] of Object.entries(graph)) {
    for (const importedFile of node.imports) {
      if (graph[importedFile]) {
        graph[importedFile].importedBy.push(file);
      }
    }
  }

  return graph;
}

/**
 * Находит циклические зависимости
 */
function findCycles(graph: DependencyGraph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(node: string, path: string[] = []): void {
    if (recStack.has(node)) {
      // Найден цикл
      const cycleStart = path.indexOf(node);
      cycles.push([...path.slice(cycleStart), node]);
      return;
    }

    if (visited.has(node)) {
      return;
    }

    visited.add(node);
    recStack.add(node);
    path.push(node);

    const dependencies = graph[node]?.imports || [];
    for (const dep of dependencies) {
      if (graph[dep]) {
        dfs(dep, [...path]);
      }
    }

    path.pop();
    recStack.delete(node);
  }

  for (const file of Object.keys(graph)) {
    if (!visited.has(file)) {
      dfs(file);
    }
  }

  return cycles;
}

/**
 * Визуализирует граф зависимостей
 */
function visualizeGraph(graph: DependencyGraph): string {
  let output = '# 📊 ГРАФ ЗАВИСИМОСТЕЙ 61 ФАЙЛА\n\n';

  // Группируем по доменам
  const domains = {
    course: Object.keys(graph).filter(f => f.includes('/course/')),
    training: Object.keys(graph).filter(f => f.includes('/training/')),
    user: Object.keys(graph).filter(f => f.includes('/user/')),
    exam: Object.keys(graph).filter(f => f.includes('/exam/') || f.includes('Exam')),
    profile: Object.keys(graph).filter(f => f.includes('/profile/')),
    pets: Object.keys(graph).filter(f => f.includes('/pets/')),
    notifications: Object.keys(graph).filter(f => f.includes('StepNotification')),
    subscriptions: Object.keys(graph).filter(f => f.includes('savePushSubscription') || f.includes('subscription')),
    video: Object.keys(graph).filter(f => f.includes('/video/')),
  };

  for (const [domain, files] of Object.entries(domains)) {
    if (files.length === 0) continue;

    output += `## ${domain.toUpperCase()} (${files.length} файлов)\n\n`;

    for (const file of files) {
      const node = graph[file];
      output += `### ${file}\n`;
      output += `**Импортирует:** ${node.imports.length}\n`;
      output += `**Импортируется:** ${node.importedBy.length}\n`;

      if (node.imports.length > 0) {
        output += `**Зависимости:**\n`;
        for (const imp of node.imports) {
          output += `- ${imp}\n`;
        }
      }

      if (node.importedBy.length > 0) {
        output += `**Используется в:**\n`;
        for (const user of node.importedBy) {
          output += `- ${user}\n`;
        }
      }

      output += '\n';
    }
  }

  return output;
}

/**
 * Генерирует Mermaid диаграмму
 */
function generateMermaidDiagram(graph: DependencyGraph): string {
  let diagram = 'graph TD\n';

  // Создаем узлы
  for (const [file, node] of Object.entries(graph)) {
    const shortName = path.basename(file, '.ts');
    diagram += `    ${shortName.replace(/[^a-zA-Z0-9]/g, '_')}[${shortName}]\n`;
  }

  diagram += '\n';

  // Создаем связи
  for (const [file, node] of Object.entries(graph)) {
    const from = path.basename(file, '.ts').replace(/[^a-zA-Z0-9]/g, '_');

    for (const dep of node.imports) {
      if (graph[dep]) {
        const to = path.basename(dep, '.ts').replace(/[^a-zA-Z0-9]/g, '_');
        diagram += `    ${from} --> ${to}\n`;
      }
    }
  }

  return diagram;
}

// Основная функция
async function main() {
  console.log('🚀 АНАЛИЗАТОР ЗАВИСИМОСТЕЙ ДЛЯ РЕФАКТОРИНГА\n');
  console.log(`📊 Анализируем ${FILES_TO_ANALYZE.length} файлов\n`);

  // Строим граф зависимостей
  const graph = buildDependencyGraph();

  // Находим циклы
  const cycles = findCycles(graph);

  console.log('🔄 ПРОВЕРКА НА ЦИКЛИЧЕСКИЕ ЗАВИСИМОСТИ\n');

  if (cycles.length === 0) {
    console.log('✅ Циклических зависимостей НЕ найдено!\n');
  } else {
    console.log(`❌ Найдено ${cycles.length} циклических зависимостей:\n`);
    for (let i = 0; i < cycles.length; i++) {
      console.log(`${i + 1}. ${cycles[i].join(' → ')}`);
    }
    console.log('');
  }

  // Генерируем отчет
  const report = visualizeGraph(graph);
  const mermaid = generateMermaidDiagram(graph);

  // Сохраняем отчет
  const reportPath = path.resolve(process.cwd(), '.cursor/plans/ГРАФ_ЗАВИСИМОСТЕЙ_61_ФАЙЛА.md');
  fs.writeFileSync(reportPath, report + '\n## 🐟 MERMAID ДИАГРАММА\n\n```mermaid\n' + mermaid + '\n```\n');

  console.log('📋 СТАТИСТИКА ГРАФА:\n');
  console.log(`   Всего файлов: ${Object.keys(graph).length}`);
  console.log(`   Всего связей: ${Object.values(graph).reduce((sum, node) => sum + node.imports.length, 0)}`);
  console.log(`   Циклических зависимостей: ${cycles.length}`);
  console.log('');

  console.log(`💾 Отчет сохранен: ${reportPath}`);

  // Выводим сводку по доменам
  console.log('\n📈 СВОДКА ПО ДОМЕНАМ:\n');

  const domainStats = {
    course: Object.keys(graph).filter(f => f.includes('/course/')),
    training: Object.keys(graph).filter(f => f.includes('/training/')),
    user: Object.keys(graph).filter(f => f.includes('/user/')),
    exam: Object.keys(graph).filter(f => f.includes('/exam/') || f.includes('Exam')),
    profile: Object.keys(graph).filter(f => f.includes('/profile/')),
    pets: Object.keys(graph).filter(f => f.includes('/pets/')),
    notifications: Object.keys(graph).filter(f => f.includes('StepNotification')),
    subscriptions: Object.keys(graph).filter(f => f.includes('savePushSubscription') || f.includes('subscription')),
    video: Object.keys(graph).filter(f => f.includes('/video/')),
  };

  for (const [domain, files] of Object.entries(domainStats)) {
    if (files.length > 0) {
      const totalImports = files.reduce((sum, file) => sum + (graph[file]?.imports.length || 0), 0);
      console.log(`   ${domain}: ${files.length} файлов, ${totalImports} импортов`);
    }
  }

  console.log('\n🎉 АНАЛИЗ ЗАВЕРШЕН!\n');
}

// Запуск
main().catch(console.error);