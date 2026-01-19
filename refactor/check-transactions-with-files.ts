#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';

/**
 * Скрипт проверки порядка операций с файлами в транзакциях Prisma
 * Проверяет что:
 * 1. Нет HTTP запросов (CDN upload) внутри $transaction
 * 2. Файловые операции выполняются ДО транзакции
 * 3. Есть cleanup при ошибках транзакции
 */

interface FileTransactionIssue {
  file: string;
  line: number;
  issues: string[];
  transactionContent: string;
}

function findFileTransactionIssues(dir: string): FileTransactionIssue[] {
  const issues: FileTransactionIssue[] = [];

  function scanDirectory(currentDir: string) {
    let items: string[];
    try {
      items = fs.readdirSync(currentDir);
    } catch (error) {
      return;
    }

    for (const item of items) {
      const fullPath = path.join(currentDir, item);

      if (item === 'node_modules' || item === '.git' || item === 'refactor' || item.startsWith('.')) {
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

      // Ищем начало транзакции
      if (line.includes('$transaction(')) {
        const transactionIssue = analyzeTransactionWithFiles(content, i);
        if (transactionIssue) {
          transactionIssue.file = path.relative(process.cwd(), filePath);
          issues.push(transactionIssue);
        }
      }
    }
  }

  function analyzeTransactionWithFiles(content: string, startLine: number): FileTransactionIssue | null {
    // Находим границы транзакции
    const lines = content.split('\n');
    let endLine = startLine;
    let braceCount = 0;
    let inTransaction = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];

      for (const char of line) {
        if (char === '(') braceCount++;
        if (char === ')') braceCount--;
      }

      if (line.includes('$transaction(')) {
        inTransaction = true;
      }

      endLine = i;

      if (inTransaction && braceCount === 0 && line.includes(');')) {
        break;
      }
    }

    const transactionLines = lines.slice(startLine, endLine + 1);
    const transactionContent = transactionLines.join('\n');

    // Проверяем на наличие файловых операций внутри транзакции
    const issues: string[] = [];

    // 1. Проверяем наличие HTTP запросов внутри транзакции
    const httpRequestsInside = /await\s+(?:uploadToCDN|deleteFromCDN|fetch\(|axios\.|\.post\(|\.put\(|\.delete\()/;
    if (httpRequestsInside.test(transactionContent)) {
      issues.push('HTTP запросы (CDN upload/delete) выполняются ВНУТРИ транзакции');
    }

    // 2. Проверяем наличие файловых операций внутри транзакции
    const fileOperationsInside = /await\s+(?:uploadFile|deleteFile|createReadStream|writeFile|unlink)/;
    if (fileOperationsInside.test(transactionContent)) {
      issues.push('Файловые операции выполняются ВНУТРИ транзакции');
    }

    // 3. Проверяем наличие cleanup при ошибках (для файлов снаружи транзакции)
    // Ищем CDN upload ДО транзакции
    const contentBeforeTransaction = lines.slice(0, startLine).join('\n');
    const hasCdnUploadBefore = /await\s+(?:uploadToCDN|getSignedVideoUrl)/.test(contentBeforeTransaction);

    if (hasCdnUploadBefore) {
      // Проверяем наличие try-catch с cleanup
      const fullFunction = getFunctionContent(content, startLine);
      const hasCleanup = /catch.*(?:deleteFromCDN|cleanup)/.test(fullFunction) ||
                        /try.*\$transaction.*catch.*(?:deleteFromCDN|cleanup)/.test(fullFunction);

      if (!hasCleanup) {
        issues.push('Отсутствует cleanup для CDN файлов при ошибке транзакции');
      }
    }

    if (issues.length > 0) {
      return {
        file: '',
        line: startLine + 1,
        issues,
        transactionContent: transactionContent.substring(0, 300) + (transactionContent.length > 300 ? '...' : '')
      };
    }

    return null;
  }

  function getFunctionContent(content: string, transactionStartLine: number): string {
    // Находим начало функции содержащей транзакцию
    const lines = content.split('\n');
    let functionStart = transactionStartLine;

    for (let i = transactionStartLine; i >= 0; i--) {
      const line = lines[i];
      if (line.includes('function') || line.includes('const') || line.includes('export')) {
        functionStart = i;
        break;
      }
    }

    return lines.slice(functionStart, Math.min(functionStart + 50, lines.length)).join('\n');
  }

  scanDirectory(dir);
  return issues;
}

function main() {
  console.log('🔍 Проверка порядка операций с файлами в транзакциях...\n');

  const issues = findFileTransactionIssues('.');

  if (issues.length === 0) {
    console.log('✅ Все транзакции правильно обрабатывают файлы!');
    process.exit(0);
  }

  console.log(`❌ Найдено ${issues.length} проблем с файлами в транзакциях:\n`);

  for (const issue of issues) {
    console.log(`📁 ${issue.file}:${issue.line}`);
    issue.issues.forEach(problem => {
      console.log(`   ❌ ${problem}`);
    });
    console.log(`   📝 Транзакция: ${issue.transactionContent.replace(/\n/g, '\n      ')}\n`);
  }

  console.log('💡 Рекомендации по исправлению:');
  console.log('   1. Выполняйте CDN upload ДО транзакции:');
  console.log('      const fileUrl = await uploadToCDN(file); // ДО транзакции');
  console.log('   2. НЕ выполняйте HTTP запросы внутри $transaction');
  console.log('   3. Добавьте cleanup при ошибках:');
  console.log('      try {');
  console.log('        await prisma.$transaction(...);');
  console.log('      } catch (error) {');
  console.log('        await deleteFromCDN(fileUrl); // cleanup');
  console.log('        throw error;');
  console.log('      }');

  process.exit(1);
}

main();