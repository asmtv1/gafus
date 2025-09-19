#!/usr/bin/env node

/**
 * Скрипт для поиска неиспользуемых функций в проекте
 * Анализирует TypeScript/JavaScript файлы и находит функции, которые не вызываются
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Цвета для консоли
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

// Игнорируемые паттерны
const IGNORE_PATTERNS = [
  'node_modules',
  '.next',
  'dist',
  'build',
  '.git',
  'coverage',
  '.turbo',
  '*.d.ts',
  '*.map',
  '*.js.map'
];

// Паттерны для экспортируемых функций (которые могут использоваться извне)
const EXPORT_PATTERNS = [
  /^export\s+(default\s+)?(async\s+)?function/,
  /^export\s+(default\s+)?(async\s+)?const\s+\w+\s*=\s*(async\s+)?\(/,
  /^export\s+(default\s+)?(async\s+)?const\s+\w+\s*=\s*(async\s+)?function/,
  /^export\s+{\s*\w+/,
  /^export\s+\*\s+from/,
  /module\.exports\s*=/,
  /exports\.\w+\s*=/
];

// Функции, которые нужно игнорировать (системные или специальные)
const IGNORE_FUNCTIONS = [
  'main',
  'default',
  'index',
  'handler',
  'middleware',
  'getServerSideProps',
  'getStaticProps',
  'getStaticPaths',
  'getInitialProps',
  'componentDidMount',
  'componentDidUpdate',
  'componentWillUnmount',
  'useEffect',
  'useState',
  'useCallback',
  'useMemo',
  'useRef',
  'useContext',
  'useReducer',
  'useLayoutEffect',
  'useImperativeHandle',
  'useDebugValue',
  'useDeferredValue',
  'useTransition',
  'useId',
  'useSyncExternalStore',
  'useInsertionEffect'
];

class UnusedFunctionsFinder {
  constructor() {
    this.functions = new Map(); // functionName -> { file, line, isExported, isUsed }
    this.functionCalls = new Set();
    this.files = [];
    this.results = [];
  }

  // Рекурсивно собираем все файлы проекта
  collectFiles(dir = process.cwd()) {
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Проверяем, не игнорируем ли мы эту папку
          const shouldIgnore = IGNORE_PATTERNS.some(pattern => {
            if (pattern.includes('*')) {
              return item.includes(pattern.replace('*', ''));
            }
            return item === pattern;
          });
          
          if (!shouldIgnore) {
            this.collectFiles(fullPath);
          }
        } else if (stat.isFile()) {
          const ext = path.extname(item);
          if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
            this.files.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.warn(`${colors.yellow}Предупреждение: не удалось прочитать папку ${dir}: ${error.message}${colors.reset}`);
    }
  }

  // Извлекаем функции из файла
  extractFunctions(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        const trimmedLine = line.trim();
        
        // Пропускаем комментарии и пустые строки
        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine.startsWith('*') || !trimmedLine) {
          return;
        }
        
        // Ищем объявления функций
        const functionPatterns = [
          // function name() {}
          /^(export\s+)?(async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/,
          // const name = function() {}
          /^(export\s+)?(async\s+)?const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(async\s+)?function\s*\(/,
          // const name = () => {}
          /^(export\s+)?(async\s+)?const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(async\s+)?\(/,
          // const name = async () => {}
          /^(export\s+)?const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*async\s*\(/,
          // class methods
          /^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*[:{]/,
          // React components
          /^(export\s+)?(default\s+)?(async\s+)?function\s+([A-Z][a-zA-Z0-9_$]*)\s*\(/,
          /^(export\s+)?(default\s+)?const\s+([A-Z][a-zA-Z0-9_$]*)\s*=\s*(async\s+)?\(/
        ];
        
        for (const pattern of functionPatterns) {
          const match = trimmedLine.match(pattern);
          if (match) {
            const functionName = match[3] || match[4] || match[2];
            
            if (functionName && !IGNORE_FUNCTIONS.includes(functionName)) {
              const isExported = trimmedLine.includes('export') || EXPORT_PATTERNS.some(p => p.test(trimmedLine));
              
              this.functions.set(functionName, {
                file: filePath,
                line: index + 1,
                isExported,
                isUsed: false,
                declaration: trimmedLine
              });
            }
          }
        }
      });
    } catch (error) {
      console.warn(`${colors.yellow}Предупреждение: не удалось прочитать файл ${filePath}: ${error.message}${colors.reset}`);
    }
  }

  // Ищем вызовы функций
  findFunctionCalls(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Паттерны для вызовов функций
      const callPatterns = [
        // functionName()
        /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,
        // obj.functionName()
        /\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,
        // import { functionName }
        /import\s*\{\s*([^}]+)\s*\}\s*from/g,
        // import functionName
        /import\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from/g,
        // require('module')
        /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g
      ];
      
      callPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const functionName = match[1];
          if (functionName && typeof functionName === 'string') {
            // Обрабатываем множественные импорты
            const names = functionName.split(',').map(name => name.trim().split(' as ')[0].trim());
            names.forEach(name => this.functionCalls.add(name));
          }
        }
      });
    } catch (error) {
      console.warn(`${colors.yellow}Предупреждение: не удалось проанализировать файл ${filePath}: ${error.message}${colors.reset}`);
    }
  }

  // Анализируем использование функций
  analyzeUsage() {
    for (const [functionName, func] of this.functions) {
      // Проверяем, вызывается ли функция
      const isCalled = this.functionCalls.has(functionName);
      
      // Проверяем, экспортируется ли функция (может использоваться извне)
      if (func.isExported) {
        // Для экспортированных функций проверяем более тщательно
        const isUsedExternally = this.checkExternalUsage(functionName);
        func.isUsed = isCalled || isUsedExternally;
      } else {
        func.isUsed = isCalled;
      }
      
      if (!func.isUsed) {
        this.results.push({
          name: functionName,
          file: func.file,
          line: func.line,
          declaration: func.declaration,
          isExported: func.isExported
        });
      }
    }
  }

  // Проверяем внешнее использование экспортированных функций
  checkExternalUsage(functionName) {
    // Ищем импорты этой функции в других файлах
    for (const file of this.files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        
        // Проверяем различные паттерны импорта
        const importPatterns = [
          new RegExp(`import\\s*\\{[^}]*\\b${functionName}\\b[^}]*\\}`, 'g'),
          new RegExp(`import\\s+${functionName}\\b`, 'g'),
          new RegExp(`from\\s+['"][^'"]*['"]`, 'g')
        ];
        
        for (const pattern of importPatterns) {
          if (pattern.test(content)) {
            return true;
          }
        }
      } catch (error) {
        // Игнорируем ошибки чтения файлов
      }
    }
    return false;
  }

  // Форматируем результаты
  formatResults() {
    if (this.results.length === 0) {
      console.log(`${colors.green}${colors.bold}✅ Отлично! Неиспользуемые функции не найдены.${colors.reset}`);
      return;
    }

    console.log(`${colors.red}${colors.bold}🔍 Найдено ${this.results.length} потенциально неиспользуемых функций:${colors.reset}\n`);
    
    // Группируем по файлам
    const groupedResults = {};
    this.results.forEach(result => {
      const relativePath = path.relative(process.cwd(), result.file);
      if (!groupedResults[relativePath]) {
        groupedResults[relativePath] = [];
      }
      groupedResults[relativePath].push(result);
    });

    // Выводим результаты
    Object.entries(groupedResults).forEach(([file, functions]) => {
      console.log(`${colors.blue}${colors.bold}📁 ${file}${colors.reset}`);
      
      functions.forEach(func => {
        const exportStatus = func.isExported ? 
          `${colors.yellow}[ЭКСПОРТ]${colors.reset}` : 
          `${colors.magenta}[ЛОКАЛЬ]${colors.reset}`;
        
        console.log(`  ${colors.cyan}${func.name}${colors.reset} ${exportStatus} - строка ${colors.yellow}${func.line}${colors.reset}`);
        console.log(`    ${colors.dim}${func.declaration}${colors.reset}\n`);
      });
    });

    // Выводим статистику
    const exported = this.results.filter(f => f.isExported).length;
    const local = this.results.filter(f => !f.isExported).length;
    
    console.log(`${colors.bold}📊 Статистика:${colors.reset}`);
    console.log(`  • Экспортированные функции: ${colors.yellow}${exported}${colors.reset}`);
    console.log(`  • Локальные функции: ${colors.magenta}${local}${colors.reset}`);
    console.log(`  • Всего файлов: ${colors.blue}${Object.keys(groupedResults).length}${colors.reset}`);
  }

  // Основной метод запуска
  run() {
    console.log(`${colors.bold}${colors.cyan}🔍 Поиск неиспользуемых функций в проекте...${colors.reset}\n`);
    
    // Собираем файлы только из папок apps и packages
    console.log(`${colors.yellow}📂 Сбор файлов проекта...${colors.reset}`);
    const appsDir = path.join(process.cwd(), 'apps');
    const packagesDir = path.join(process.cwd(), 'packages');
    
    if (fs.existsSync(appsDir)) {
      this.collectFiles(appsDir);
    }
    if (fs.existsSync(packagesDir)) {
      this.collectFiles(packagesDir);
    }
    
    console.log(`   Найдено ${this.files.length} файлов для анализа\n`);

    // Извлекаем функции
    console.log(`${colors.yellow}🔧 Извлечение функций...${colors.reset}`);
    this.files.forEach(file => {
      this.extractFunctions(file);
    });
    console.log(`   Найдено ${this.functions.size} функций\n`);

    // Ищем вызовы функций
    console.log(`${colors.yellow}📞 Поиск вызовов функций...${colors.reset}`);
    this.files.forEach(file => {
      this.findFunctionCalls(file);
    });
    console.log(`   Найдено ${this.functionCalls.size} вызовов\n`);

    // Анализируем использование
    console.log(`${colors.yellow}🧮 Анализ использования...${colors.reset}`);
    this.analyzeUsage();

    // Выводим результаты
    console.log(`${colors.yellow}📋 Формирование отчета...${colors.reset}\n`);
    this.formatResults();

    // Возвращаем код выхода
    return this.results.length > 0 ? 1 : 0;
  }
}

// Запуск скрипта
if (require.main === module) {
  const finder = new UnusedFunctionsFinder();
  const exitCode = finder.run();
  process.exit(exitCode);
}

module.exports = UnusedFunctionsFinder;
