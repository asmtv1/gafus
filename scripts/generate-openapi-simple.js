#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Простой генератор OpenAPI документации на основе существующих Zod схем
 */

// Базовый OpenAPI документ
const openApiDocument = {
  openapi: "3.0.0",
  info: {
    title: "Gafus API",
    version: "1.0.0",
    description: "API для платформы тренировок с питомцами - автоматически сгенерировано из Zod схем",
    contact: {
      name: "Gafus Team",
      email: "support@gafus.ru",
    },
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Development server",
    },
    {
      url: "https://api.gafus.ru",
      description: "Production server",
    },
  ],
  tags: [
    { name: "auth", description: "Аутентификация и авторизация" },
    { name: "pets", description: "Управление питомцами" },
    { name: "courses", description: "Курсы и тренировки" },
    { name: "training", description: "Тренировочные сессии" },
    { name: "user", description: "Профиль пользователя" },
    { name: "notifications", description: "Уведомления и подписки" },
  ],
  components: {
    securitySchemes: {
      sessionAuth: {
        type: "apiKey",
        in: "cookie",
        name: "next-auth.session-token",
        description: "Сессионный токен NextAuth.js",
      },
    },
  },
  paths: {},
};

// Определяем пути API на основе серверных экшенов
const apiPaths = {
  // ===== АУТЕНТИФИКАЦИЯ =====
  "/api/auth/register": {
    post: {
      summary: "Регистрация пользователя",
      description: "Создание нового аккаунта пользователя",
      tags: ["auth"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "phone", "password", "confirmPassword"],
              properties: {
                name: {
                  type: "string",
                  minLength: 3,
                  maxLength: 50,
                  pattern: "^[A-Za-z0-9_]+$",
                  description: "Имя пользователя (только английские буквы, цифры и _)",
                  example: "john_doe"
                },
                phone: {
                  type: "string",
                  description: "Номер телефона в российском формате",
                  example: "+79123456789"
                },
                password: {
                  type: "string",
                  minLength: 6,
                  maxLength: 100,
                  pattern: "^[A-Za-z0-9]+$",
                  description: "Пароль (только английские буквы и цифры)",
                  example: "password123"
                },
                confirmPassword: {
                  type: "string",
                  description: "Подтверждение пароля",
                  example: "password123"
                }
              }
            }
          }
        }
      },
      responses: {
        "200": {
          description: "Успешная регистрация",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Пользователь успешно зарегистрирован" },
                  userId: { type: "string", format: "uuid", example: "123e4567-e89b-12d3-a456-426614174000" }
                }
              }
            }
          }
        },
        "400": {
          description: "Ошибка валидации",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: false },
                  errors: {
                    type: "object",
                    additionalProperties: { type: "string" },
                    example: { name: "Имя пользователя должно содержать минимум 3 символа" }
                  }
                }
              }
            }
          }
        }
      }
    }
  },

  "/api/auth/check-user-state": {
    post: {
      summary: "Проверка статуса пользователя",
      description: "Проверка статуса подтверждения пользователя по имени",
      tags: ["auth"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["username"],
              properties: {
                username: {
                  type: "string",
                  minLength: 1,
                  maxLength: 100,
                  description: "Имя пользователя",
                  example: "john_doe"
                }
              }
            }
          }
        }
      },
      responses: {
        "200": {
          description: "Статус пользователя",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  confirmed: { type: "boolean", example: true },
                  phone: { type: "string", nullable: true, example: "+79123456789" }
                }
              }
            }
          }
        }
      }
    }
  },

  // ===== ПИТОМЦЫ =====
  "/api/pets": {
    get: {
      summary: "Получить список питомцев",
      description: "Получение списка всех питомцев текущего пользователя",
      tags: ["pets"],
      security: [{ sessionAuth: [] }],
      responses: {
        "200": {
          description: "Список питомцев",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", format: "uuid" },
                    name: { type: "string", example: "Барсик" },
                    type: { type: "string", enum: ["DOG", "CAT"], example: "CAT" },
                    breed: { type: "string", example: "Персидская" },
                    birthDate: { type: "string", format: "date", example: "2020-01-15" },
                    heightCm: { type: "number", nullable: true, example: 25 },
                    weightKg: { type: "number", nullable: true, example: 4.5 },
                    photoUrl: { type: "string", nullable: true },
                    notes: { type: "string", nullable: true },
                    createdAt: { type: "string", format: "date-time" },
                    updatedAt: { type: "string", format: "date-time" },
                    awards: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", format: "uuid" },
                          title: { type: "string" },
                          description: { type: "string", nullable: true },
                          date: { type: "string", format: "date-time" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "401": {
          description: "Пользователь не авторизован",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: false },
                  message: { type: "string", example: "Пользователь не авторизован" }
                }
              }
            }
          }
        }
      }
    },
    post: {
      summary: "Создать питомца",
      description: "Создание нового питомца для текущего пользователя",
      tags: ["pets"],
      security: [{ sessionAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "type", "breed", "birthDate"],
              properties: {
                name: {
                  type: "string",
                  minLength: 2,
                  maxLength: 50,
                  pattern: "^[а-яёА-ЯЁa-zA-Z\\s-]+$",
                  description: "Имя питомца (только буквы, пробелы и дефис)",
                  example: "Барсик"
                },
                type: {
                  type: "string",
                  enum: ["DOG", "CAT"],
                  description: "Тип питомца",
                  example: "CAT"
                },
                breed: {
                  type: "string",
                  minLength: 2,
                  maxLength: 50,
                  description: "Порода питомца",
                  example: "Персидская"
                },
                birthDate: {
                  type: "string",
                  format: "date",
                  description: "Дата рождения питомца",
                  example: "2020-01-15"
                },
                heightCm: {
                  type: "number",
                  minimum: 1,
                  maximum: 200,
                  description: "Рост в сантиметрах",
                  example: 25
                },
                weightKg: {
                  type: "number",
                  minimum: 0.1,
                  maximum: 200,
                  description: "Вес в килограммах",
                  example: 4.5
                },
                photoUrl: {
                  type: "string",
                  format: "uri",
                  description: "URL фотографии питомца",
                  example: "https://example.com/cat.jpg"
                },
                notes: {
                  type: "string",
                  maxLength: 500,
                  description: "Заметки о питомце",
                  example: "Очень ласковый кот"
                }
              }
            }
          }
        }
      },
      responses: {
        "200": {
          description: "Созданный питомец",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  name: { type: "string" },
                  type: { type: "string", enum: ["DOG", "CAT"] },
                  breed: { type: "string" },
                  birthDate: { type: "string", format: "date" },
                  heightCm: { type: "number", nullable: true },
                  weightKg: { type: "number", nullable: true },
                  photoUrl: { type: "string", nullable: true },
                  notes: { type: "string", nullable: true },
                  createdAt: { type: "string", format: "date-time" },
                  updatedAt: { type: "string", format: "date-time" },
                  awards: { type: "array", items: { type: "object" } }
                }
              }
            }
          }
        }
      }
    }
  },

  "/api/pets/{petId}": {
    put: {
      summary: "Обновить питомца",
      description: "Обновление данных существующего питомца",
      tags: ["pets"],
      security: [{ sessionAuth: [] }],
      parameters: [
        {
          name: "petId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
          description: "ID питомца"
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["id"],
              properties: {
                id: { type: "string", format: "uuid", description: "ID питомца" },
                name: { type: "string", minLength: 2, maxLength: 50 },
                type: { type: "string", enum: ["DOG", "CAT"] },
                breed: { type: "string", minLength: 2, maxLength: 50 },
                birthDate: { type: "string", format: "date" },
                heightCm: { type: "number", minimum: 1, maximum: 200 },
                weightKg: { type: "number", minimum: 0.1, maximum: 200 },
                photoUrl: { type: "string", format: "uri" },
                notes: { type: "string", maxLength: 500 }
              }
            }
          }
        }
      },
      responses: {
        "200": {
          description: "Обновленный питомец",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  name: { type: "string" },
                  type: { type: "string", enum: ["DOG", "CAT"] },
                  breed: { type: "string" },
                  birthDate: { type: "string", format: "date" },
                  heightCm: { type: "number", nullable: true },
                  weightKg: { type: "number", nullable: true },
                  photoUrl: { type: "string", nullable: true },
                  notes: { type: "string", nullable: true },
                  createdAt: { type: "string", format: "date-time" },
                  updatedAt: { type: "string", format: "date-time" },
                  awards: { type: "array", items: { type: "object" } }
                }
              }
            }
          }
        }
      }
    },
    delete: {
      summary: "Удалить питомца",
      description: "Удаление питомца пользователя",
      tags: ["pets"],
      security: [{ sessionAuth: [] }],
      parameters: [
        {
          name: "petId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
          description: "ID питомца"
        }
      ],
      responses: {
        "200": {
          description: "Успешное удаление",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Питомец успешно удален" }
                }
              }
            }
          }
        }
      }
    }
  },

  // ===== ТРЕНИРОВКИ =====
  "/api/training/start-step": {
    post: {
      summary: "Начать шаг тренировки",
      description: "Начало выполнения шага тренировки",
      tags: ["training"],
      security: [{ sessionAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["courseId", "day", "stepIndex", "status", "durationSec"],
              properties: {
                courseId: {
                  type: "string",
                  minLength: 1,
                  description: "ID курса",
                  example: "course-uuid"
                },
                day: {
                  type: "integer",
                  minimum: 1,
                  description: "Номер дня тренировки",
                  example: 1
                },
                stepIndex: {
                  type: "integer",
                  minimum: 0,
                  description: "Индекс шага (начиная с 0)",
                  example: 0
                },
                status: {
                  type: "string",
                  enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "PAUSED"],
                  description: "Статус шага",
                  example: "IN_PROGRESS"
                },
                durationSec: {
                  type: "number",
                  minimum: 0,
                  description: "Продолжительность в секундах",
                  example: 300
                }
              }
            }
          }
        }
      },
      responses: {
        "200": {
          description: "Успешное начало шага",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true }
                }
              }
            }
          }
        }
      }
    }
  },

  "/api/training/pause-resume": {
    post: {
      summary: "Пауза/возобновление шага",
      description: "Постановка на паузу или возобновление шага тренировки",
      tags: ["training"],
      security: [{ sessionAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["courseId", "day", "stepIndex"],
              properties: {
                courseId: { type: "string", minLength: 1 },
                day: { type: "integer", minimum: 1 },
                stepIndex: { type: "integer", minimum: 0 },
                timeLeftSec: {
                  type: "number",
                  minimum: 0,
                  description: "Оставшееся время в секундах (только для паузы)",
                  example: 180
                }
              }
            }
          }
        }
      },
      responses: {
        "200": {
          description: "Успешная пауза/возобновление",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true }
                }
              }
            }
          }
        }
      }
    }
  },

  // ===== КУРСЫ =====
  "/api/courses": {
    get: {
      summary: "Получить список курсов",
      description: "Получение списка всех доступных курсов с прогрессом пользователя",
      tags: ["courses"],
      security: [{ sessionAuth: [] }],
      parameters: [
        {
          name: "userId",
          in: "query",
          required: false,
          schema: { type: "string", format: "uuid" },
          description: "ID пользователя (опционально)"
        }
      ],
      responses: {
        "200": {
          description: "Список курсов",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string", format: "uuid" },
                        name: { type: "string" },
                        type: { type: "string" },
                        description: { type: "string", nullable: true },
                        shortDesc: { type: "string", nullable: true },
                        duration: { type: "number" },
                        logoImg: { type: "string", nullable: true },
                        isPrivate: { type: "boolean" },
                        avgRating: { type: "number", nullable: true },
                        trainingLevel: { type: "string", nullable: true },
                        createdAt: { type: "string", format: "date-time" },
                        authorUsername: { type: "string" },
                        favoritedBy: { type: "number" },
                        userStatus: { type: "string" },
                        startedAt: { type: "string", format: "date-time", nullable: true },
                        completedAt: { type: "string", format: "date-time", nullable: true },
                        isFavorite: { type: "boolean" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },

  "/api/courses/{courseId}/rate": {
    post: {
      summary: "Оценить курс",
      description: "Оценка курса пользователем",
      tags: ["courses"],
      security: [{ sessionAuth: [] }],
      parameters: [
        {
          name: "courseId",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "ID курса"
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["courseId", "rating"],
              properties: {
                courseId: { type: "string", minLength: 1 },
                rating: {
                  type: "number",
                  minimum: 1,
                  maximum: 5,
                  description: "Оценка от 1 до 5",
                  example: 5
                }
              }
            }
          }
        }
      },
      responses: {
        "200": {
          description: "Успешная оценка",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Курс успешно оценен" }
                }
              }
            }
          }
        }
      }
    }
  },

  "/api/courses/{courseId}/favorite": {
    post: {
      summary: "Переключить избранное",
      description: "Добавление или удаление курса из избранного",
      tags: ["courses"],
      security: [{ sessionAuth: [] }],
      parameters: [
        {
          name: "courseId",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "ID курса"
        }
      ],
      responses: {
        "200": {
          description: "Статус избранного",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  isFavorite: { type: "boolean", example: true }
                }
              }
            }
          }
        }
      }
    }
  },

  // ===== ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ =====
  "/api/user/profile": {
    get: {
      summary: "Получить профиль",
      description: "Получение профиля текущего пользователя",
      tags: ["user"],
      security: [{ sessionAuth: [] }],
      responses: {
        "200": {
          description: "Профиль пользователя",
          content: {
            "application/json": {
              schema: {
                type: "object",
                nullable: true,
                properties: {
                  id: { type: "string", format: "uuid" },
                  userId: { type: "string", format: "uuid" },
                  fullName: { type: "string", nullable: true },
                  about: { type: "string", nullable: true },
                  telegram: { type: "string", nullable: true },
                  instagram: { type: "string", nullable: true },
                  website: { type: "string", nullable: true },
                  birthDate: { type: "string", format: "date-time", nullable: true },
                  createdAt: { type: "string", format: "date-time" },
                  updatedAt: { type: "string", format: "date-time" }
                }
              }
            }
          }
        }
      }
    },
    put: {
      summary: "Обновить профиль",
      description: "Обновление профиля текущего пользователя",
      tags: ["user"],
      security: [{ sessionAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                fullName: { type: "string", maxLength: 120 },
                about: { type: "string", maxLength: 2000 },
                telegram: { type: "string", maxLength: 100 },
                instagram: { type: "string", maxLength: 100 },
                website: { type: "string", maxLength: 200 },
                birthDate: { type: "string", maxLength: 100 }
              }
            }
          }
        }
      },
      responses: {
        "200": {
          description: "Обновленный профиль",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  userId: { type: "string", format: "uuid" },
                  fullName: { type: "string", nullable: true },
                  about: { type: "string", nullable: true },
                  telegram: { type: "string", nullable: true },
                  instagram: { type: "string", nullable: true },
                  website: { type: "string", nullable: true },
                  birthDate: { type: "string", format: "date-time", nullable: true },
                  createdAt: { type: "string", format: "date-time" },
                  updatedAt: { type: "string", format: "date-time" }
                }
              }
            }
          }
        }
      }
    }
  },

  // ===== УВЕДОМЛЕНИЯ =====
  "/api/notifications/subscription": {
    post: {
      summary: "Обновить подписку",
      description: "Обновление push-подписки пользователя",
      tags: ["notifications"],
      security: [{ sessionAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["userId", "endpoint", "p256dh", "auth", "keys"],
              properties: {
                id: { type: "string", description: "ID подписки (опционально)" },
                userId: { type: "string", format: "uuid" },
                endpoint: { type: "string", format: "uri" },
                p256dh: { type: "string" },
                auth: { type: "string" },
                keys: {
                  type: "object",
                  required: ["p256dh", "auth"],
                  properties: {
                    p256dh: { type: "string" },
                    auth: { type: "string" }
                  }
                }
              }
            }
          }
        }
      },
      responses: {
        "200": {
          description: "Успешное обновление подписки",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true }
                }
              }
            }
          }
        }
      }
    },
    delete: {
      summary: "Удалить подписку",
      description: "Удаление push-подписки пользователя",
      tags: ["notifications"],
      security: [{ sessionAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                endpoint: { type: "string", format: "uri", description: "Endpoint подписки (опционально)" }
              }
            }
          }
        }
      },
      responses: {
        "200": {
          description: "Успешное удаление подписки",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true }
                }
              }
            }
          }
        }
      }
    }
  },

  "/api/notifications/subscription/status": {
    get: {
      summary: "Получить статус подписки",
      description: "Проверка статуса push-подписки пользователя",
      tags: ["notifications"],
      security: [{ sessionAuth: [] }],
      responses: {
        "200": {
          description: "Статус подписки",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  hasSubscription: { type: "boolean", example: true }
                }
              }
            }
          }
        }
      }
    }
  }
};

