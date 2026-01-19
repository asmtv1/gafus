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

      if (item === 'node_modules' || item === '.git' || item.startsWith('.') ||
          item === 'refactor' || item === 'templates' || item === 'characterization-tests') {
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

    // Паттерны для userId и его алиасов
    const userIdPatterns = ['userId', 'user_id', 'cacheKeyUserId', 'safeUserId'];
    const hasUserId = userIdPatterns.some(p => cacheCall.includes(p));

    // Проверяем содержит ли userId
    if (!hasUserId) {
      return null; // Не проверяем кэши без userId
    }

    // Простая проверка: считаем вхождения userId/алиасов в различных контекстах
    
    // Ищем userId в массивах [...] (ключи и теги)
    const bracketsMatches = cacheCall.match(/\[[^\]]*\]/g) || [];
    const allBrackets = bracketsMatches.join(' ');
    
    // Считаем сколько раз userId встречается в массивах
    let userInBracketsCount = 0;
    for (const pattern of userIdPatterns) {
      const regex = new RegExp(pattern, 'g');
      const matches = allBrackets.match(regex);
      if (matches) userInBracketsCount += matches.length;
    }
    // Также проверяем `user-${...}` паттерн
    const userTemplateMatches = allBrackets.match(/`user-\$\{/g);
    if (userTemplateMatches) userInBracketsCount += userTemplateMatches.length;

    // Проверяем аргументы функции внутри unstable_cache
    const asyncFnMatch = cacheCall.match(/unstable_cache\s*\(\s*async\s*\(([^)]*)\)/);
    const syncFnMatch = cacheCall.match(/unstable_cache\s*\(\s*\(([^)]*)\)/);
    const functionArgs = asyncFnMatch ? asyncFnMatch[1] : (syncFnMatch ? syncFnMatch[1] : '');

    // Анализируем проблемы
    const issues: string[] = [];

    // userId должен быть минимум в 2 местах: в ключе и в тегах
    if (userInBracketsCount < 2) {
      if (userInBracketsCount === 0) {
        issues.push('userId отсутствует в ключе кэша');
        issues.push('userId отсутствует в тегах инвалидации');
      } else {
        issues.push('userId должен быть и в ключе кэша, и в тегах (найден только в одном месте)');
      }
    }

    // Проверяем, что userId НЕ используется как аргумент функции внутри unstable_cache
    const hasUserAsArg = userIdPatterns.some(p => functionArgs.includes(p));
    if (hasUserAsArg) {
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