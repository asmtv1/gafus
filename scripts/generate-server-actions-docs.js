#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Генератор документации для серверных экшенов Next.js
 */

// Документация серверных экшенов
const serverActionsDocumentation = {
  title: "Gafus Server Actions Documentation",
  version: "1.0.0",
  description: "Документация серверных экшенов Next.js для платформы тренировок с питомцами",
  generatedFrom: "Zod схемы валидации из серверных экшенов",
  
  serverActions: {
    // ===== АУТЕНТИФИКАЦИЯ =====
    auth: {
      checkUserStateAction: {
        file: "apps/web/src/shared/lib/actions/checkUserState.ts",
        description: "Проверка статуса подтверждения пользователя",
        input: {
          username: {
            type: "string",
            validation: "z.string().trim().min(1).max(100).transform(value => value.toLowerCase())",
            description: "Имя пользователя для проверки",
            example: "john_doe"
          }
        },
        output: {
          type: "object",
          properties: {
            confirmed: { type: "boolean", example: true },
            phone: { type: "string", nullable: true, example: "+79123456789" }
          }
        },
        usage: `
// В компоненте React
import { checkUserStateAction } from '@shared/lib/actions/checkUserState';

const handleCheckUser = async (username: string) => {
  try {
    const result = await checkUserStateAction(username);
    console.log('User confirmed:', result.confirmed);
  } catch (error) {
    console.error('Error:', error.message);
  }
};`
      },

      registerUserAction: {
        file: "apps/web/src/shared/lib/auth/login-utils.ts",
        description: "Регистрация нового пользователя",
        input: {
          name: {
            type: "string",
            validation: "z.string().trim().min(3).max(50).regex(/^[A-Za-z0-9_]+$/)",
            description: "Имя пользователя (только английские буквы, цифры и _)",
            example: "john_doe"
          },
          phone: {
            type: "string",
            validation: "z.string().trim().min(1)",
            description: "Номер телефона в российском формате",
            example: "+79123456789"
          },
          password: {
            type: "string",
            validation: "z.string().trim().min(6).max(100).regex(/^[A-Za-z0-9]+$/)",
            description: "Пароль (только английские буквы и цифры)",
            example: "password123"
          }
        },
        output: {
          type: "object",
          description: "Результат регистрации",
          properties: {
            success: { type: "boolean", example: true },
            error: { type: "string", nullable: true, example: "Пользователь уже существует" }
          }
        },
        usage: `
// В форме регистрации
import { registerUserAction } from '@shared/lib/auth/login-utils';

const handleRegister = async (name: string, phone: string, password: string) => {
  try {
    const result = await registerUserAction(name, phone, password);
    if (result?.error) {
      console.error('Registration error:', result.error);
    } else {
      console.log('User registered successfully');
      // Перенаправить на страницу подтверждения
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
};`
      },

      sendPasswordResetRequest: {
        file: "apps/web/src/shared/lib/auth/login-utils.ts",
        description: "Запрос на сброс пароля через Telegram",
        input: {
          username: {
            type: "string",
            validation: "z.string().trim().min(3).max(50).regex(/^[A-Za-z0-9_]+$/)",
            description: "Имя пользователя",
            example: "john_doe"
          },
          phone: {
            type: "string",
            validation: "z.string().trim().min(1)",
            description: "Номер телефона",
            example: "+79123456789"
          }
        },
        output: {
          type: "object",
          description: "Результат запроса сброса пароля",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Запрос на сброс пароля отправлен" }
          }
        },
        usage: `
// В форме восстановления пароля
import { sendPasswordResetRequest } from '@shared/lib/auth/login-utils';

const handlePasswordReset = async (username: string, phone: string) => {
  try {
    const result = await sendPasswordResetRequest(username, phone);
    console.log('Password reset request sent:', result.message);
  } catch (error) {
    console.error('Error:', error.message);
  }
};`
      },

      resetPassword: {
        file: "apps/web/src/shared/lib/auth/login-utils.ts",
        description: "Сброс пароля по токену",
        input: {
          token: {
            type: "string",
            validation: "z.string().trim().min(1)",
            description: "Токен для сброса пароля",
            example: "reset-token-here"
          },
          password: {
            type: "string",
            validation: "z.string().trim().min(6).max(100).regex(/^[A-Za-z0-9]+$/)",
            description: "Новый пароль",
            example: "newpassword123"
          }
        },
        output: {
          type: "void",
          description: "Функция не возвращает значение, обновляет пароль в БД"
        },
        usage: `
// В форме сброса пароля
import resetPassword from '@shared/lib/auth/login-utils';

const handleResetPassword = async (token: string, newPassword: string) => {
  try {
    await resetPassword(token, newPassword);
    console.log('Password reset successfully');
    // Перенаправить на страницу входа
  } catch (error) {
    console.error('Error:', error.message);
  }
};`
      },

      serverCheckUserConfirmed: {
        file: "apps/web/src/shared/lib/auth/login-utils.ts",
        description: "Проверка подтверждения пользователя по телефону",
        input: {
          phone: {
            type: "string",
            validation: "z.string().trim().min(1)",
            description: "Номер телефона для проверки",
            example: "+79123456789"
          }
        },
        output: {
          type: "boolean",
          description: "true если пользователь подтвержден, false если нет",
          example: true
        },
        usage: `
// Проверка статуса по телефону
import { serverCheckUserConfirmed } from '@shared/lib/auth/login-utils';

const checkConfirmed = async (phone: string) => {
  try {
    const confirmed = await serverCheckUserConfirmed(phone);
    console.log('User confirmed:', confirmed);
  } catch (error) {
    console.error('Error:', error.message);
  }
};`
      }
    },

    // ===== ПИТОМЦЫ =====
    pets: {
      createPet: {
        file: "apps/web/src/shared/lib/pets/createPet.ts",
        description: "Создание нового питомца",
        input: {
          type: "object",
          schema: "createPetSchema",
          required: ["name", "type", "breed", "birthDate"],
          properties: {
            name: {
              type: "string",
              validation: "z.string().trim().min(2).max(50).regex(/^[а-яёА-ЯЁa-zA-Z\\s-]+$/)",
              description: "Имя питомца (только буквы, пробелы и дефис)",
              example: "Барсик"
            },
            type: {
              type: "string",
              validation: "z.nativeEnum(PetType)",
              enum: ["DOG", "CAT"],
              description: "Тип питомца",
              example: "CAT"
            },
            breed: {
              type: "string",
              validation: "z.string().trim().min(2).max(50)",
              description: "Порода питомца",
              example: "Персидская"
            },
            birthDate: {
              type: "string",
              validation: "z.string().trim().min(1) + дата валидация",
              format: "date",
              description: "Дата рождения питомца",
              example: "2020-01-15"
            },
            heightCm: {
              type: "number",
              validation: "numericField({ min: 1, max: 200 })",
              description: "Рост в сантиметрах",
              example: 25
            },
            weightKg: {
              type: "number",
              validation: "numericField({ min: 0.1, max: 200 })",
              description: "Вес в килограммах",
              example: 4.5
            },
            photoUrl: {
              type: "string",
              validation: "urlSchema",
              format: "uri",
              description: "URL фотографии питомца",
              example: "https://example.com/cat.jpg"
            },
            notes: {
              type: "string",
              validation: "z.string().trim().max(500)",
              description: "Заметки о питомце",
              example: "Очень ласковый кот"
            }
          }
        },
        output: {
          type: "object",
          description: "Созданный питомец с полной информацией",
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
        },
        usage: `
// В форме создания питомца
import { createPet } from '@shared/lib/pets/createPet';

const handleCreatePet = async (formData: CreatePetInput) => {
  try {
    const newPet = await createPet(formData);
    console.log('Pet created:', newPet);
    // Обновить UI, перенаправить и т.д.
  } catch (error) {
    console.error('Error creating pet:', error.message);
  }
};`
      },

      updatePet: {
        file: "apps/web/src/shared/lib/pets/updatePet.ts",
        description: "Обновление данных существующего питомца",
        input: {
          type: "object",
          schema: "updatePetSchema (basePetSchema.partial().extend({ id: required }))",
          required: ["id"],
          properties: {
            id: {
              type: "string",
              validation: "z.string().trim().min(1)",
              description: "ID питомца для обновления",
              example: "pet-uuid-here"
            },
            name: {
              type: "string",
              validation: "z.string().trim().min(2).max(50).regex(/^[а-яёА-ЯЁa-zA-Z\\s-]+$/)",
              description: "Имя питомца (только буквы, пробелы и дефис)",
              example: "Барсик",
              optional: true
            },
            type: {
              type: "string",
              validation: "z.nativeEnum(PetType)",
              enum: ["DOG", "CAT"],
              description: "Тип питомца",
              example: "CAT",
              optional: true
            },
            breed: {
              type: "string",
              validation: "z.string().trim().min(2).max(50)",
              description: "Порода питомца",
              example: "Персидская",
              optional: true
            },
            birthDate: {
              type: "string",
              validation: "z.string().trim().min(1) + дата валидация",
              format: "date",
              description: "Дата рождения питомца",
              example: "2020-01-15",
              optional: true
            },
            heightCm: {
              type: "number",
              validation: "numericField({ min: 1, max: 200 })",
              description: "Рост в сантиметрах",
              example: 25,
              optional: true
            },
            weightKg: {
              type: "number",
              validation: "numericField({ min: 0.1, max: 200 })",
              description: "Вес в килограммах",
              example: 4.5,
              optional: true
            },
            photoUrl: {
              type: "string",
              validation: "urlSchema",
              format: "uri",
              description: "URL фотографии питомца",
              example: "https://example.com/cat.jpg",
              optional: true
            },
            notes: {
              type: "string",
              validation: "z.string().trim().max(500).optional()",
              description: "Заметки о питомце",
              example: "Очень ласковый кот",
              optional: true
            }
          }
        },
        output: {
          type: "object",
          description: "Обновленный питомец",
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
        },
        usage: `
// В форме редактирования питомца
import { updatePet } from '@shared/lib/pets/updatePet';

const handleUpdatePet = async (petData: UpdatePetInput) => {
  try {
    const updatedPet = await updatePet(petData);
    console.log('Pet updated:', updatedPet);
  } catch (error) {
    console.error('Error updating pet:', error.message);
  }
};`
      },

      getUserPets: {
        file: "apps/web/src/shared/lib/pets/getUserPets.ts",
        description: "Получение списка всех питомцев текущего пользователя",
        input: {
          type: "none",
          description: "Не требует входных параметров - использует getCurrentUserId()"
        },
        output: {
          type: "array",
          description: "Список питомцев пользователя",
          items: {
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
        },
        usage: `
// В компоненте списка питомцев
import { getUserPets } from '@shared/lib/pets/getUserPets';

const PetList = () => {
  const [pets, setPets] = useState([]);
  
  useEffect(() => {
    const fetchPets = async () => {
      try {
        const petsList = await getUserPets();
        setPets(petsList);
      } catch (error) {
        console.error('Error fetching pets:', error);
      }
    };
    
    fetchPets();
  }, []);
  
  return (
    <div>
      {pets.map(pet => (
        <PetCard key={pet.id} pet={pet} />
      ))}
    </div>
  );
};`
      }
    },

    // ===== ТРЕНИРОВКИ =====
    training: {
      startUserStepServerAction: {
        file: "apps/web/src/shared/lib/training/startUserStepServerAction.ts",
        description: "Начало выполнения шага тренировки",
        input: {
          type: "object",
          schema: "startStepSchema",
          required: ["courseId", "day", "stepIndex", "status", "durationSec"],
          properties: {
            courseId: {
              type: "string",
              validation: "courseIdSchema",
              description: "ID курса",
              example: "course-uuid"
            },
            day: {
              type: "number",
              validation: "dayNumberSchema",
              minimum: 1,
              description: "Номер дня тренировки",
              example: 1
            },
            stepIndex: {
              type: "number",
              validation: "stepIndexSchema",
              minimum: 0,
              description: "Индекс шага (начиная с 0)",
              example: 0
            },
            status: {
              type: "string",
              validation: "TrainingStatus enum",
              enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "PAUSED"],
              description: "Статус шага",
              example: "IN_PROGRESS"
            },
            durationSec: {
              type: "number",
              validation: "z.number().min(0)",
              minimum: 0,
              description: "Продолжительность в секундах",
              example: 300
            }
          }
        },
        output: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true }
          }
        },
        usage: `
// В таймер сторе
import { startUserStepServerAction } from '@shared/lib/training/startUserStepServerAction';

const startStep = async (courseId: string, day: number, stepIndex: number, durationSec: number) => {
  try {
    await startUserStepServerAction(
      courseId,
      day,
      stepIndex,
      TrainingStatus.IN_PROGRESS,
      durationSec
    );
    console.log('Step started successfully');
  } catch (error) {
    console.error('Error starting step:', error.message);
  }
};`
      },

      pauseResumeUserStep: {
        file: "apps/web/src/shared/lib/training/pauseResumeUserStep.ts",
        description: "Пауза или возобновление шага тренировки",
        functions: {
          pauseUserStepServerAction: {
            input: {
              type: "object",
              schema: "pauseSchema",
              required: ["courseId", "day", "stepIndex", "timeLeftSec"],
              properties: {
                courseId: { type: "string", validation: "courseIdSchema" },
                day: { type: "number", validation: "dayNumberSchema" },
                stepIndex: { type: "number", validation: "stepIndexSchema" },
                timeLeftSec: {
                  type: "number",
                  validation: "z.number().min(0)",
                  description: "Оставшееся время в секундах",
                  example: 180
                }
              }
            }
          },
          resumeUserStepServerAction: {
            input: {
              type: "object",
              schema: "resumeSchema",
              required: ["courseId", "day", "stepIndex"],
              properties: {
                courseId: { type: "string", validation: "courseIdSchema" },
                day: { type: "number", validation: "dayNumberSchema" },
                stepIndex: { type: "number", validation: "stepIndexSchema" }
              }
            }
          }
        },
        output: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true }
          }
        },
        usage: `
// Пауза шага
import { pauseUserStepServerAction } from '@shared/lib/training/pauseResumeUserStep';

const pauseStep = async (courseId: string, day: number, stepIndex: number, timeLeft: number) => {
  try {
    await pauseUserStepServerAction(courseId, day, stepIndex, timeLeft);
    console.log('Step paused');
  } catch (error) {
    console.error('Error pausing step:', error.message);
  }
};

// Возобновление шага
import { resumeUserStepServerAction } from '@shared/lib/training/pauseResumeUserStep';

const resumeStep = async (courseId: string, day: number, stepIndex: number) => {
  try {
    await resumeUserStepServerAction(courseId, day, stepIndex);
    console.log('Step resumed');
  } catch (error) {
    console.error('Error resuming step:', error.message);
  }
};`
      }
    },

    // ===== КУРСЫ =====
    courses: {
      rateCourse: {
        file: "apps/web/src/shared/lib/course/rateCourse.ts",
        description: "Оценка курса пользователем",
        input: {
          type: "object",
          schema: "rateCourseSchema",
          required: ["courseId", "rating"],
          properties: {
            courseId: {
              type: "string",
              validation: "z.string().trim().min(1)",
              description: "ID курса",
              example: "course-uuid"
            },
            rating: {
              type: "number",
              validation: "z.number().min(1).max(5)",
              minimum: 1,
              maximum: 5,
              description: "Оценка от 1 до 5",
              example: 5
            }
          }
        },
        output: {
          type: "void",
          description: "Функция не возвращает значение, обновляет рейтинг в БД"
        },
        usage: `
// В компоненте рейтинга
import { rateCourse } from '@shared/lib/course/rateCourse';

const handleRateCourse = async (courseId: string, rating: number) => {
  try {
    await rateCourse(courseId, rating);
    console.log('Course rated successfully');
    // Обновить UI
  } catch (error) {
    console.error('Error rating course:', error.message);
  }
};`
      },

      toggleFavoriteCourse: {
        file: "apps/web/src/shared/lib/course/addtoFavorite.ts",
        description: "Добавление или удаление курса из избранного",
        input: {
          type: "string",
          validation: "z.string().trim().min(1)",
          description: "ID курса",
          example: "course-uuid"
        },
        output: {
          type: "boolean",
          description: "true если курс добавлен в избранное, false если удален",
          example: true
        },
        usage: `
// В компоненте курса
import { toggleFavoriteCourse } from '@shared/lib/course/addtoFavorite';

const handleToggleFavorite = async (courseId: string) => {
  try {
    const isFavorite = await toggleFavoriteCourse(courseId);
    console.log('Course favorite status:', isFavorite);
    // Обновить UI
  } catch (error) {
    console.error('Error toggling favorite:', error.message);
  }
};`
      }
    },

    // ===== ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ =====
    user: {
      updateUserProfile: {
        file: "apps/web/src/shared/lib/user/updateUserProfile.ts",
        description: "Обновление профиля пользователя",
        input: {
          type: "object",
          schema: "updateUserProfileSchema",
          properties: {
            fullName: {
              type: "string",
              validation: "z.string().trim().max(120)",
              maxLength: 120,
              description: "Полное имя",
              example: "Иван Иванов"
            },
            about: {
              type: "string",
              validation: "z.string().trim().max(2000)",
              maxLength: 2000,
              description: "О себе",
              example: "Люблю тренироваться с питомцами"
            },
            telegram: {
              type: "string",
              validation: "z.string().trim().max(100)",
              maxLength: 100,
              description: "Telegram username",
              example: "@ivan_ivanov"
            },
            instagram: {
              type: "string",
              validation: "z.string().trim().max(100)",
              maxLength: 100,
              description: "Instagram username",
              example: "ivan_ivanov"
            },
            website: {
              type: "string",
              validation: "z.string().trim().max(200)",
              maxLength: 200,
              description: "Веб-сайт",
              example: "https://ivan.com"
            },
            birthDate: {
              type: "string",
              validation: "z.string().trim().max(100)",
              maxLength: 100,
              description: "Дата рождения",
              example: "1990-01-01"
            }
          }
        },
        output: {
          type: "object",
          description: "Обновленный профиль пользователя",
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
        },
        usage: `
// В форме профиля
import { updateUserProfile } from '@shared/lib/user/updateUserProfile';

const handleUpdateProfile = async (profileData: UpdateUserProfileInput) => {
  try {
    const updatedProfile = await updateUserProfile(profileData);
    console.log('Profile updated:', updatedProfile);
    // Обновить UI
  } catch (error) {
    console.error('Error updating profile:', error.message);
  }
};`
      }
    },

    // ===== УВЕДОМЛЕНИЯ =====
    notifications: {
      updateSubscriptionAction: {
        file: "apps/web/src/shared/lib/actions/subscription.ts",
        description: "Обновление push-подписки пользователя",
        input: {
          type: "object",
          schema: "pushSubscriptionSchema",
          required: ["userId", "endpoint", "p256dh", "auth", "keys"],
          properties: {
            id: {
              type: "string",
              validation: "z.string().optional()",
              description: "ID подписки (опционально)"
            },
            userId: {
              type: "string",
              validation: "z.string().trim().min(1)",
              description: "ID пользователя",
              example: "user-uuid"
            },
            endpoint: {
              type: "string",
              validation: "z.string().trim().min(1)",
              description: "Push endpoint",
              example: "https://fcm.googleapis.com/fcm/send/..."
            },
            p256dh: {
              type: "string",
              validation: "z.string().trim().min(1)",
              description: "P256DH ключ"
            },
            auth: {
              type: "string",
              validation: "z.string().trim().min(1)",
              description: "Auth ключ"
            },
            keys: {
              type: "object",
              required: ["p256dh", "auth"],
              properties: {
                p256dh: { type: "string", validation: "z.string().trim().min(1)" },
                auth: { type: "string", validation: "z.string().trim().min(1)" }
              }
            }
          }
        },
        output: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true }
          }
        },
        usage: `
// В компоненте уведомлений
import { updateSubscriptionAction } from '@shared/lib/actions/subscription';

const handleSubscribeToNotifications = async (subscription: PushSubscription) => {
  try {
    const result = await updateSubscriptionAction({
      userId: currentUserId,
      endpoint: subscription.endpoint,
      p256dh: subscription.getKey('p256dh'),
      auth: subscription.getKey('auth'),
      keys: {
        p256dh: subscription.getKey('p256dh'),
        auth: subscription.getKey('auth')
      }
    });
    console.log('Subscription updated:', result);
  } catch (error) {
    console.error('Error updating subscription:', error.message);
  }
};`
      }
    }
  }
};

