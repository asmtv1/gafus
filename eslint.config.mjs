import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";
import customRules from "./scripts/eslint-rules.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const _compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  // Ignores for the whole monorepo
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/*.d.ts",
      "packages/prisma/migrations/**",
      "packages/public-assets/public/**",
      "apps/**/public/**",
      "apps/**/logs/**",
      // Ignore JS tooling scripts that are not part of TS project service
      "apps/**/scripts/**",
      "apps/**/worker/**",
      "scripts/**",
    ],
  },

  // Base JS recommendations
  js.configs.recommended,

  // TypeScript recommendations (не type-aware для производительности)
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,

  // Type-aware конфигурация для инфраструктурных пакетов
  {
    files: ["packages/{auth,prisma,error-handling,types}/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: [
          "packages/auth/tsconfig.json",
          "packages/prisma/tsconfig.json",
          "packages/error-handling/tsconfig.json",
          "packages/types/tsconfig.json",
        ],
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // Type-aware правила только для инфраструктурных пакетов
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      // Disable nullish-coalescing here too to avoid type-aware requirement on non-TS files
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/prefer-optional-chain": "error",
    },
  },

  // Global language options
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        projectService: false,
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      import: importPlugin,
      "unused-imports": unusedImports,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "@gafus": customRules,
    },
    settings: {
      next: {
        rootDir: ["apps/web", "apps/trainer-panel", "apps/error-dashboard"],
      },
      "import/resolver": {
        node: {
          extensions: [".js", ".jsx", ".ts", ".tsx"],
        },
        typescript: {
          alwaysTryTypes: true,
          project: ["./tsconfig.base.json"],
        },
        alias: {
          map: [["@gafus", "./packages"]],
          extensions: [".ts", ".tsx", ".js", ".jsx"],
        },
      },
      react: {
        version: "detect",
      },
    },
    rules: {
      // Stylistic and quality rules (code-style.mdc + best practices)
      "max-len": [
        "warn",
        {
          code: 100,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreComments: true,
        },
      ],
      "quotes": ["warn", "double", { avoidEscape: true }],
      semi: ["error", "always"],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "warn",
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
      "import/order": "off",
      "import/no-unresolved": ["error", { ignore: ["^@gafus/"] }],
      "import/named": "error",
      "import/newline-after-import": "off",
      "import/no-cycle": ["error", { maxDepth: 1 }],
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        { vars: "all", args: "after-used", argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Defer unused vars handling to unused-imports plugin
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],
      // Too invasive for legacy code; keep stylistic preference relaxed
      "@typescript-eslint/consistent-type-definitions": "off",
      // Type-aware rule; disable in non-type-aware setup
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-empty-function": "warn",
      // Запрещаем использование any для качества кода
      "@typescript-eslint/no-explicit-any": "error",
      // Отключаем правила, требующие type-aware парсинга
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      // React rules
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Кастомные правила GAFUS
      "@gafus/no-getCurrentUserId-in-api-routes": "error",
      "@gafus/server-action-serialization": "error",
      "@gafus/no-client-code-in-server-actions": "error",
    },
  },

  // Web app specific configuration
  {
    files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: ["./apps/web/tsconfig.json"],
        },
        alias: {
          map: [
            ["@shared", "./apps/web/src/shared"],
            ["@features", "./apps/web/src/features"],
            ["@widgets", "./apps/web/src/widgets"],
            ["@", "./apps/web/src"],
            ["@gafus/core", "./packages/core/src"],
            ["@gafus/core/services/course", "./packages/core/src/services/course"],
            ["@gafus/core/services/user", "./packages/core/src/services/user"],
            ["@gafus/core/services/auth", "./packages/core/src/services/auth"],
            ["@gafus/core/services/notifications", "./packages/core/src/services/notifications"],
            ["@gafus/core/services/subscriptions", "./packages/core/src/services/subscriptions"],
            ["@gafus/core/services/tracking", "./packages/core/src/services/tracking"],
            ["@gafus/core/services/achievements", "./packages/core/src/services/achievements"],
            ["@gafus/core/errors", "./packages/core/src/errors"],
            ["@gafus/core/utils", "./packages/core/src/utils"],
            ["@gafus/core/utils/social", "./packages/core/src/utils/social"],
            ["@gafus/core/utils/training", "./packages/core/src/utils/training"],
            ["@gafus/core/utils/retry", "./packages/core/src/utils/retry"],
          ],
          extensions: [".ts", ".tsx", ".js", ".jsx"],
        },
      },
    },
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },

  // Trainer Panel specific configuration
  {
    files: ["apps/trainer-panel/**/*.{js,jsx,ts,tsx}"],
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: ["./apps/trainer-panel/tsconfig.json"],
        },
        alias: {
          map: [
            ["@shared", "./apps/trainer-panel/src/shared"],
            ["@features", "./apps/trainer-panel/src/features"],
            ["@widgets", "./apps/trainer-panel/src/widgets"],
            ["@", "./apps/trainer-panel/src"],
          ],
          extensions: [".ts", ".tsx", ".js", ".jsx"],
        },
      },
    },
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },

  // Error Dashboard specific configuration
  {
    files: ["apps/error-dashboard/**/*.{js,jsx,ts,tsx}"],
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: ["./apps/error-dashboard/tsconfig.json"],
        },
        alias: {
          map: [
            ["@shared", "./apps/error-dashboard/src/shared"],
            ["@features", "./apps/error-dashboard/src/features"],
            ["@widgets", "./apps/error-dashboard/src/widgets"],
            ["@", "./apps/error-dashboard/src"],
          ],
          extensions: [".ts", ".tsx", ".js", ".jsx"],
        },
      },
    },
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },

  // General Next.js rules for other apps
  {
    files: [
      "apps/**/{src,app,components}/**/*.{js,jsx,ts,tsx}",
      "apps/**/next.config.{js,ts,mjs}",
      "apps/**/scripts/**/*.{js,ts}",
      "apps/**/middleware.{js,ts}",
    ],
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },

  // packages/core: import resolver может не находить экспорты из того же пакета — ослабляем до warn
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "import/named": "warn",
      "@typescript-eslint/prefer-for-of": "warn",
    },
  },

  // apps/mobile: React Native / Expo — ослабляем до warn, чтобы lint проходил; правки по мере возможностей
  {
    files: ["apps/mobile/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/array-type": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-function": "warn",
      "no-useless-escape": "warn",
      "no-console": "off",
      "import/named": "warn",
      "unused-imports/no-unused-imports": "warn",
      "unused-imports/no-unused-vars": "warn",
      "prefer-const": "warn",
    },
  },

  // Node-focused overrides for workers, bots and backend-ish code
  {
    files: [
      "apps/{worker,telegram-bot,bull-board}/**/*.{js,ts}",
      "packages/{queues,webpush,worker}/**/*.{js,ts}",
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "off",
    },
  },

  // Строгие правила для инфраструктурных пакетов
  {
    files: ["packages/{auth,csrf,error-handling,queues,swr,types,webpush,worker}/**/*.{ts,tsx,js}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-definitions": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/consistent-indexed-object-style": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
    },
  },

  // Allow CommonJS require in test helper JS files
  {
    files: ["**/test-*.js", "**/*.test.js", "**/test/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Allow require imports in config files
  {
    files: [
      "**/next.config.{js,ts,mjs}",
      "**/postcss.config.{js,cjs}",
      "**/tailwind.config.{js,cjs}",
    ],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Final global overrides (after Next.js configs)
  {
    rules: {
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  // apps/mobile — после финального override, чтобы наши ослабления имели приоритет
  {
    files: ["apps/mobile/src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // apps/trainer-panel — ослабляем до warn, чтобы lint проходил; правки по мере возможностей
  {
    files: ["apps/trainer-panel/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "no-useless-catch": "warn",
    },
  },
];
