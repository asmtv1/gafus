#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';

/**
 * Скрипт проверки CSRF защиты в API Routes
 * Все мутирующие операции (POST/PUT/PATCH/DELETE) должны использовать withCSRFProtection
 */

interface CsrfIssue {
  file: string;
  method: string;
  hasCsrfProtection: boolean;
  line: number;
}

const EXCLUDED_PATHS = [
  '/api/auth/',
  '/api/csrf-token',
  '/api/webhook/',
  '/api/track-presentation',      // tracking endpoints
  '/api/track-presentation-event',
  '/api/track-reengagement-click',
  '/api/public-key',              // GET запросы
  '/api/ping',
  '/api/health',
  '/api/revalidate/',
];

function findCsrfIssues(dir: string): CsrfIssue[] {
  const issues: CsrfIssue[] = [];

  function scanDirectory(currentDir: string) {
    let items: string[];
    try {
      items = fs.readdirSync(currentDir);
    } catch (error) {
      return;
    }

    for (const item of items) {
      const fullPath = path.join(currentDir, item);

      if (item === 'node_modules' || item === '.git' || item.startsWith('.')) {
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
      } else if (stat.isFile() && item === 'route.ts') {
        const relativePath = path.relative(dir, fullPath);
        if (relativePath.includes('app/api/')) {
          scanApiRouteFile(fullPath, relativePath);
        }
      }
    }
  }

  function scanApiRouteFile(filePath: string, relativePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Определяем путь API route
    const apiPath = '/' + relativePath.split('app/api/')[1].replace('/route.ts', '');

    // Проверяем исключения
    const isExcluded = EXCLUDED_PATHS.some(excludedPath =>
      apiPath.startsWith(excludedPath)
    );

    if (isExcluded) {
      return;
    }

    // Ищем экспортированные функции (GET, POST, PUT, PATCH, DELETE)
    const exportedFunctions = findExportedFunctions(content);

    for (const func of exportedFunctions) {
      const method = func.name;
      const startLine = func.line;

      // Только мутирующие операции проверяем на CSRF
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        continue;
      }

      // Проверяем наличие withCSRFProtection
      const functionContent = getFunctionContent(lines, startLine);
      const hasCsrfProtection = functionContent.includes('withCSRFProtection');

      if (!hasCsrfProtection) {
        issues.push({
          file: path.relative(process.cwd(), filePath),
          method,
          hasCsrfProtection: false,
          line: startLine
        });
      }
    }
  }

  function findExportedFunctions(content: string): { name: string; line: number }[] {
    const functions: { name: string; line: number }[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Ищем export const GET/POST/PUT/PATCH/DELETE
      const match = trimmed.match(/^export\s+(?:const|function)\s+(GET|POST|PUT|PATCH|DELETE)/);
      if (match) {
        functions.push({
          name: match[1],
          line: i + 1
        });
      }
    }

    return functions;
  }

  function getFunctionContent(lines: string[], startLine: number): string {
    let content = '';
    let braceCount = 0;
    let inFunction = false;

    for (let i = startLine - 1; i < lines.length; i++) {
      const line = lines[i];

      for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }

      content += line + '\n';

      if (braceCount === 0 && inFunction) {
        break;
      }

      if (line.includes('=')) {
        inFunction = true;
      }
    }

    return content;
  }

  scanDirectory(dir);
  return issues;
}

function main() {
  console.log('🔍 Проверка CSRF защиты в API Routes...\n');

  const issues = findCsrfIssues('.');

  if (issues.length === 0) {
    console.log('✅ Все мутирующие API Routes имеют CSRF защиту!');
    console.log('\n📋 Исключенные пути (не требуют CSRF):');
    EXCLUDED_PATHS.forEach(path => console.log(`   - ${path}`));
    process.exit(0);
  }

  console.log(`❌ Найдено ${issues.length} мутирующих API Routes без CSRF защиты:\n`);

  for (const issue of issues) {
    console.log(`📁 ${issue.file}:${issue.line}`);
    console.log(`   🔴 ${issue.method} без withCSRFProtection\n`);
  }

  console.log('💡 Рекомендация:');
  console.log('   Добавьте withCSRFProtection для всех мутирующих операций:');
  console.log('   export const POST = withCSRFProtection(async (request) => { ... })');
  console.log('\n📋 Исключенные пути (не требуют CSRF):');
  EXCLUDED_PATHS.forEach(path => console.log(`   - ${path}`));

  process.exit(1);
}

main();