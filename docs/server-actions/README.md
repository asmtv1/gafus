# Gafus Server Actions Documentation

## Обзор

Документация серверных экшенов Next.js для платформы тренировок с питомцами

**Сгенерировано из:** Zod схемы валидации из серверных экшенов

## Серверные экшены

### 🔐 Аутентификация

#### checkUserStateAction
**Файл:** `apps/web/src/shared/lib/actions/checkUserState.ts`
**Описание:** Проверка статуса подтверждения пользователя

**Входные параметры:**
- `username` (string) - Имя пользователя для проверки
  - Валидация: `z.string().trim().min(1).max(100).transform(value => value.toLowerCase())`
  - Пример: `john_doe`

**Возвращаемое значение:**
```typescript
{
  confirmed: boolean;
  phone: string | null;
}
```

**Пример использования:**
```typescript
// В компоненте React
import { checkUserStateAction } from '@shared/lib/actions/checkUserState';

const handleCheckUser = async (username: string) => {
  try {
    const result = await checkUserStateAction(username);
    console.log('User confirmed:', result.confirmed);
  } catch (error) {
    console.error('Error:', error.message);
  }
};
```

### 🐕 Питомцы

#### createPet
**Файл:** `apps/web/src/shared/lib/pets/createPet.ts`
**Описание:** Создание нового питомца

**Входные параметры:**
- `name` (string) - Имя питомца (только буквы, пробелы и дефис)
  - Валидация: `z.string().trim().min(2).max(50).regex(/^[а-яёА-ЯЁa-zA-Z\s-]+$/)`
  - Пример: `Барсик`
- `type` (string) - Тип питомца
  - Валидация: `z.nativeEnum(PetType)`
  - Пример: `CAT`
- `breed` (string) - Порода питомца
  - Валидация: `z.string().trim().min(2).max(50)`
  - Пример: `Персидская`
- `birthDate` (string) - Дата рождения питомца
  - Валидация: `z.string().trim().min(1) + дата валидация`
  - Пример: `2020-01-15`
- `heightCm` (number) - Рост в сантиметрах
  - Валидация: `numericField({ min: 1, max: 200 })`
  - Пример: `25`
- `weightKg` (number) - Вес в килограммах
  - Валидация: `numericField({ min: 0.1, max: 200 })`
  - Пример: `4.5`
- `photoUrl` (string) - URL фотографии питомца
  - Валидация: `urlSchema`
  - Пример: `https://example.com/cat.jpg`
- `notes` (string) - Заметки о питомце
  - Валидация: `z.string().trim().max(500)`
  - Пример: `Очень ласковый кот`

**Возвращаемое значение:**
```typescript
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
```

**Пример использования:**
```typescript
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
};
```

#### updatePet
**Файл:** `apps/web/src/shared/lib/pets/updatePet.ts`
**Описание:** Обновление данных существующего питомца

**Входные параметры:**
- `id` (string, обязательный) - ID питомца для обновления
- Остальные поля опциональны (partial schema)

**Пример использования:**
```typescript
// В форме редактирования питомца
import { updatePet } from '@shared/lib/pets/updatePet';

const handleUpdatePet = async (petData: UpdatePetInput) => {
  try {
    const updatedPet = await updatePet(petData);
    console.log('Pet updated:', updatedPet);
  } catch (error) {
    console.error('Error updating pet:', error.message);
  }
};
```

#### getUserPets
**Файл:** `apps/web/src/shared/lib/pets/getUserPets.ts`
**Описание:** Получение списка всех питомцев текущего пользователя

**Входные параметры:** Не требуются

**Возвращаемое значение:** Массив питомцев пользователя

**Пример использования:**
```typescript
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
};
```

### 🏃 Тренировки

#### startUserStepServerAction
**Файл:** `apps/web/src/shared/lib/training/startUserStepServerAction.ts`
**Описание:** Начало выполнения шага тренировки

**Входные параметры:**
- `courseId` (string) - ID курса
  - Валидация: `courseIdSchema`
  - Пример: `course-uuid`
- `day` (number) - Номер дня тренировки
  - Валидация: `dayNumberSchema`
  - Пример: `1`
