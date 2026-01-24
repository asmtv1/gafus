#!/usr/bin/env tsx

import * as fs from "fs";
import * as path from "path";

/**
 * Комплексная проверка существующих API Routes
 * Проверяет:
 * 1. getCurrentUserId не используется (должен быть getServerSession)
 * 2. Мутирующие операции используют withCSRFProtection
 * 3. Server Actions не вызываются напрямую
 */

interface ApiRouteCheckResult {
  totalRoutes: number;
  issues: {
    getCurrentUserId: Array<{ file: string; line: number; content: string }>;
    csrfProtection: Array<{ file: string; method: string; line: number }>;
    serverActions: Array<{ file: string; line: number; actionName: string }>;
  };
}

const EXCLUDED_PATHS = [
  "/api/auth/",
  "/api/csrf-token",
  "/api/webhook/",
  "/api/track-presentation",
  "/api/track-presentation-event",
  "/api/track-reengagement-click",
  "/api/public-key",
  "/api/ping",
  "/api/health",
  "/api/revalidate/",
];

function checkExistingApiRoutes(dir: string): ApiRouteCheckResult {
  const result: ApiRouteCheckResult = {
    totalRoutes: 0,
    issues: {
      getCurrentUserId: [],
      csrfProtection: [],
      serverActions: [],
    },
  };

  function scanDirectory(currentDir: string) {
    let items: string[];
    try {
      items = fs.readdirSync(currentDir);
    } catch (error) {
      return;
    }

    for (const item of items) {
      const fullPath = path.join(currentDir, item);

      if (
        item === "node_modules" ||
        item === ".git" ||
        item === "refactor" ||
        item.startsWith(".")
      ) {
        continue;
      }

      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (error) {
        continue;
      }

      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (stat.isFile() && item === "route.ts") {
        const relativePath = path.relative(dir, fullPath);
        if (relativePath.includes("app/api/")) {
          result.totalRoutes++;
          checkApiRouteFile(fullPath, relativePath);
        }
      }
    }
  }

  function checkApiRouteFile(filePath: string, relativePath: string) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    // Проверяем использование getCurrentUserId
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("getCurrentUserId")) {
        result.issues.getCurrentUserId.push({
          file: path.relative(process.cwd(), filePath),
          line: i + 1,
          content: line.trim(),
        });
      }
    }

    // Определяем путь API route
    const apiPath = "/" + relativePath.split("app/api/")[1].replace("/route.ts", "");

    // Проверяем исключения
    const isExcluded = EXCLUDED_PATHS.some((excludedPath) => apiPath.startsWith(excludedPath));

    if (isExcluded) {
      return;
    }

    // Ищем экспортированные функции
    const exportedFunctions = findExportedFunctions(content);

    for (const func of exportedFunctions) {
      const method = func.name;
      const startLine = func.line;

      // Проверяем CSRF защиту для мутирующих операций
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        const functionContent = getFunctionContent(lines, startLine);
        if (!functionContent.includes("withCSRFProtection")) {
          result.issues.csrfProtection.push({
            file: path.relative(process.cwd(), filePath),
            method,
            line: startLine,
          });
        }
      }
    }

    // Проверяем использование Server Actions
    const serverActionCalls = findServerActionCalls(content);
    for (const call of serverActionCalls) {
      result.issues.serverActions.push({
        file: path.relative(process.cwd(), filePath),
        line: call.line,
        actionName: call.actionName,
      });
    }
  }

  function findExportedFunctions(content: string): { name: string; line: number }[] {
    const functions: { name: string; line: number }[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      const match = trimmed.match(/^export\s+(?:const|function)\s+(GET|POST|PUT|PATCH|DELETE)/);
      if (match) {
        functions.push({
          name: match[1],
          line: i + 1,
        });
      }
    }

    return functions;
  }

  function getFunctionContent(lines: string[], startLine: number): string {
    let content = "";
    let braceCount = 0;
    let inFunction = false;

    for (let i = startLine - 1; i < lines.length; i++) {
      const line = lines[i];
      content += line + "\n";

      for (const char of line) {
        if (char === "{") {
          braceCount++;
          inFunction = true;
        }
        if (char === "}") braceCount--;
      }

      if (inFunction && braceCount === 0) {
        break;
      }
    }

    return content;
  }

  function findServerActionCalls(content: string): { line: number; actionName: string }[] {
    const calls: { line: number; actionName: string }[] = [];
    const lines = content.split("\n");

    // Ищем вызовы функций из shared/lib/actions/ или server-actions/
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Проверяем импорты из actions
      if (
        line.includes("from") &&
        (line.includes("shared/lib/actions") || line.includes("server-actions"))
      ) {
        // Нашли импорт, проверяем использование
        const importMatch = line.match(/import\s+{([^}]+)}\s+from\s+['"`]([^'"`]+)['"`]/);
        if (importMatch) {
          const imports = importMatch[1].split(",").map((s) => s.trim());
          const importPath = importMatch[2];

          // Ищем использование этих функций
          for (const importName of imports) {
            const functionName = importName.split(" as ")[0].trim();
            const usagePattern = new RegExp(`\\b${functionName}\\s*\\(`);

            for (let j = i; j < lines.length; j++) {
              if (usagePattern.test(lines[j])) {
                calls.push({
                  line: j + 1,
                  actionName: functionName,
                });
                break;
              }
            }
          }
        }
      }
    }

    return calls;
  }

  scanDirectory(dir);
  return result;
}

function main() {
  console.log("🔍 Комплексная проверка существующих API Routes...\n");

  const result = checkExistingApiRoutes(".");

  console.log(`📊 Найдено ${result.totalRoutes} API Routes\n`);

  let hasIssues = false;

  // Проверяем getCurrentUserId
  if (result.issues.getCurrentUserId.length > 0) {
    hasIssues = true;
    console.log(
      `❌ getCurrentUserId используется в ${result.issues.getCurrentUserId.length} местах:`,
    );
    for (const issue of result.issues.getCurrentUserId) {
      console.log(`   📁 ${issue.file}:${issue.line} - ${issue.content}`);
    }
    console.log("");
  } else {
    console.log("✅ getCurrentUserId не используется в API Routes");
  }

  // Проверяем CSRF защиту
  if (result.issues.csrfProtection.length > 0) {
    hasIssues = true;
    console.log(
      `❌ CSRF защита отсутствует в ${result.issues.csrfProtection.length} мутирующих операциях:`,
    );
    for (const issue of result.issues.csrfProtection) {
      console.log(`   📁 ${issue.file}:${issue.line} - ${issue.method} без withCSRFProtection`);
    }
    console.log("");
  } else {
    console.log("✅ Все мутирующие операции имеют CSRF защиту");
  }

  // Проверяем Server Actions
  if (result.issues.serverActions.length > 0) {
    hasIssues = true;
    console.log(
      `❌ Server Actions вызываются напрямую в ${result.issues.serverActions.length} местах:`,
    );
    for (const issue of result.issues.serverActions) {
      console.log(`   📁 ${issue.file}:${issue.line} - ${issue.actionName}()`);
    }
    console.log("");
  } else {
    console.log("✅ Server Actions не вызываются напрямую в API Routes");
  }

  if (!hasIssues) {
    console.log("\n🎉 Все API Routes соответствуют требованиям!");
    console.log("\n📋 Исключенные пути (не требуют CSRF):");
    EXCLUDED_PATHS.forEach((path) => console.log(`   - ${path}`));
    process.exit(0);
  }

  console.log("\n💡 Рекомендации по исправлению:");
  console.log("   1. Замените getCurrentUserId() на getServerSession(authOptions)");
  console.log("   2. Добавьте withCSRFProtection для POST/PUT/PATCH/DELETE");
  console.log("   3. Замените прямые вызовы Server Actions на вызовы services");

  process.exit(1);
}

main();