async function generateServerActionsDocumentation() {
  try {
    console.log('🚀 Генерация документации серверных экшенов...');

    // Создаем директорию для документации
    const docsDir = path.join(__dirname, '../docs/server-actions');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Генерируем JSON файл
    const jsonPath = path.join(docsDir, 'server-actions.json');
    fs.writeFileSync(jsonPath, JSON.stringify(serverActionsDocumentation, null, 2));
    console.log(`✅ JSON документация создана: ${jsonPath}`);

    // Генерируем Markdown документацию
    const mdPath = path.join(docsDir, 'README.md');
    const markdownContent = generateMarkdownDocumentation(serverActionsDocumentation);
    fs.writeFileSync(mdPath, markdownContent);
    console.log(`✅ Markdown документация создана: ${mdPath}`);

    // Генерируем HTML документацию
    const htmlPath = path.join(docsDir, 'index.html');
    const htmlContent = generateHTMLDocumentation(serverActionsDocumentation);
    fs.writeFileSync(htmlPath, htmlContent);
    console.log(`✅ HTML документация создана: ${htmlPath}`);

    console.log('🎉 Документация серверных экшенов успешно сгенерирована!');
    console.log(`📖 Откройте ${htmlPath} в браузере для просмотра документации`);

  } catch (error) {
    console.error('❌ Ошибка при генерации документации:', error);
    process.exit(1);
  }
}

