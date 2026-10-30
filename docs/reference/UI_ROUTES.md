# Реальные маршруты Web/Admin/Trainer/Mobile

> Сгенерировано 2026-10-29 из исходников. Обновить: `python3 scripts/docs/generate_reference.py`. Инвентаризация не равна PASS тестов. Значения секретов не читаются.

## Web Vite: активный switch в App.tsx

Источник: [`apps/web-vite/src/App.tsx`](../../apps/web-vite/src/App.tsx). Динамические пути и клиентские aliases требуют изучения исходника/браузерной проверки.

- `/`
- `/achievements`
- `/articles`
- `/courses`
- `/favorites`
- `/feed/hidden-authors`
- `/feed/notifications`
- `/gafus`
- `/gafus/guides`
- `/login`
- `/moments`
- `/moments/drafts`
- `/moments/new`
- `/moments/saved`
- `/otmazki`
- `/partner`
- `/passwordReset`
- `/pets`
- `/profile`
- `/profile/addPet`
- `/profile/albums`
- `/profile/change-email`
- `/profile/change-password`
- `/profile/change-username`
- `/profile/confirm-email`
- `/profile/delete-account`
- `/profile/editBio`
- `/profile/set-password`
- `/questions`
- `/questions/new`
- `/register`
- `/reminders`
- `/reset-password`
- `/subscription`
- `/vk-consent`

## Admin Panel: конфигурация разделов

Источник: [`apps/admin-panel/src/admin-live/routes.ts`](../../apps/admin-panel/src/admin-live/routes.ts). Реальные role-gates — API + route guards.

- `/main-panel/feed-moderation`
- `/main-panel/questions`
- `/main-panel/users`
- `/main-panel/mail`
- `/main-panel/media`
- `/main-panel/admin`
- `/main-panel/partners`
- `/main-panel/profit`
- `/main-panel/feature-flags`
- `/main-panel/broadcasts`
- `/main-panel/reengagement`
- `/main-panel/rewarded-ads`
- `/main-panel/gafus`
- `/main-panel/mobile-intro`
- `/main-panel/app-subscriptions`
- `/main-panel/consultations`
- `/main-panel/consultations/bookings`
- `/main-panel/consultations/trainers-schedules`

## Trainer Panel: навигация live-приложения

Источник: [`apps/trainer-panel/src/trainer-vite/live/LiveTrainerApp.tsx`](../../apps/trainer-panel/src/trainer-vite/live/LiveTrainerApp.tsx). Файл routes.ts содержит дополнительные preview/legacy patterns; он **не доказательство** активного live route.

| Название | URL |
|---|---|
| Статистика | `/main-panel/statistics` |
| Шаги | `/main-panel/steps` |
| Дни | `/main-panel/days` |
| Курс дня | `/main-panel/daily-course` |
| Шаги курса дня | `/main-panel/daily-course/steps?orderBy=createdAt&order=desc&rowsPerPage=25` |
| Статистика курса дня | `/main-panel/daily-course/statistics` |
| Связки курса дня | `/main-panel/daily-course/bundles` |
| Мои видео | `/main-panel/my-videos` |
| Экзамены на проверке | `/main-panel/exam-results?hideCompleted=true` |
| Все экзамены | `/main-panel/exam-results?hideCompleted=false` |
| Статьи | `/main-panel/articles` |
| Заметки | `/main-panel/notes` |
| Частые вопросы | `/main-panel/faq` |
| Консультации | `/main-panel/consultations` |
| Создать шаг | `/main-panel/steps/new` |
| Создать день | `/main-panel/days/new` |
| Создать курс | `/main-panel/courses/new` |
| Создать статью | `/main-panel/articles/new` |

## Expo Router: Mobile файловая маршрутизация

Источник: [`apps/mobile/app`](../../apps/mobile/app). Параметры вида [id] — динамические. Имена групп в скобках не являются частью URL.