- `stepIndex` (number) - Индекс шага (начиная с 0)
  - Валидация: `stepIndexSchema`
  - Пример: `0`
- `status` (string) - Статус шага
  - Валидация: `TrainingStatus enum`
  - Пример: `IN_PROGRESS`
- `durationSec` (number) - Продолжительность в секундах
  - Валидация: `z.number().min(0)`
  - Пример: `300`

**Пример использования:**
```typescript
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
};
```

#### pauseResumeUserStep
**Файл:** `apps/web/src/shared/lib/training/pauseResumeUserStep.ts`
**Описание:** Пауза или возобновление шага тренировки

**Функции:**
- `pauseUserStepServerAction` - постановка на паузу
- `resumeUserStepServerAction` - возобновление

**Пример использования:**
```typescript
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
};
```

### 📚 Курсы

#### rateCourse
**Файл:** `apps/web/src/shared/lib/course/rateCourse.ts`
**Описание:** Оценка курса пользователем

**Входные параметры:**
- `courseId` (string) - ID курса
- `rating` (number) - Оценка от 1 до 5

**Пример использования:**
```typescript
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
};
```

#### toggleFavoriteCourse
**Файл:** `apps/web/src/shared/lib/course/addtoFavorite.ts`
**Описание:** Добавление или удаление курса из избранного

**Входные параметры:**
- `courseId` (string) - ID курса

**Возвращаемое значение:** boolean - статус избранного

**Пример использования:**
```typescript
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
};
```

### 👤 Пользователь

#### updateUserProfile
**Файл:** `apps/web/src/shared/lib/user/updateUserProfile.ts`
**Описание:** Обновление профиля пользователя

**Входные параметры:**
- `fullName` (string) - Полное имя
  - Валидация: `z.string().trim().max(120)`
  - Пример: `Иван Иванов`
- `about` (string) - О себе
  - Валидация: `z.string().trim().max(2000)`
  - Пример: `Люблю тренироваться с питомцами`
- `telegram` (string) - Telegram username
  - Валидация: `z.string().trim().max(100)`
  - Пример: `@ivan_ivanov`
- `instagram` (string) - Instagram username
  - Валидация: `z.string().trim().max(100)`
  - Пример: `ivan_ivanov`
- `website` (string) - Веб-сайт
  - Валидация: `z.string().trim().max(200)`
  - Пример: `https://ivan.com`
- `birthDate` (string) - Дата рождения
  - Валидация: `z.string().trim().max(100)`
  - Пример: `1990-01-01`

**Пример использования:**
```typescript
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
};
```

### 🔔 Уведомления

#### updateSubscriptionAction
**Файл:** `apps/web/src/shared/lib/actions/subscription.ts`
**Описание:** Обновление push-подписки пользователя

**Входные параметры:**
- `id` (string) - ID подписки (опционально)
  - Валидация: `z.string().optional()`
  - Пример: `undefined`
- `userId` (string) - ID пользователя
  - Валидация: `z.string().trim().min(1)`
  - Пример: `user-uuid`
- `endpoint` (string) - Push endpoint
  - Валидация: `z.string().trim().min(1)`
  - Пример: `https://fcm.googleapis.com/fcm/send/...`
- `p256dh` (string) - P256DH ключ
  - Валидация: `z.string().trim().min(1)`
  - Пример: `undefined`
- `auth` (string) - Auth ключ
  - Валидация: `z.string().trim().min(1)`
  - Пример: `undefined`
- `keys` (object) - undefined
  - Валидация: `undefined`
  - Пример: `undefined`

**Пример использования:**
```typescript
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
};
```

## Особенности серверных экшенов

1. **Валидация:** Все входные данные валидируются с помощью Zod схем
2. **Авторизация:** Используется `getCurrentUserId()` для получения текущего пользователя
3. **Обработка ошибок:** Стандартизированная обработка ошибок с логированием
4. **Транзакции:** Использование Prisma транзакций для консистентности данных
5. **Кэширование:** Инвалидация кэша React Query после изменений

## Генерация документации

Для обновления документации запустите:

```bash
pnpm run generate:server-actions-docs
```

---

*Документация сгенерирована автоматически на основе Zod схем из серверных экшенов*