function generateMarkdownDocumentation(doc) {
  return `# ${doc.title}

## Обзор

${doc.description}

**Сгенерировано из:** ${doc.generatedFrom}

## Серверные экшены

### 🔐 Аутентификация

#### checkUserStateAction
**Файл:** \`${doc.serverActions.auth.checkUserStateAction.file}\`
**Описание:** ${doc.serverActions.auth.checkUserStateAction.description}

**Входные параметры:**
- \`username\` (string) - ${doc.serverActions.auth.checkUserStateAction.input.username.description}
  - Валидация: \`${doc.serverActions.auth.checkUserStateAction.input.username.validation}\`
  - Пример: \`${doc.serverActions.auth.checkUserStateAction.input.username.example}\`

**Возвращаемое значение:**
\`\`\`typescript
{
  confirmed: boolean;
  phone: string | null;
}
\`\`\`

**Пример использования:**
\`\`\`typescript
${doc.serverActions.auth.checkUserStateAction.usage.trim()}
\`\`\`

### 🐕 Питомцы

#### createPet
**Файл:** \`${doc.serverActions.pets.createPet.file}\`
**Описание:** ${doc.serverActions.pets.createPet.description}

**Входные параметры:**
${Object.entries(doc.serverActions.pets.createPet.input.properties).map(([key, prop]) => 
  `- \`${key}\` (${prop.type}) - ${prop.description}
  - Валидация: \`${prop.validation}\`
  - Пример: \`${prop.example}\``
).join('\n')}

