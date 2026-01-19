#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';

/**
 * Скрипт проверки таймаутов в транзакциях Prisma
 * Ищет все $transaction и проверяет наличие timeout и maxWait
 */

interface TransactionIssue {
  file: string;
  line: number;
  content: string;
  hasTimeout: boolean;
  hasMaxWait: boolean;
}

function findPrismaTransactions(dir: string): TransactionIssue[] {
  const issues: TransactionIssue[] = [];

  function scanDirectory(currentDir: string) {
    let items: string[];
    try {
      items = fs.readdirSync(currentDir);
    } catch (error) {
      // Игнорируем директории, к которым нет доступа
      return;
    }

    for (const item of items) {
      const fullPath = path.join(currentDir, item);

      // Пропускаем системные директории и скрипты проверки
      if (item === 'node_modules' || item === '.git' || item.startsWith('.') || 
          item === 'refactor' || item === 'templates' || item === 'characterization-tests') {
        continue;
      }

      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (error) {
        // Игнорируем файлы/директории, к которым нет доступа
        continue;
      }

      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
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
      const trimmedLine = line.trim();

      // Ищем начало транзакции
      if (trimmedLine.includes('$transaction(')) {
        let transactionStart = i;
        let transactionEnd = i;
        let braceCount = 0;
        let inTransaction = false;

        // Находим границы транзакции
        for (let j = i; j < lines.length; j++) {
          const currentLine = lines[j];

          for (const char of currentLine) {
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
          }

          if (currentLine.includes('$transaction(')) {
            inTransaction = true;
          }

          if (inTransaction && braceCount === 0 && currentLine.includes(');')) {
            transactionEnd = j;
            break;
          }
        }

        // Собираем полный текст транзакции
        const transactionLines = lines.slice(transactionStart, transactionEnd + 1);
        const transactionContent = transactionLines.join('\n');

        // Проверяем наличие таймаутов
        const hasTimeout = transactionContent.includes('timeout:');
        const hasMaxWait = transactionContent.includes('maxWait:');

        if (!hasTimeout || !hasMaxWait) {
          issues.push({
            file: path.relative(process.cwd(), filePath),
            line: transactionStart + 1,
            content: transactionContent.substring(0, 200) + (transactionContent.length > 200 ? '...' : ''),
            hasTimeout,
            hasMaxWait
          });
        }
      }
    }
  }

  scanDirectory(dir);
  return issues;
}

function main() {
  console.log('🔍 Проверка таймаутов транзакций Prisma...\n');

  const issues = findPrismaTransactions('.');

  if (issues.length === 0) {
    console.log('✅ Все транзакции Prisma имеют корректные таймауты!');
    process.exit(0);
  }

  console.log(`❌ Найдено ${issues.length} транзакций без таймаутов:\n`);

  for (const issue of issues) {
    console.log(`📁 ${issue.file}:${issue.line}`);
    console.log(`   ❌ timeout: ${issue.hasTimeout ? '✅' : '❌'}, maxWait: ${issue.hasMaxWait ? '✅' : '❌'}`);
    console.log(`   📝 ${issue.content.replace(/\n/g, '\n      ')}\n`);
  }

  console.log('\n💡 Рекомендуемые таймауты:');
  console.log('   - Простые операции (1-2 запроса): timeout: 5000ms, maxWait: 2000ms');
  console.log('   - Средние операции (3-5 запросов): timeout: 10000ms, maxWait: 5000ms');
  console.log('   - Сложные операции (много запросов): timeout: 20000ms, maxWait: 10000ms');

  process.exit(1);
}

main();