- `/intro` — [`apps/mobile/app/(auth)/intro.tsx`](../../apps/mobile/app/%28auth%29/intro.tsx)
- `/login` — [`apps/mobile/app/(auth)/login.tsx`](../../apps/mobile/app/%28auth%29/login.tsx)
- `/register` — [`apps/mobile/app/(auth)/register.tsx`](../../apps/mobile/app/%28auth%29/register.tsx)
- `/reset-password` — [`apps/mobile/app/(auth)/reset-password.tsx`](../../apps/mobile/app/%28auth%29/reset-password.tsx)
- `/vk-consent` — [`apps/mobile/app/(auth)/vk-consent.tsx`](../../apps/mobile/app/%28auth%29/vk-consent.tsx)
- `/vk-set-phone` — [`apps/mobile/app/(auth)/vk-set-phone.tsx`](../../apps/mobile/app/%28auth%29/vk-set-phone.tsx)
- `/welcome` — [`apps/mobile/app/(auth)/welcome.tsx`](../../apps/mobile/app/%28auth%29/welcome.tsx)
- `/achievements` — [`apps/mobile/app/(main)/(tabs)/achievements.tsx`](../../apps/mobile/app/%28main%29/%28tabs%29/achievements.tsx)
- `/albums` — [`apps/mobile/app/(main)/(tabs)/albums.tsx`](../../apps/mobile/app/%28main%29/%28tabs%29/albums.tsx)
- `/articles` — [`apps/mobile/app/(main)/(tabs)/articles.tsx`](../../apps/mobile/app/%28main%29/%28tabs%29/articles.tsx)
- `/consultations` — [`apps/mobile/app/(main)/(tabs)/consultations.tsx`](../../apps/mobile/app/%28main%29/%28tabs%29/consultations.tsx)
- `/courses` — [`apps/mobile/app/(main)/(tabs)/courses.tsx`](../../apps/mobile/app/%28main%29/%28tabs%29/courses.tsx)
- `/cynologist-chat` — [`apps/mobile/app/(main)/(tabs)/cynologist-chat.tsx`](../../apps/mobile/app/%28main%29/%28tabs%29/cynologist-chat.tsx)
- `/cynologist-chats` — [`apps/mobile/app/(main)/(tabs)/cynologist-chats.tsx`](../../apps/mobile/app/%28main%29/%28tabs%29/cynologist-chats.tsx)
- `/feed` — [`apps/mobile/app/(main)/(tabs)/feed.tsx`](../../apps/mobile/app/%28main%29/%28tabs%29/feed.tsx)
- `/index` — [`apps/mobile/app/(main)/(tabs)/index.tsx`](../../apps/mobile/app/%28main%29/%28tabs%29/index.tsx)
- `/messages` — [`apps/mobile/app/(main)/(tabs)/messages.tsx`](../../apps/mobile/app/%28main%29/%28tabs%29/messages.tsx)
- `/more` — [`apps/mobile/app/(main)/(tabs)/more.tsx`](../../apps/mobile/app/%28main%29/%28tabs%29/more.tsx)
- `/pets` — [`apps/mobile/app/(main)/(tabs)/pets.tsx`](../../apps/mobile/app/%28main%29/%28tabs%29/pets.tsx)
- `/profile` — [`apps/mobile/app/(main)/(tabs)/profile.tsx`](../../apps/mobile/app/%28main%29/%28tabs%29/profile.tsx)
- `/questions` — [`apps/mobile/app/(main)/(tabs)/questions.tsx`](../../apps/mobile/app/%28main%29/%28tabs%29/questions.tsx)
- `/reminders` — [`apps/mobile/app/(main)/(tabs)/reminders.tsx`](../../apps/mobile/app/%28main%29/%28tabs%29/reminders.tsx)
- `/articles/[slug]` — [`apps/mobile/app/(main)/articles/[slug].tsx`](../../apps/mobile/app/%28main%29/articles/%5Bslug%5D.tsx)
- `/chats/[id]` — [`apps/mobile/app/(main)/chats/[id].tsx`](../../apps/mobile/app/%28main%29/chats/%5Bid%5D.tsx)
- `/chats/index` — [`apps/mobile/app/(main)/chats/index.tsx`](../../apps/mobile/app/%28main%29/chats/index.tsx)
- `/consultations/[userId]` — [`apps/mobile/app/(main)/consultations/[userId].tsx`](../../apps/mobile/app/%28main%29/consultations/%5BuserId%5D.tsx)
- `/consultations/booking-confirm` — [`apps/mobile/app/(main)/consultations/booking-confirm.tsx`](../../apps/mobile/app/%28main%29/consultations/booking-confirm.tsx)
- `/consultations/index` — [`apps/mobile/app/(main)/consultations/index.tsx`](../../apps/mobile/app/%28main%29/consultations/index.tsx)
- `/consultations/mine` — [`apps/mobile/app/(main)/consultations/mine.tsx`](../../apps/mobile/app/%28main%29/consultations/mine.tsx)
- `/consultations/trainer` — [`apps/mobile/app/(main)/consultations/trainer.tsx`](../../apps/mobile/app/%28main%29/consultations/trainer.tsx)
- `/cynologist-chats/[chatId]` — [`apps/mobile/app/(main)/cynologist-chats/[chatId].tsx`](../../apps/mobile/app/%28main%29/cynologist-chats/%5BchatId%5D.tsx)
- `/daily-course/[scheduleId]` — [`apps/mobile/app/(main)/daily-course/[scheduleId].tsx`](../../apps/mobile/app/%28main%29/daily-course/%5BscheduleId%5D.tsx)
- `/feed/[postId]` — [`apps/mobile/app/(main)/feed/[postId].tsx`](../../apps/mobile/app/%28main%29/feed/%5BpostId%5D.tsx)
- `/feed/create` — [`apps/mobile/app/(main)/feed/create.tsx`](../../apps/mobile/app/%28main%29/feed/create.tsx)
- `/feed/hidden-authors` — [`apps/mobile/app/(main)/feed/hidden-authors.tsx`](../../apps/mobile/app/%28main%29/feed/hidden-authors.tsx)
- `/feed/profile/[username]` — [`apps/mobile/app/(main)/feed/profile/[username].tsx`](../../apps/mobile/app/%28main%29/feed/profile/%5Busername%5D.tsx)
- `/feed/saved` — [`apps/mobile/app/(main)/feed/saved.tsx`](../../apps/mobile/app/%28main%29/feed/saved.tsx)
- `/gafus-guides` — [`apps/mobile/app/(main)/gafus-guides.tsx`](../../apps/mobile/app/%28main%29/gafus-guides.tsx)
- `/gafus` — [`apps/mobile/app/(main)/gafus.tsx`](../../apps/mobile/app/%28main%29/gafus.tsx)
- `/partner` — [`apps/mobile/app/(main)/partner.tsx`](../../apps/mobile/app/%28main%29/partner.tsx)
- `/pets/[petId]/vet-visits` — [`apps/mobile/app/(main)/pets/[petId]/vet-visits.tsx`](../../apps/mobile/app/%28main%29/pets/%5BpetId%5D/vet-visits.tsx)
- `/pets/add` — [`apps/mobile/app/(main)/pets/add.tsx`](../../apps/mobile/app/%28main%29/pets/add.tsx)
- `/pets/edit/[id]` — [`apps/mobile/app/(main)/pets/edit/[id].tsx`](../../apps/mobile/app/%28main%29/pets/edit/%5Bid%5D.tsx)
- `/profile/[username]` — [`apps/mobile/app/(main)/profile/[username].tsx`](../../apps/mobile/app/%28main%29/profile/%5Busername%5D.tsx)
- `/profile/albums/[albumId]` — [`apps/mobile/app/(main)/profile/albums/[albumId].tsx`](../../apps/mobile/app/%28main%29/profile/albums/%5BalbumId%5D.tsx)
- `/profile/albums/index` — [`apps/mobile/app/(main)/profile/albums/index.tsx`](../../apps/mobile/app/%28main%29/profile/albums/index.tsx)
- `/profile/change-email` — [`apps/mobile/app/(main)/profile/change-email.tsx`](../../apps/mobile/app/%28main%29/profile/change-email.tsx)
- `/profile/change-password` — [`apps/mobile/app/(main)/profile/change-password.tsx`](../../apps/mobile/app/%28main%29/profile/change-password.tsx)
- `/profile/change-username` — [`apps/mobile/app/(main)/profile/change-username.tsx`](../../apps/mobile/app/%28main%29/profile/change-username.tsx)
- `/profile/delete-account` — [`apps/mobile/app/(main)/profile/delete-account.tsx`](../../apps/mobile/app/%28main%29/profile/delete-account.tsx)
- `/profile/edit` — [`apps/mobile/app/(main)/profile/edit.tsx`](../../apps/mobile/app/%28main%29/profile/edit.tsx)
- `/profile/set-password` — [`apps/mobile/app/(main)/profile/set-password.tsx`](../../apps/mobile/app/%28main%29/profile/set-password.tsx)
- `/questions/[id]/edit` — [`apps/mobile/app/(main)/questions/[id]/edit.tsx`](../../apps/mobile/app/%28main%29/questions/%5Bid%5D/edit.tsx)
- `/questions/[id]/index` — [`apps/mobile/app/(main)/questions/[id]/index.tsx`](../../apps/mobile/app/%28main%29/questions/%5Bid%5D/index.tsx)
- `/questions/index` — [`apps/mobile/app/(main)/questions/index.tsx`](../../apps/mobile/app/%28main%29/questions/index.tsx)
- `/questions/new` — [`apps/mobile/app/(main)/questions/new.tsx`](../../apps/mobile/app/%28main%29/questions/new.tsx)
- `/reminders` — [`apps/mobile/app/(main)/reminders.tsx`](../../apps/mobile/app/%28main%29/reminders.tsx)
- `/training/[courseType]/[dayId]` — [`apps/mobile/app/(main)/training/[courseType]/[dayId].tsx`](../../apps/mobile/app/%28main%29/training/%5BcourseType%5D/%5BdayId%5D.tsx)
- `/training/[courseType]/index` — [`apps/mobile/app/(main)/training/[courseType]/index.tsx`](../../apps/mobile/app/%28main%29/training/%5BcourseType%5D/index.tsx)
- `/training/[courseType]/reviews` — [`apps/mobile/app/(main)/training/[courseType]/reviews.tsx`](../../apps/mobile/app/%28main%29/training/%5BcourseType%5D/reviews.tsx)
- `/trainings/[courseType]/[day]` — [`apps/mobile/app/(main)/trainings/[courseType]/[day].tsx`](../../apps/mobile/app/%28main%29/trainings/%5BcourseType%5D/%5Bday%5D.tsx)
- `/trainings/[courseType]/index` — [`apps/mobile/app/(main)/trainings/[courseType]/index.tsx`](../../apps/mobile/app/%28main%29/trainings/%5BcourseType%5D/index.tsx)
- `/trainings/[courseType]/reviews` — [`apps/mobile/app/(main)/trainings/[courseType]/reviews.tsx`](../../apps/mobile/app/%28main%29/trainings/%5BcourseType%5D/reviews.tsx)
- `/index` — [`apps/mobile/app/index.tsx`](../../apps/mobile/app/index.tsx)

Проверку доступности, редиректов, прав и каждой кнопки проводить Playwright + native QA по полной матрице.