**Возвращаемое значение:**
\`\`\`typescript
{
  id: string;
  name: string;
  type: "DOG" | "CAT";
  breed: string;
  birthDate: string;
  heightCm: number | null;
  weightKg: number | null;
  photoUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  awards: Array<{
    id: string;
    title: string;
    description: string | null;
    date: string;
  }>;
}
\`\`\`

**Пример использования:**
\`\`\`typescript
${doc.serverActions.pets.createPet.usage.trim()}
\`\`\`

#### updatePet
**Файл:** \`${doc.serverActions.pets.updatePet.file}\`
**Описание:** ${doc.serverActions.pets.updatePet.description}

**Входные параметры:**
- \`id\` (string, обязательный) - ${doc.serverActions.pets.updatePet.input.properties.id.description}
- Остальные поля опциональны (partial schema)

**Пример использования:**
\`\`\`typescript
${doc.serverActions.pets.updatePet.usage.trim()}
\`\`\`

#### getUserPets
**Файл:** \`${doc.serverActions.pets.getUserPets.file}\`
**Описание:** ${doc.serverActions.pets.getUserPets.description}

**Входные параметры:** Не требуются

**Возвращаемое значение:** Массив питомцев пользователя

**Пример использования:**
\`\`\`typescript
${doc.serverActions.pets.getUserPets.usage.trim()}
\`\`\`

### 🏃 Тренировки

#### startUserStepServerAction
**Файл:** \`${doc.serverActions.training.startUserStepServerAction.file}\`
**Описание:** ${doc.serverActions.training.startUserStepServerAction.description}

**Входные параметры:**
${Object.entries(doc.serverActions.training.startUserStepServerAction.input.properties).map(([key, prop]) => 
  `- \`${key}\` (${prop.type}) - ${prop.description}
  - Валидация: \`${prop.validation}\`
  - Пример: \`${prop.example}\``
).join('\n')}