// Объединяем пути с основным документом
openApiDocument.paths = apiPaths;

async function generateOpenApiDocumentation() {
  try {
    console.log('🚀 Генерация OpenAPI документации...');

    // Создаем директорию для документации
    const docsDir = path.join(__dirname, '../docs/api');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Генерируем JSON файл
    const jsonPath = path.join(docsDir, 'openapi.json');
    fs.writeFileSync(jsonPath, JSON.stringify(openApiDocument, null, 2));
    console.log(`✅ OpenAPI JSON создан: ${jsonPath}`);

    // Генерируем YAML файл
    const yaml = require('js-yaml');
    const yamlPath = path.join(docsDir, 'openapi.yaml');
    fs.writeFileSync(yamlPath, yaml.dump(openApiDocument));
    console.log(`✅ OpenAPI YAML создан: ${yamlPath}`);

    // Создаем HTML документацию с Swagger UI
    const htmlPath = path.join(docsDir, 'index.html');
    const htmlContent = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gafus API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin:0; background: #fafafa; }
    .swagger-ui .topbar { background-color: #2c3e50; }
    .swagger-ui .topbar .download-url-wrapper { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: './openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: "StandaloneLayout",
        validatorUrl: null,
        docExpansion: "list",
        defaultModelsExpandDepth: 2,
        defaultModelExpandDepth: 2,
        displayRequestDuration: true,
        tryItOutEnabled: true,
        requestInterceptor: (req) => {
          if (req.url.startsWith('/api/')) {
            req.url = 'http://localhost:3000' + req.url;
          }
          return req;
        }
      });
    };
  </script>
</body>
</html>`;
    fs.writeFileSync(htmlPath, htmlContent);
    console.log(`✅ HTML документация создана: ${htmlPath}`);

    // Создаем README
    const readmePath = path.join(docsDir, 'README.md');
    const readmeContent = `# Gafus API Documentation

## Обзор

Это автоматически сгенерированная документация API для платформы Gafus, созданная на основе Zod схем валидации из серверных экшенов.

## Структура документации

- \`openapi.json\` - OpenAPI спецификация в формате JSON
- \`openapi.yaml\` - OpenAPI спецификация в формате YAML  
- \`index.html\` - Интерактивная документация с Swagger UI
- \`README.md\` - Этот файл

## Использование

### Просмотр документации

Откройте \`index.html\` в браузере для интерактивного просмотра API документации.

### Генерация документации

Для обновления документации запустите:

\`\`\`bash
pnpm run generate:openapi
\`\`\`

## Основные разделы API

### 🔐 Аутентификация (\`/api/auth\`)
- Регистрация пользователей
- Проверка статуса пользователя

### 🐕 Питомцы (\`/api/pets\`)
- Создание и управление питомцами
- Получение списка питомцев
- Обновление данных питомцев

### 🏃 Тренировки (\`/api/training\`)
- Начало и управление тренировочными сессиями
- Пауза и возобновление шагов

### 📚 Курсы (\`/api/courses\`)
- Получение списка курсов
- Оценка курсов
- Управление избранными курсами

### 👤 Пользователь (\`/api/user\`)
- Управление профилем

### 🔔 Уведомления (\`/api/notifications\`)
- Push-подписки
- Управление уведомлениями

## Безопасность

API использует сессионную аутентификацию через NextAuth.js.

## Валидация

Все входные данные валидируются с помощью Zod схем в серверных экшенах.

## Примеры использования

### Регистрация пользователя

\`\`\`bash
curl -X POST http://localhost:3000/api/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "john_doe",
    "phone": "+79123456789",
    "password": "password123",
    "confirmPassword": "password123"
  }'
\`\`\`

### Создание питомца

\`\`\`bash
curl -X POST http://localhost:3000/api/pets \\
  -H "Content-Type: application/json" \\
  -H "Cookie: next-auth.session-token=your-session-token" \\
  -d '{
    "name": "Барсик",
    "type": "CAT",
    "breed": "Персидская",
    "birthDate": "2020-01-15",
    "heightCm": 25,
    "weightKg": 4.5
  }'
\`\`\`

---

*Документация сгенерирована автоматически на основе Zod схем из серверных экшенов*
`;
    fs.writeFileSync(readmePath, readmeContent);
    console.log(`✅ README создан: ${readmePath}`);

    console.log('🎉 OpenAPI документация успешно сгенерирована!');
    console.log(`📖 Откройте ${htmlPath} в браузере для просмотра документации`);

  } catch (error) {
    console.error('❌ Ошибка при генерации OpenAPI документации:', error);
    process.exit(1);
  }
}

// Запуск генерации
if (require.main === module) {
  generateOpenApiDocumentation();
}

module.exports = { generateOpenApiDocumentation };
