#!/usr/bin/env tsx

import * as fs from "fs";
import * as path from "path";

/**
 * Скрипт проверки использования getCurrentUserId в API Routes
 * API Routes должны использовать getServerSession(authOptions), а не getCurrentUserId
 */

interface ApiRouteIssue {
  file: string;
  line: number;
  content: string;
}

function findGetCurrentUserIdInApiRoutes(dir: string): ApiRouteIssue[] {
  const issues: ApiRouteIssue[] = [];

  function scanDirectory(currentDir: string) {
    let items: string[];
    try {
      items = fs.readdirSync(currentDir);
    } catch (error) {
      return;
    }

    for (const item of items) {
      const fullPath = path.join(currentDir, item);

      if (item === "node_modules" || item === ".git" || item.startsWith(".")) {
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
        // Проверяем что это API Route (в директории app/api/)
        const relativePath = path.relative(dir, fullPath);
        if (relativePath.includes("app/api/")) {
          scanApiRouteFile(fullPath);
        }
      }
    }
  }

  function scanApiRouteFile(filePath: string) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Ищем использование getCurrentUserId
      if (line.includes("getCurrentUserId")) {
        issues.push({
          file: path.relative(process.cwd(), filePath),
          line: i + 1,
          content: line.trim(),
        });
      }
    }
  }

  scanDirectory(dir);
  return issues;
}

function main() {
  console.log("🔍 Проверка использования getCurrentUserId в API Routes...\n");

  const issues = findGetCurrentUserIdInApiRoutes(".");

  if (issues.length === 0) {
    console.log("✅ Все API Routes правильно используют getServerSession вместо getCurrentUserId!");
    process.exit(0);
  }

  console.log(`❌ Найдено ${issues.length} использований getCurrentUserId в API Routes:\n`);

  for (const issue of issues) {
    console.log(`📁 ${issue.file}:${issue.line}`);
    console.log(`   📝 ${issue.content}\n`);
  }

  console.log("💡 Рекомендация:");
  console.log("   Замените getCurrentUserId() на getServerSession(authOptions) в API Routes");
  console.log('   getCurrentUserId() помечен "use server" и не работает в API Routes');

  process.exit(1);
}

main();