**Пример использования:**
\`\`\`typescript
${doc.serverActions.training.startUserStepServerAction.usage.trim()}
\`\`\`

#### pauseResumeUserStep
**Файл:** \`${doc.serverActions.training.pauseResumeUserStep.file}\`
**Описание:** ${doc.serverActions.training.pauseResumeUserStep.description}

**Функции:**
- \`pauseUserStepServerAction\` - постановка на паузу
- \`resumeUserStepServerAction\` - возобновление

**Пример использования:**
\`\`\`typescript
${doc.serverActions.training.pauseResumeUserStep.usage.trim()}
\`\`\`

### 📚 Курсы

#### rateCourse
**Файл:** \`${doc.serverActions.courses.rateCourse.file}\`
**Описание:** ${doc.serverActions.courses.rateCourse.description}

**Входные параметры:**
- \`courseId\` (string) - ${doc.serverActions.courses.rateCourse.input.properties.courseId.description}
- \`rating\` (number) - ${doc.serverActions.courses.rateCourse.input.properties.rating.description}

**Пример использования:**
\`\`\`typescript
${doc.serverActions.courses.rateCourse.usage.trim()}
\`\`\`

#### toggleFavoriteCourse
**Файл:** \`${doc.serverActions.courses.toggleFavoriteCourse.file}\`
**Описание:** ${doc.serverActions.courses.toggleFavoriteCourse.description}

**Входные параметры:**
- \`courseId\` (string) - ${doc.serverActions.courses.toggleFavoriteCourse.input.description}

**Возвращаемое значение:** boolean - статус избранного

**Пример использования:**
\`\`\`typescript
${doc.serverActions.courses.toggleFavoriteCourse.usage.trim()}
\`\`\`

### 👤 Пользователь

#### updateUserProfile
**Файл:** \`${doc.serverActions.user.updateUserProfile.file}\`
**Описание:** ${doc.serverActions.user.updateUserProfile.description}

**Входные параметры:**
${Object.entries(doc.serverActions.user.updateUserProfile.input.properties).map(([key, prop]) => 
  `- \`${key}\` (${prop.type}) - ${prop.description}
  - Валидация: \`${prop.validation}\`
  - Пример: \`${prop.example}\``
).join('\n')}

