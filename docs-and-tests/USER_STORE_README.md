# User Store Documentation

## Описание

Централизованное управление данными пользователя с использованием Zustand. Заменяет разрозненные хуки и состояния пользователя.

## Основные возможности

### Автоматическое управление данными

- Автоматическая загрузка профиля при инициализации
- Кэширование данных на 5 минут
- Автоматическое обновление истекших данных
- Сохранение настроек в localStorage для персистентности

### API

```typescript
const {
  // Данные пользователя
  user, // User | null - текущий пользователь
  profile, // UserProfile | null - профиль пользователя
  preferences, // UserPreferences - настройки пользователя

  // Состояние загрузки
  isLoading, // boolean - загрузка профиля
  isUpdating, // boolean - обновление профиля
  isUpdatingPreferences, // boolean - обновление настроек

  // Ошибки
  error, // string | null - общая ошибка
  profileError, // string | null - ошибка профиля
  preferencesError, // string | null - ошибка настроек

  // Действия
  setUser, // (user: User | null) => void
  setProfile, // (profile: UserProfile | null) => void
  setPreferences, // (preferences: Partial<UserPreferences>) => void

  // Загрузка данных
  fetchProfile, // () => Promise<void> - загрузить профиль
  fetchPreferences, // () => Promise<void> - загрузить настройки

  // Обновление данных
  updateProfile, // (data: UpdateUserProfileInput) => Promise<void>
  updatePreferences, // (prefs: Partial<UserPreferences>) => Promise<void>

  // Очистка
  clearUser, // () => void - очистить все данные
  clearError, // () => void - очистить ошибки

  // Утилиты
  isProfileLoaded, // () => boolean - проверка загрузки профиля
  isPreferencesLoaded, // () => boolean - проверка загрузки настроек
  hasProfile, // () => boolean - есть ли профиль
  getUserDisplayName, // () => string - отображаемое имя
} = useUserStore();
```

### Дополнительные хуки

```typescript
// Хук для инициализации данных
useUserInitializer();

// Хук для получения данных пользователя
const { user, profile, isLoading, error, isAuthenticated } = useUserData();

// Хук для получения настроек
const { preferences, isUpdating, error } = useUserPreferences();
```

## Использование

### Базовое использование

```typescript
import { useUserStore } from '@/stores'

function MyComponent() {
  const { user, profile, isLoading, fetchProfile } = useUserStore()

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  if (isLoading) return <div>Загрузка...</div>

  return (
    <div>
      <h1>Привет, {user?.username}!</h1>
      {profile?.fullName && <p>{profile.fullName}</p>}
    </div>
  )
}
```

### Использование с автоматической загрузкой

```typescript
import { useUserData } from '@/stores'

function MyComponent() {
  const { user, profile, isLoading, isAuthenticated } = useUserData()

  if (!isAuthenticated) return <div>Войдите в систему</div>
  if (isLoading) return <div>Загрузка...</div>

  return (
    <div>
      <h1>Профиль: {profile?.fullName || user?.username}</h1>
    </div>
  )
}
```

### Работа с настройками

```typescript
import { useUserPreferences } from '@/stores'

function SettingsComponent() {
  const { preferences, isUpdating, updatePreferences } = useUserPreferences()

  const handleToggleSound = async () => {
    await updatePreferences({
      sound: {
        ...preferences.sound,
        enabled: !preferences.sound.enabled
      }
    })
  }

  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={preferences.sound.enabled}
          onChange={handleToggleSound}
          disabled={isUpdating}
        />
        Включить звук
      </label>
    </div>
  )
}
```

## Структура данных

### User

```typescript
interface User {
  id: string;
  username: string;
  phone: string;
  role: "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM";
  isConfirmed: boolean;
  avatarUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### UserProfile

```typescript
interface UserProfile {
  id: string;
  userId: string;
  fullName: string | null;
  about: string | null;
  telegram: string | null;
  instagram: string | null;
  website: string | null;
  birthDate: Date | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### UserPreferences

```typescript
interface UserPreferences {
  notifications: {
    push: boolean;
    email: boolean;
    sms: boolean;
  };
  sound: {
    enabled: boolean;
    volume: number;
    trainingSounds: boolean;
    achievementSounds: boolean;
  };
  interface: {
    autoPlay: boolean;
    showProgress: boolean;
    showTips: boolean;
    compactMode: boolean;
  };
  privacy: {
    showProfile: boolean;
    showProgress: boolean;
    allowAnalytics: boolean;
  };
}
```

## Интеграция с NextAuth

Store автоматически интегрируется с NextAuth через `UserProvider`:

```typescript
// В layout.tsx
<UserProvider>
  <main>{children}</main>
</UserProvider>
```

## Кэширование

- **Профиль**: кэшируется на 5 минут
- **Настройки**: кэшируются на 24 часа
- **Персистентность**: настройки сохраняются в localStorage

## Обработка ошибок

Все ошибки автоматически логируются и отображаются пользователю:

```typescript
const { error, profileError, preferencesError } = useUserStore();

// Показать ошибку пользователю
if (error) {
  console.error("Ошибка пользователя:", error);
}
```

## Миграция с существующего кода

### Было:

```typescript
const { data: session } = useSession();
const [profile, setProfile] = useState(null);
const [loading, setLoading] = useState(false);

useEffect(() => {
  if (session?.user) {
    setLoading(true);
    getUserProfile()
      .then(setProfile)
      .finally(() => setLoading(false));
  }
}, [session]);
```

### Стало:

```typescript
const { user, profile, isLoading } = useUserData();
```

## Тестирование

```typescript
import { renderHook } from "@testing-library/react";
import { useUserStore } from "@/stores";

test("user store initial state", () => {
  const { result } = renderHook(() => useUserStore());

  expect(result.current.user).toBeNull();
  expect(result.current.profile).toBeNull();
  expect(result.current.isLoading).toBe(false);
});
```
