# Исправление проблем с гидратацией - Hydration Fix

## 🚨 **Проблема**

Ошибка гидратации в Next.js:

```
Error: Hydration failed because the server rendered text didn't match the client.
```

Это происходит, когда серверный и клиентский рендеринг возвращают разные значения.

## 🔍 **Причины проблемы**

### **Основные причины:**

1. **Функции, зависящие от времени** - `Date.now()`, `Math.random()`
2. **Браузерные API** - `window`, `navigator`, `localStorage`
3. **Разные состояния на сервере и клиенте**
4. **Условная логика с `typeof window !== 'undefined'`**

### **Проблемные компоненты:**

- `CSRFStatus` - `isTokenValid()` использует `Date.now()`
- `NotificationStatus` - `isSupported()`, `isGranted()`, `canRequest()`
- `CSRFTest` - `isTokenValid()`, `getTokenAge()`
- `Profile/NotificationStatus` - `isSupported()`, `isGranted()`

## ✅ **Решение**

### **1. Добавление проверки монтирования**

Используем `useState` и `useEffect` для отслеживания монтирования компонента:

```tsx
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);
```

### **2. Условный рендеринг**

Показываем клиентские значения только после монтирования:

```tsx
// ❌ Проблемный код
<div>Valid: {isTokenValid() ? 'true' : 'false'}</div>

// ✅ Исправленный код
<div>Valid: {mounted && isTokenValid() ? 'true' : 'false'}</div>
```

## 🔧 **Исправленные компоненты**

### **1. CSRFStatus.tsx**

```tsx
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);

const isValid = mounted ? isTokenValid() : false;
```

### **2. NotificationStatus.tsx**

```tsx
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);

// Условный рендеринг кнопок
{
  mounted && <div className={styles.actions}>{/* кнопки */}</div>;
}
```

### **3. CSRFTest.tsx**

```tsx
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);

// Условный рендеринг
{
  mounted && getTokenAge() && <div>Age: {Math.round(getTokenAge()! / 1000)}s</div>;
}
```

### **4. Profile/NotificationStatus.tsx**

```tsx
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);

// Условная проверка поддержки
if (mounted && !isSupported()) {
  return <div>Браузер не поддерживает уведомления</div>;
}
```

## 📋 **Паттерн решения**

### **Шаг 1: Добавить состояние монтирования**

```tsx
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);
```

### **Шаг 2: Условный рендеринг**

```tsx
// Для значений, зависящих от браузера
{
  value: mounted ? clientValue : defaultValue;
}

// Для условных блоков
{
  mounted && <div>{/* клиентский контент */}</div>;
}
```

### **Шаг 3: Условные проверки**

```tsx
// Для функций, зависящих от браузера
if (mounted && !isSupported()) {
  return <div>Не поддерживается</div>;
}
```

## 🎯 **Ключевые принципы**

### **1. Серверный рендеринг**

- Всегда возвращаем стабильные значения
- Не используем браузерные API
- Не вызываем функции с переменными результатами

### **2. Клиентский рендеринг**

- Показываем реальные значения только после монтирования
- Используем `mounted` флаг для условного рендеринга
- Обрабатываем браузерные API безопасно

### **3. Плавный переход**

- Начинаем с безопасных значений по умолчанию
- Переходим к реальным значениям после монтирования
- Избегаем мерцания и прыжков контента

## 🚀 **Результаты**

### **До исправления:**

- ❌ Ошибки гидратации
- ❌ Несоответствие сервер/клиент
- ❌ Проблемы с рендерингом

### **После исправления:**

- ✅ Успешная гидратация
- ✅ Стабильный рендеринг
- ✅ Корректная работа SSR
- ✅ Плавные переходы

## 📚 **Полезные ссылки**

- [Next.js Hydration Error](https://nextjs.org/docs/messages/react-hydration-error)
- [React Hydration Mismatch](https://react.dev/link/hydration-mismatch)
- [SSR vs CSR](https://nextjs.org/docs/app/building-your-application/rendering)

## 🔍 **Проверка исправлений**

### **Команды для проверки:**

```bash
# Проверка типов
npm run typecheck

# Сборка проекта
npm run build

# Запуск в режиме разработки
npm run dev
```

### **Что проверять:**

1. ✅ Нет ошибок гидратации в консоли
2. ✅ Стабильный рендеринг компонентов
3. ✅ Корректная работа SSR
4. ✅ Плавные переходы между состояниями