**Пример использования:**
\`\`\`typescript
${doc.serverActions.user.updateUserProfile.usage.trim()}
\`\`\`

### 🔔 Уведомления

#### updateSubscriptionAction
**Файл:** \`${doc.serverActions.notifications.updateSubscriptionAction.file}\`
**Описание:** ${doc.serverActions.notifications.updateSubscriptionAction.description}

**Входные параметры:**
${Object.entries(doc.serverActions.notifications.updateSubscriptionAction.input.properties).map(([key, prop]) => 
  `- \`${key}\` (${prop.type}) - ${prop.description}
  - Валидация: \`${prop.validation}\`
  - Пример: \`${prop.example}\``
).join('\n')}

**Пример использования:**
\`\`\`typescript
${doc.serverActions.notifications.updateSubscriptionAction.usage.trim()}
\`\`\`

## Особенности серверных экшенов

1. **Валидация:** Все входные данные валидируются с помощью Zod схем
2. **Авторизация:** Используется \`getCurrentUserId()\` для получения текущего пользователя
3. **Обработка ошибок:** Стандартизированная обработка ошибок с логированием
4. **Транзакции:** Использование Prisma транзакций для консистентности данных
5. **Кэширование:** Инвалидация кэша React Query после изменений

## Генерация документации

Для обновления документации запустите:

\`\`\`bash
pnpm run generate:server-actions-docs
\`\`\`

---

*Документация сгенерирована автоматически на основе Zod схем из серверных экшенов*
`;
}

