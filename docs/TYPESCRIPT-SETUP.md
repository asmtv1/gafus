# 🎯 Настройка TypeScript для локальной разработки

## 📋 Проблема

Раньше локальные настройки TypeScript отличались от настроек CI/CD, что приводило к тому, что ошибки типизации обнаруживались только при сборке на Git, а не локально.

## ✅ Решение

Созданы скрипты и настройки, которые обеспечивают **100% идентичность** локальных проверок типов с CI процессом.

## 🚀 Команды для проверки типов

### 1. **Проверка типов как в CI** (рекомендуется)
```bash
pnpm typecheck:ci
```
Запускает **точно те же команды**, что и в `.github/workflows/ci-cd.yml`

### 2. **Быстрая проверка типов**
```bash
pnpm typecheck
```
Проверяет типы всех пакетов и приложений

### 3. **Проверка типов всех пакетов**
```bash
pnpm typecheck:all
```

## 🔧 Автоматическая проверка

### Git Hook (pre-commit)
При каждом коммите автоматически запускается проверка типов. Если есть ошибки - коммит отменяется.

### Ручная проверка перед коммитом
```bash
./scripts/pre-commit-typecheck.sh
```

## 📁 Структура файлов

```
scripts/
├── typecheck-local.sh          # Основной скрипт проверки (как в CI)
└── pre-commit-typecheck.sh     # Скрипт для pre-commit

.git/hooks/
└── pre-commit                  # Git hook для автоматической проверки

docs/
└── TYPESCRIPT-SETUP.md         # Эта документация
```

## 🎯 Что проверяется

### Приложения (apps):
- ✅ `apps/web` - `pnpm typecheck`
- ✅ `apps/trainer-panel` - `pnpm typecheck`  
- ✅ `apps/error-dashboard` - `pnpm typecheck`

### Пакеты (packages):
- ✅ Все 15 пакетов - `pnpm -r run typecheck`

## 🔍 Настройки TypeScript

### Базовые настройки (`tsconfig.base.json`):
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,        // ← Ключевая настройка!
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

### Приложения наследуют базовые настройки:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "strict": true,               // ← Дополнительно ужесточает
    "noEmit": true               // ← Для Next.js приложений
  }
}
```

## 💡 Рекомендации по использованию

### 1. **Перед коммитом всегда запускайте:**
```bash
pnpm typecheck:ci
```

### 2. **При разработке используйте:**
```bash
pnpm typecheck
```

### 3. **Если что-то не работает локально:**
```bash
# Очистите кэш
pnpm clean:all

# Переустановите зависимости
pnpm install

# Проверьте типы
pnpm typecheck:ci
```

## 🚨 Типичные ошибки и их решения

### Ошибка: `Parameter 'x' implicitly has an 'any' type`
**Решение:** Добавьте явный тип для параметра:
```typescript
// ❌ Плохо
items.map((item) => item.id)

// ✅ Хорошо  
items.map((item: { id: string }) => item.id)
```

### Ошибка: `Property 'x' does not exist on type 'y'`
**Решение:** Проверьте типы и добавьте недостающие свойства:
```typescript
// ❌ Плохо
const user = users.find((u) => u.id === id)

// ✅ Хорошо
const user = users.find((u: { id: string; name: string }) => u.id === id)
```

## 🎉 Результат

Теперь **все ошибки TypeScript** будут обнаружены **локально** при запуске `pnpm typecheck:ci`, точно так же, как они обнаруживаются в CI/CD на Git.

**Больше никаких сюрпризов при пуше!** 🎯
