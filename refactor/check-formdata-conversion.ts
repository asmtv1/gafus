#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';

/**
 * Скрипт проверки правильного преобразования FormData в Server Actions
 * Проверяет что:
 * 1. FormData преобразуется через Object.fromEntries()
 * 2. Файлы обрабатываются отдельно через formData.get()
 * 3. Множественные значения через formData.getAll()
 */

interface FormDataIssue {
  file: string;
  functionName: string;
  line: number;
  issues: string[];
}

function findFormDataIssues(dir: string): FormDataIssue[] {
  const issues: FormDataIssue[] = [];

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

    // Ищем Server Actions с параметром FormData
    const serverActions = findServerActionsWithFormData(content);

    for (const action of serverActions) {
      const functionIssues = analyzeFormDataUsage(content, action);
      if (functionIssues.length > 0) {
        issues.push({
          file: path.relative(process.cwd(), filePath),
          functionName: action.name,
          line: action.line,
          issues: functionIssues
        });
      }
    }
  }

  function findServerActionsWithFormData(content: string): { name: string; line: number }[] {
    const actions: { name: string; line: number }[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Ищем "use server" функции с FormData параметром
      if (line.includes('"use server"') || line.includes("'use server'")) {
        // Ищем функцию после "use server"
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const funcLine = lines[j];
          const funcMatch = funcLine.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+).*?\(.*?FormData.*?\)/);
          if (funcMatch) {
            actions.push({
              name: funcMatch[1],
              line: j + 1
            });
            break;
          }
        }
      }
    }

    return actions;
  }

  function analyzeFormDataUsage(content: string, action: { name: string; line: number }): string[] {
    const issues: string[] = [];

    // Получаем содержимое функции
    const functionContent = extractFunctionContent(content, action.line);

    // Проверяем наличие Object.fromEntries(formData)
    const hasObjectFromEntries = functionContent.includes('Object.fromEntries(formData)');

    // Проверяем наличие отдельных обращений к файлам
    const hasSeparateFileAccess = /formData\.get\(['"`][^'"`]*['"`]\)/.test(functionContent);

    // Проверяем наличие множественных значений
    const hasGetAll = functionContent.includes('formData.getAll(');

    // Проверяем наличие прямого использования formData в Object.fromEntries
    const hasDirectFormDataInFromEntries = /Object\.fromEntries\(formData\)/.test(functionContent);

    if (!hasObjectFromEntries && !hasSeparateFileAccess) {
      issues.push('FormData не преобразуется в объект (Object.fromEntries)');
    }

    if (hasObjectFromEntries && !hasSeparateFileAccess && !hasGetAll) {
      // Проверяем что файлы не извлекаются через Object.fromEntries
      const fromEntriesMatch = functionContent.match(/const\s+(\w+)\s*=\s*Object\.fromEntries\(formData\)/);
      if (fromEntriesMatch) {
        const varName = fromEntriesMatch[1];
        // Проверяем что эта переменная не используется для доступа к файлам
        const fileAccessPattern = new RegExp(`${varName}\.[\w]+\.name|${varName}\.[\w]+\.size|${varName}\.[\w]+\.type`);
        if (fileAccessPattern.test(functionContent)) {
          issues.push('Файлы извлекаются через Object.fromEntries (должны через formData.get())');
        }
      }
    }

    return issues;
  }

  function extractFunctionContent(content: string, startLine: number): string {
    const lines = content.split('\n');
    let functionContent = '';
    let braceCount = 0;
    let inFunction = false;

    for (let i = startLine - 1; i < lines.length; i++) {
      const line = lines[i];
      functionContent += line + '\n';

      for (const char of line) {
        if (char === '{') {
          braceCount++;
          inFunction = true;
        }
        if (char === '}') braceCount--;
      }

      if (inFunction && braceCount === 0) {
        break;
      }
    }

    return functionContent;
  }

  scanDirectory(dir);
  return issues;
}

function main() {
  console.log('🔍 Проверка преобразования FormData в Server Actions...\n');

  const issues = findFormDataIssues('.');

  if (issues.length === 0) {
    console.log('✅ Все Server Actions правильно обрабатывают FormData!');
    process.exit(0);
  }

  console.log(`❌ Найдено ${issues.length} проблем с обработкой FormData:\n`);

  for (const issue of issues) {
    console.log(`📁 ${issue.file}:${issue.line} (${issue.functionName})`);
    issue.issues.forEach(problem => {
      console.log(`   ❌ ${problem}`);
    });
    console.log('');
  }

  console.log('💡 Рекомендации по исправлению:');
  console.log('   1. Преобразуйте FormData: const data = Object.fromEntries(formData);');
  console.log('   2. Обрабатывайте файлы отдельно: const file = formData.get("field") as File;');
  console.log('   3. Для множественных значений: const values = formData.getAll("field");');

  process.exit(1);
}

main();