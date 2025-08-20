# Сетка курсов - Grid Layout

## 🎯 **Цель**

Создать адаптивную сетку курсов, чтобы несколько карточек помещались в ширину экрана, вместо растягивания одной карточки на всю ширину.

## 📋 **Реализованные изменения**

### 1. **CSS Grid для страниц курсов**

**Создали CSS модули:**

- `apps/web/src/app/(main)/courses/page.module.css`
- `apps/web/src/app/(main)/favorites/page.module.css`

**Основные стили:**

```css
.coursesGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
  list-style: none;
  padding: 0;
  margin: 0;
}
```

### 2. **Адаптивность**

**Desktop (1200px+):**

- 3-4 карточки в ряд
- Минимальная ширина карточки: 350px

**Tablet (769px - 1024px):**

- 2-3 карточки в ряд
- Минимальная ширина карточки: 300px

**Mobile (до 768px):**

- 1 карточка в ряд
- Уменьшенные отступы

### 3. **Обновленные компоненты**

**CoursesClient:**

```tsx
<ul className={styles.coursesGrid}>
  {courses.map((course, index) => (
    <CourseCard key={course.id} {...courseCardProps} />
  ))}
</ul>
```

**FavoritesCourseList:**

```tsx
<ul className={styles.coursesGrid}>
  {courses.map((course) => (
    <CourseCard key={course.id} {...course} />
  ))}
</ul>
```

### 4. **Улучшенная стилизация CourseCard**

**Добавили flexbox для равной высоты:**

```css
.card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.description {
  flex: 1;
}

.author {
  margin-top: auto;
}
```

## 🎨 **Визуальные улучшения**

### **До изменений:**

- Карточки растягивались на всю ширину
- Неэффективное использование пространства
- Плохая адаптивность

### **После изменений:**

- ✅ Адаптивная сетка (3-4 карточки на desktop)
- ✅ Равная высота карточек
- ✅ Оптимальное использование пространства
- ✅ Responsive дизайн для всех устройств

## 📱 **Адаптивность**

### **Desktop (1200px+)**

```css
grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
```

### **Tablet (769px - 1024px)**

```css
grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
```

### **Mobile (до 768px)**

```css
grid-template-columns: 1fr;
gap: 15px;
```

## 🔧 **Технические детали**

### **CSS Grid свойства:**

- `display: grid` - создает сетку
- `grid-template-columns: repeat(auto-fill, minmax(350px, 1fr))` - автоматически заполняет колонки
- `gap: 20px` - отступы между карточками
- `minmax(350px, 1fr)` - минимальная ширина 350px, максимальная - доступное пространство

### **Flexbox для карточек:**

- `height: 100%` - карточки занимают всю высоту ячейки
- `display: flex; flex-direction: column` - вертикальное расположение элементов
- `flex: 1` - контент растягивается на доступное пространство
- `margin-top: auto` - автор прижимается к низу

## 📊 **Результаты**

### **Улучшения UX:**

- ✅ Лучшее использование экранного пространства
- ✅ Более удобный просмотр курсов
- ✅ Адаптивность для всех устройств
- ✅ Визуальная консистентность

### **Технические улучшения:**

- ✅ CSS Grid для современной сетки
- ✅ Flexbox для равной высоты карточек
- ✅ CSS модули для изоляции стилей
- ✅ Responsive дизайн

## 🚀 **Следующие шаги**

1. **Добавить анимации при наведении**
2. **Реализовать фильтрацию курсов**
3. **Добавить сортировку**
4. **Оптимизировать загрузку изображений**
5. **Добавить lazy loading для карточек**

## 📚 **Полезные ссылки**

- [CSS Grid Guide](https://css-tricks.com/snippets/css/complete-guide-grid/)
- [Flexbox Guide](https://css-tricks.com/snippets/css/a-guide-to-flexbox/)
- [Responsive Design](https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Responsive_Design)
