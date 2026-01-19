#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';

/**
 * Скрипт проверки правильного использования unstable_cache с userId
 * Проверяет что:
 * 1. userId включен в ключ кэша
 * 2. userId включен в теги инвалидации
 * 3. userId НЕ используется как аргумент функции
 */

interface CacheIssue {
  file: string;
  line: number;
  functionName: string;
  issues: string[];
  cacheKey: string;
  tags: string;
}

function findUnstableCacheIssues(dir: string): CacheIssue[] {
  const issues: CacheIssue[] = [];

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
      } else if (stat.isFile() && (item.endsWith('.ts') || item.endsWith('.tsx'))) {
        scanFile(fullPath);
      }
    }
  }

  function scanFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Ищем unstable_cache
      if (line.includes('unstable_cache(')) {
        const cacheIssue = analyzeUnstableCache(content, i);
        if (cacheIssue && cacheIssue.issues.length > 0) {
          cacheIssue.file = path.relative(process.cwd(), filePath);
          issues.push(cacheIssue);
        }
      }
    }
  }

  function analyzeUnstableCache(content: string, startLine: number): CacheIssue | null {
    // Находим границы unstable_cache вызова
    const lines = content.split('\n');
    let endLine = startLine;
    let braceCount = 0;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];

      for (const char of line) {
        if (char === '(') braceCount++;
        if (char === ')') braceCount--;
      }

      endLine = i;

      if (braceCount === 0 && line.includes(')')) {
        break;
      }
    }

    const cacheCall = lines.slice(startLine, endLine + 1).join('\n');

    // Проверяем содержит ли userId
    if (!cacheCall.includes('userId') && !cacheCall.includes('user_id')) {
      return null; // Не проверяем кэши без userId
    }

    // Извлекаем ключ кэша
    const keyMatch = cacheCall.match(/\[([^\]]+)\]/);
    const cacheKey = keyMatch ? keyMatch[1].trim() : '';

    // Извлекаем теги
    const tagsMatch = cacheCall.match(/tags:\s*\[([^\]]+)\]/);
    const tags = tagsMatch ? tagsMatch[1].trim() : '';

    // Извлекаем функцию
    const functionMatch = cacheCall.match(/unstable_cache\(\s*([^,]+),/);
    const functionCode = functionMatch ? functionMatch[1].trim() : '';

    // Анализируем проблемы
    const issues: string[] = [];

    // 1. userId должен быть в ключе кэша
    if (!cacheKey.includes('userId') && !cacheKey.includes('user_id')) {
      issues.push('userId отсутствует в ключе кэша');
    }

    // 2. userId должен быть в тегах
    if (!tags.includes('userId') && !tags.includes('user_id') && !tags.includes('user-${')) {
      issues.push('userId отсутствует в тегах инвалидации');
    }

    // 3. userId НЕ должен быть аргументом функции
    if (functionCode.includes('(userId') || functionCode.includes('(user_id')) {
      issues.push('userId используется как аргумент функции (должен быть в замыкании)');
    }

    if (issues.length > 0) {
      // Находим имя функции
      const functionNameMatch = cacheCall.match(/(?:const|function)\s+(\w+)\s*=/);
      const functionName = functionNameMatch ? functionNameMatch[1] : 'unknown';

      return {
        file: '',
        line: startLine + 1,
        functionName,
        issues,
        cacheKey,
        tags
      };
    }

    return null;
  }

  scanDirectory(dir);
  return issues;
}

function main() {
  console.log('🔍 Проверка использования unstable_cache с userId...\n');

  const issues = findUnstableCacheIssues('.');

  if (issues.length === 0) {
    console.log('✅ Все unstable_cache с userId используются правильно!');
    process.exit(0);
  }

  console.log(`❌ Найдено ${issues.length} проблем с unstable_cache:\n`);

  for (const issue of issues) {
    console.log(`📁 ${issue.file}:${issue.line} (${issue.functionName})`);
    console.log(`   🔑 Ключ: [${issue.cacheKey}]`);
    console.log(`   🏷️  Теги: [${issue.tags}]`);

    issue.issues.forEach(problem => {
      console.log(`   ❌ ${problem}`);
    });
    console.log('');
  }

  console.log('💡 Рекомендации по исправлению:');
  console.log('   1. Включите userId в ключ: ["cache-key", userId]');
  console.log('   2. Включите userId в теги: tags: [`user-${userId}`]');
  console.log('   3. НЕ используйте userId как аргумент функции (только в замыкании)');
  console.log('   4. Правильный пример:');
  console.log('      export function getUserData(userId: string) {');
  console.log('        return unstable_cache(');
  console.log('          () => fetchData(userId), // userId из замыкания');
  console.log('          ["user-data", userId],   // userId в ключе');
  console.log('          { tags: [`user-${userId}`] } // userId в тегах');
  console.log('        );');
  console.log('      }');

  process.exit(1);
}

main();