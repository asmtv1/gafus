# Bundle Optimization для приложения Гафус

## 🎯 **Цель оптимизации**

Уменьшить размер JavaScript бандла для улучшения производительности загрузки страниц.

## 📊 **Текущие размеры (до оптимизации)**

- **Shared chunks**: 103 kB
- **Profile page**: 204 kB ⚠️ (очень большой!)
- **Trainings page**: 144 kB
- **Middleware**: 60.2 kB

## 🚀 **Реализованные оптимизации**

### 1. **Tree Shaking для MUI**

- Создан `utils/muiImports.ts` с оптимизированными импортами
- Заменены импорты `@mui/material` на конкретные компоненты
- Удалены неиспользуемые иконки и компоненты

### 2. **Code Splitting**

- Динамические импорты для тяжелых компонентов
- Lazy loading для форм и модальных окон
- Разделение vendor и app кода

### 3. **Webpack оптимизации**

- Bundle splitting для MUI, React, Next.js
- Оптимизация cache groups с приоритетами
- Tree shaking для production сборки
- Установлены размеры чанков (minSize: 20KB, maxSize: 244KB)

### 4. **Dynamic Imports**

```tsx
// Вместо статического импорта
import PetList from "@/components/Profile/PetList";

// Используем динамический импорт
const DynamicPetList = dynamic(() => import("@/components/Profile/PetList"), {
  loading: () => <div>Загрузка...</div>,
  ssr: false,
});
```

### 5. **Оптимизация изображений**

- Поддержка WebP и AVIF форматов
- Responsive images с deviceSizes
- Оптимизированный кэш изображений
- Lazy loading для изображений ниже fold

## 📈 **Ожидаемые результаты**

### До оптимизации:

- Profile page: 204 kB
- Shared chunks: 103 kB
- Общий размер: ~400 kB

### После оптимизации:

- Profile page: ~120 kB (-40%)
- Shared chunks: ~60 kB (-40%)
- Общий размер: ~250 kB (-35%)

## 🛠️ **Инструменты для анализа**

### Bundle Analyzer

```bash
npm run analyze
```

### Анализ размера

```bash
npm run analyze:build
```

## 📋 **Чек-лист оптимизации**

### ✅ Выполнено:

- [x] Tree shaking для MUI
- [x] Code splitting для тяжелых компонентов
- [x] Webpack оптимизации с приоритетами
- [x] Dynamic imports для всех тяжелых компонентов
- [x] Bundle analyzer
- [x] Оптимизация изображений
- [x] Утилита для оптимизации импортов

### 🔄 В процессе:

- [ ] Замена всех импортов MUI на оптимизированные
- [ ] Удаление неиспользуемых зависимостей
- [ ] Оптимизация middleware

### 📝 Планируется:

- [ ] WebP конвертация изображений
- [ ] Service Worker оптимизации
- [ ] Preload критических ресурсов

## 🎯 **Метрики для отслеживания**

1. **First Load JS** - должно уменьшиться на 30-40%
2. **LCP (Largest Contentful Paint)** - улучшение на 20-30%
3. **FID (First Input Delay)** - стабильность
4. **CLS (Cumulative Layout Shift)** - улучшение

## 🔧 **Команды для разработки**

```bash
# Анализ бандла
npm run analyze

# Сборка с анализом
npm run analyze:build

# Проверка типов
npm run typecheck

# Линтинг
npm run lint
```

## 📊 **Мониторинг производительности**

### Core Web Vitals цели:

- **LCP**: < 2.5s
- **FID**: < 100ms
- **CLS**: < 0.1

### Bundle размеры цели:

- **First Load JS**: < 200KB
- **Shared chunks**: < 80KB
- **Individual pages**: < 150KB

## 🚨 **Критические проблемы для исправления**

1. **Profile page 204KB** - слишком большой
2. **Statistics page 400KB** - критично большой
3. **Middleware 60KB** - можно оптимизировать
4. **Отсутствие tree shaking** в некоторых компонентах

## 📝 **План действий**

### Этап 1 (1 неделя): Критические исправления

- [ ] Заменить все импорты MUI на оптимизированные
- [ ] Добавить dynamic imports для тяжелых страниц
- [ ] Оптимизировать Profile и Statistics страницы

### Этап 2 (1 неделя): Дополнительные оптимизации

- [ ] Удалить неиспользуемые зависимости
- [ ] Оптимизировать middleware
- [ ] Добавить preload для критических ресурсов

### Этап 3 (1 неделя): Мониторинг и улучшения

- [ ] Настроить мониторинг Core Web Vitals
- [ ] Оптимизировать изображения
- [ ] Добавить Service Worker кэширование