function generateHTMLDocumentation(doc) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${doc.title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f8f9fa;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    
    .header {
      background: linear-gradient(135deg, #2c3e50, #3498db);
      color: white;
      padding: 40px 20px;
      margin: -20px -20px 40px -20px;
      text-align: center;
    }
    
    .header h1 {
      font-size: 2.5rem;
      margin-bottom: 10px;
    }
    
    .header p {
      font-size: 1.2rem;
      opacity: 0.9;
    }
    
    .section {
      background: white;
      border-radius: 8px;
      padding: 30px;
      margin-bottom: 30px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    
    .section h2 {
      color: #2c3e50;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #3498db;
    }
    
    .action {
      background: #f8f9fa;
      border-radius: 6px;
      padding: 20px;
      margin-bottom: 20px;
      border-left: 4px solid #3498db;
    }
    
    .action h3 {
      color: #2c3e50;
      margin-bottom: 10px;
    }
    
    .action-meta {
      background: #e9ecef;
      padding: 10px;
      border-radius: 4px;
      margin-bottom: 15px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.9rem;
    }
    
    .params {
      margin: 15px 0;
    }
    
    .param {
      background: white;
      padding: 10px;
      margin: 5px 0;
      border-radius: 4px;
      border: 1px solid #dee2e6;
    }
    
    .param-name {
      font-weight: bold;
      color: #495057;
    }
    
    .param-type {
      color: #6c757d;
      font-size: 0.9rem;
    }
    
    .param-desc {
      margin-top: 5px;
      color: #6c757d;
    }
    
    .param-validation {
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.8rem;
      color: #dc3545;
      background: #f8d7da;
      padding: 5px;
      border-radius: 3px;
      margin-top: 5px;
    }
    
    .code-block {
      background: #2d3748;
      color: #e2e8f0;
      padding: 20px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 15px 0;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.9rem;
    }
    
    .tag {
      display: inline-block;
      background: #3498db;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.8rem;
      margin-right: 5px;
    }
    
    .tag.auth { background: #e74c3c; }
    .tag.pets { background: #27ae60; }
    .tag.training { background: #f39c12; }
    .tag.courses { background: #9b59b6; }
    .tag.user { background: #1abc9c; }
    .tag.notifications { background: #34495e; }
    
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-top: 30px;
    }
    
    .feature {
      background: white;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    
    .feature-icon {
      font-size: 2rem;
      margin-bottom: 10px;
    }
    
    .feature h3 {
      color: #2c3e50;
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${doc.title}</h1>
      <p>${doc.description}</p>
      <p><strong>Сгенерировано из:</strong> ${doc.generatedFrom}</p>
    </div>
    
    <div class="features">
      <div class="feature">
        <div class="feature-icon">🔐</div>
        <h3>Аутентификация</h3>
        <p>Проверка статуса пользователей</p>
      </div>
      <div class="feature">
        <div class="feature-icon">🐕</div>
        <h3>Питомцы</h3>
        <p>Управление питомцами пользователей</p>
      </div>
      <div class="feature">
        <div class="feature-icon">🏃</div>
        <h3>Тренировки</h3>
        <p>Управление тренировочными сессиями</p>
      </div>
      <div class="feature">
        <div class="feature-icon">📚</div>
        <h3>Курсы</h3>
        <p>Оценка и избранные курсы</p>
      </div>
      <div class="feature">
        <div class="feature-icon">👤</div>
        <h3>Пользователь</h3>
        <p>Управление профилем</p>
      </div>
      <div class="feature">
        <div class="feature-icon">🔔</div>
        <h3>Уведомления</h3>
        <p>Push-подписки</p>
      </div>
    </div>
    
    ${Object.entries(doc.serverActions).map(([category, actions]) => `
      <div class="section">
        <h2>${getCategoryTitle(category)}</h2>
        ${Object.entries(actions).map(([actionName, action]) => `
          <div class="action">
            <h3>${actionName}</h3>
            <div class="action-meta">
              <strong>Файл:</strong> ${action.file}<br>
              <strong>Описание:</strong> ${action.description}
            </div>
            
            ${action.input && action.input.type !== 'none' ? `
              <div class="params">
                <h4>Входные параметры:</h4>
                ${action.input.properties ? Object.entries(action.input.properties).map(([paramName, param]) => `
                  <div class="param">
                    <div class="param-name">${paramName}${param.optional ? ' (опционально)' : ''}</div>
                    <div class="param-type">${param.type}${param.validation ? ` - ${param.validation}` : ''}</div>
                    <div class="param-desc">${param.description}</div>
                    ${param.example ? `<div class="param-validation">Пример: ${param.example}</div>` : ''}
                  </div>
                `).join('') : `
                  <div class="param">
                    <div class="param-name">${action.input.description}</div>
                  </div>
                `}
              </div>
            ` : ''}
            
            ${action.output ? `
              <div class="params">
                <h4>Возвращаемое значение:</h4>
                <div class="code-block">${JSON.stringify(action.output, null, 2)}</div>
              </div>
            ` : ''}
            
            ${action.usage ? `
              <div class="params">
                <h4>Пример использования:</h4>
                <div class="code-block">${action.usage.trim()}</div>
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `).join('')}
    
    <div class="section">
      <h2>Особенности серверных экшенов</h2>
      <ul>
        <li><strong>Валидация:</strong> Все входные данные валидируются с помощью Zod схем</li>
        <li><strong>Авторизация:</strong> Используется <code>getCurrentUserId()</code> для получения текущего пользователя</li>
        <li><strong>Обработка ошибок:</strong> Стандартизированная обработка ошибок с логированием</li>
        <li><strong>Транзакции:</strong> Использование Prisma транзакций для консистентности данных</li>
        <li><strong>Кэширование:</strong> Инвалидация кэша React Query после изменений</li>
      </ul>
    </div>
  </div>
</body>
</html>`;
}

function getCategoryTitle(category) {
  const titles = {
    auth: '🔐 Аутентификация',
    pets: '🐕 Питомцы',
    training: '🏃 Тренировки',
    courses: '📚 Курсы',
    user: '👤 Пользователь',
    notifications: '🔔 Уведомления'
  };
  return titles[category] || category;
}

// Запуск генерации
if (require.main === module) {
  generateServerActionsDocumentation();
}

module.exports = { generateServerActionsDocumentation };
