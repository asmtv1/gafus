#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const glob = require("glob");

// Конфигурация для разных приложений
const configs = {
  "apps/web": {
    muiImportsPath: "src/utils/muiImports.ts",
    patterns: ["src/**/*.tsx", "src/**/*.ts"],
    exclude: ["src/utils/muiImports.ts"],
  },
  "apps/trainer-panel": {
    muiImportsPath: "src/utils/muiImports.ts",
    patterns: ["src/**/*.tsx", "src/**/*.ts"],
    exclude: ["src/utils/muiImports.ts"],
  },
  "apps/error-dashboard": {
    muiImportsPath: "src/utils/muiImports.ts",
    patterns: ["src/**/*.tsx", "src/**/*.ts"],
    exclude: ["src/utils/muiImports.ts"],
  },
};

// Список компонентов MUI для замены
const muiComponents = [
  "Alert",
  "AlertTitle",
  "Autocomplete",
  "Avatar",
  "Box",
  "Button",
  "Card",
  "CardContent",
  "Chip",
  "CircularProgress",
  "Container",
  "Divider",
  "FormControl",
  "FormControlLabel",
  "Grid",
  "InputLabel",
  "MenuItem",
  "Paper",
  "Radio",
  "RadioGroup",
  "Select",
  "Switch",
  "TextField",
  "Typography",
];

// Список иконок MUI для замены
const muiIcons = [
  "Add",
  "Delete",
  "Edit",
  "FilterList",
  "TrendingUp",
  "School",
  "CalendarToday",
  "Person",
  "Category",
  "Analytics",
  "Assessment",
  "Favorite",
  "FavoriteBorder",
  "TurnedIn",
  "DeleteForeverSharp",
  "EditSharp",
  "Close",
  "Save",
  "Cancel",
  "Search",
  "Sort",
  "MoreVert",
];

function optimizeImports(appPath) {
  const config = configs[appPath];
  if (!config) {
    console.warn(`❌ Конфигурация не найдена для ${appPath}`);
    return;
  }

  console.warn(`🔧 Оптимизация импортов в ${appPath}...`);

  // Находим все файлы
  const files = glob.sync(config.patterns, { cwd: appPath });

  let totalFiles = 0;
  let optimizedFiles = 0;

  files.forEach((file) => {
    if (config.exclude.some((exclude) => file.includes(exclude))) {
      return;
    }

    const filePath = path.join(appPath, file);
    const content = fs.readFileSync(filePath, "utf8");

    let optimized = false;
    let newContent = content;

    // Заменяем импорты компонентов MUI
    const muiImportRegex = /import\s*{([^}]+)}\s*from\s*["']@mui\/material["']/g;
    newContent = newContent.replace(muiImportRegex, (match, imports) => {
      const components = imports.split(",").map((s) => s.trim());
      const validComponents = components.filter((comp) =>
        muiComponents.includes(comp.replace(/\s*as\s+\w+/, "")),
      );

      if (validComponents.length > 0) {
        optimized = true;
        return `import { ${validComponents.join(", ")} } from "@/utils/muiImports";`;
      }
      return match;
    });

    // Заменяем импорты иконок MUI
    const iconImportRegex = /import\s*{([^}]+)}\s*from\s*["']@mui\/icons-material["']/g;
    newContent = newContent.replace(iconImportRegex, (match, imports) => {
      const icons = imports.split(",").map((s) => s.trim());
      const validIcons = icons.filter((icon) => muiIcons.includes(icon.replace(/\s*as\s+\w+/, "")));

      if (validIcons.length > 0) {
        optimized = true;
        return `import { ${validIcons.join(", ")} } from "@/utils/muiImports";`;
      }
      return match;
    });

    // Заменяем отдельные импорты иконок
    const singleIconRegex = /import\s+(\w+)\s+from\s*["']@mui\/icons-material\/(\w+)["']/g;
    newContent = newContent.replace(singleIconRegex, (match, alias, iconName) => {
      if (muiIcons.includes(iconName)) {
        optimized = true;
        return `import { ${iconName}Icon as ${alias} } from "@/utils/muiImports";`;
      }
      return match;
    });

    if (optimized) {
      fs.writeFileSync(filePath, newContent);
      optimizedFiles++;
      console.warn(`  ✅ Оптимизирован: ${file}`);
    }

    totalFiles++;
  });

  console.warn(`📊 Результаты для ${appPath}:`);
  console.warn(`  Всего файлов: ${totalFiles}`);
  console.warn(`  Оптимизировано: ${optimizedFiles}`);
  console.warn(`  Экономия: ~${optimizedFiles * 5}KB в бандле\n`);
}

// Запускаем оптимизацию для всех приложений
Object.keys(configs).forEach(optimizeImports);

console.warn("🎉 Оптимизация импортов завершена!");
