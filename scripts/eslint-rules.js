/**
 * Кастомные ESLint правила для проекта GAFUS
 */

module.exports = {
  rules: {
    // Правило: проверка использования getCurrentUserId в API Routes
    "no-getCurrentUserId-in-api-routes": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Запрещает использование getCurrentUserId в API Routes, требуется getServerSession",
          category: "Best Practices",
          recommended: true,
        },
        messages: {
          noGetCurrentUserId:
            "Использование getCurrentUserId в API Routes запрещено. Используйте getServerSession(authOptions) вместо getCurrentUserId().",
        },
        schema: [],
      },
      create(context) {
        return {
          ImportDeclaration(node) {
            // Проверяем только файлы в app/api/
            const fileName = context.getFilename();
            if (!fileName.includes("/app/api/") && !fileName.includes("\\app\\api\\")) {
              return;
            }

            // Проверяем импорт getCurrentUserId
            if (
              node.source.value === "@/utils" ||
              node.source.value === "../utils" ||
              node.source.value === "../../utils"
            ) {
              const specifiers = node.specifiers || [];
              for (const specifier of specifiers) {
                if (
                  specifier.type === "ImportSpecifier" &&
                  specifier.imported.name === "getCurrentUserId"
                ) {
                  context.report({
                    node: specifier,
                    messageId: "noGetCurrentUserId",
                  });
                }
              }
            }
          },

          CallExpression(node) {
            // Проверяем только файлы в app/api/
            const fileName = context.getFilename();
            if (!fileName.includes("/app/api/") && !fileName.includes("\\app\\api\\")) {
              return;
            }

            // Проверяем прямой вызов getCurrentUserId
            if (node.callee.type === "Identifier" && node.callee.name === "getCurrentUserId") {
              context.report({
                node: node.callee,
                messageId: "noGetCurrentUserId",
              });
            }
          },
        };
      },
    },

    // Правило: проверка сериализации Server Actions
    "server-action-serialization": {
      meta: {
        type: "problem",
        docs: {
          description: "Проверяет, что Server Actions возвращают только сериализуемые данные",
          category: "Best Practices",
          recommended: true,
        },
        messages: {
          nonSerializableReturn:
            "Server Actions должны возвращать только JSON-совместимые данные. Избегайте функций, классов, undefined, Symbol, Map, Set.",
          nonSerializableParam:
            "Параметры Server Actions должны быть сериализуемыми. Избегайте функций, классов, undefined, Symbol, Map, Set.",
        },
        schema: [],
      },
      create(context) {
        let isServerAction = false;

        // Вспомогательная функция для проверки сериализуемости
        function isNonSerializable(node) {
          // Проверяем на функции
          if (
            node.type === "FunctionExpression" ||
            node.type === "ArrowFunctionExpression" ||
            node.type === "FunctionDeclaration"
          ) {
            return true;
          }

          // Проверяем на undefined (прямое использование)
          if (node.type === "Identifier" && node.name === "undefined") {
            return true;
          }

          // Проверяем на Symbol
          if (
            node.type === "CallExpression" &&
            node.callee.type === "Identifier" &&
            node.callee.name === "Symbol"
          ) {
            return true;
          }

          // Проверяем на new Map(), new Set()
          if (
            node.type === "NewExpression" &&
            node.callee.type === "Identifier" &&
            ["Map", "Set"].includes(node.callee.name)
          ) {
            return true;
          }

          return false;
        }

        // Вспомогательная функция для проверки сериализуемости
        function checkSerializable(node, messageId) {
          if (isNonSerializable(node)) {
            context.report({
              node,
              messageId,
            });
          }
        }

        return {
          // Проверяем наличие "use server" директивы
          ExpressionStatement(node) {
            if (node.expression.type === "Literal" && node.expression.value === "use server") {
              isServerAction = true;
            }
          },

          // Проверяем параметры функций
          FunctionDeclaration(node) {
            if (!isServerAction) return;

            // Проверяем параметры функции
            if (node.params) {
              for (const param of node.params) {
                checkSerializable(param, "nonSerializableParam");
              }
            }
          },

          // Проверяем возвращаемые значения
          ReturnStatement(node) {
            if (!isServerAction) return;

            if (node.argument) {
              checkSerializable(node.argument, "nonSerializableReturn");
            }
          },

          // Проверяем стрелочные функции
          ArrowFunctionExpression(node) {
            if (!isServerAction) return;

            // Проверяем параметры
            if (node.params) {
              for (const param of node.params) {
                checkSerializable(param, "nonSerializableParam");
              }
            }
          },
        };
      },
    },

    // Правило: запрет window и useOfflineStore в Server Actions
    "no-client-code-in-server-actions": {
      meta: {
        type: "problem",
        docs: {
          description: "Запрещает использование window и useOfflineStore в Server Actions",
          category: "Best Practices",
          recommended: true,
        },
        messages: {
          noWindow: "Использование window в Server Actions запрещено.",
          noUseOfflineStore: "Использование useOfflineStore в Server Actions запрещено.",
        },
        schema: [],
      },
      create(context) {
        let isServerAction = false;

        return {
          ExpressionStatement(node) {
            if (node.expression.type === "Literal" && node.expression.value === "use server") {
              isServerAction = true;
            }
          },

          MemberExpression(node) {
            if (!isServerAction) return;

            // Проверяем window.something
            if (node.object.type === "Identifier" && node.object.name === "window") {
              context.report({
                node: node.object,
                messageId: "noWindow",
              });
            }
          },

          CallExpression(node) {
            if (!isServerAction) return;

            // Проверяем вызов useOfflineStore
            if (node.callee.type === "Identifier" && node.callee.name === "useOfflineStore") {
              context.report({
                node: node.callee,
                messageId: "noUseOfflineStore",
              });
            }
          },

          ImportDeclaration(node) {
            if (!isServerAction) return;

            // Проверяем импорт useOfflineStore
            if (node.source.value.includes("useOfflineStore")) {
              context.report({
                node,
                messageId: "noUseOfflineStore",
              });
            }
          },
        };
      },
    },

    /**
     * Клиентский catch без reportClientError — мягкое напоминание про Tracer (warn).
     * См. docs/audit/tracer-client-catch-process.md
     */
    "require-client-catch-tracer": {
      meta: {
        type: "suggestion",
        docs: {
          description:
            "В значимом блоке catch клиентского кода рекомендуется вызывать reportClientError для Tracer",
          category: "Best Practices",
          recommended: false,
        },
        messages: {
          missingReport:
            "Добавьте reportClientError(…) в catch для отправки в Tracer (см. docs/audit/tracer-client-catch-process.md и error-handling.mdc).",
        },
        schema: [],
      },
      create(context) {
        const filename = context.getFilename().replace(/\\/g, "/");

        function isInScope() {
          if (filename.includes("/apps/mobile/")) {
            return true;
          }
          if (filename.includes("/packages/ui-components/")) {
            return true;
          }
          if (filename.includes("/packages/csrf/")) {
            return (
              filename.includes("/packages/csrf/src/react/") ||
              filename.endsWith("/packages/csrf/src/store.ts")
            );
          }
          if (
            filename.includes("/apps/web/") ||
            filename.includes("/apps/trainer-panel/") ||
            filename.includes("/apps/admin-panel/")
          ) {
            return hasUseClientDirective(context.getSourceCode().ast);
          }
          return false;
        }

        function hasUseClientDirective(program) {
          if (!program || program.type !== "Program") {
            return false;
          }
          for (const stmt of program.body) {
            if (stmt.type === "ImportDeclaration") {
              continue;
            }
            if (
              stmt.type === "ExpressionStatement" &&
              stmt.expression.type === "Literal" &&
              stmt.expression.value === "use client"
            ) {
              return true;
            }
            break;
          }
          return false;
        }

        function hasReportClientErrorCall(node) {
          if (!node || typeof node !== "object") {
            return false;
          }
          if (node.type === "CallExpression") {
            const { callee } = node;
            if (callee.type === "Identifier" && callee.name === "reportClientError") {
              return true;
            }
          }
          for (const key of Object.keys(node)) {
            if (key === "parent") {
              continue;
            }
            const v = node[key];
            if (Array.isArray(v)) {
              for (const item of v) {
                if (hasReportClientErrorCall(item)) {
                  return true;
                }
              }
            } else if (v && typeof v === "object" && typeof v.type === "string") {
              if (hasReportClientErrorCall(v)) {
                return true;
              }
            }
          }
          return false;
        }

        function isUnstableRethrowStatement(stmt) {
          if (stmt.type !== "ExpressionStatement") {
            return false;
          }
          const { expression } = stmt;
          if (expression.type !== "CallExpression") {
            return false;
          }
          const { callee } = expression;
          return callee.type === "Identifier" && callee.name === "unstable_rethrow";
        }

        function isTrivialCatchBody(body) {
          if (!body || body.type !== "BlockStatement") {
            return true;
          }
          const { body: stmts } = body;
          if (stmts.length === 0) {
            return true;
          }
          if (stmts.length === 1) {
            const only = stmts[0];
            if (only.type === "ThrowStatement") {
              return true;
            }
            if (isUnstableRethrowStatement(only)) {
              return true;
            }
          }
          return false;
        }

        if (!isInScope()) {
          return {};
        }

        return {
          CatchClause(node) {
            if (isTrivialCatchBody(node.body)) {
              return;
            }
            if (hasReportClientErrorCall(node.body)) {
              return;
            }
            context.report({
              node: node.body,
              messageId: "missingReport",
            });
          },
        };
      },
    },
  },
};
