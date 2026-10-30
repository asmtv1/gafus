# G0 — полный статический реестр операций и исходных точек входа

**Snapshot:** `G0-2026-10-16-vite-5fc78081`; branch `vite`; HEAD `5fc78081b499862d48e8e90b0f92d08bbfc2e251`.
**Важно:** это полный **статический** перечень обнаруженных page/route/action/module entry points, а НЕ доказательство их runtime-работоспособности или эквивалентности DTO. Списки методов и экспортов извлечены регулярными выражениями, динамические dispatchers и внутренние Core вызовы требуют ручной декомпозиции. Ни одна строка сама по себе не означает DONE. Все чтения только внутри разрешённого Refactor; symlink не разыменовывались.

## Краткая сводка

| Зона | Pages / routes | API route | use server modules | Owner |
| --- | --- | --- | --- | --- |
| Legacy Web | 55 | 109 | 73 | AG2 source → AG1 backend |
| Trainer | 29 | 6 + 1 non-API | 50 | AG4 source → AG1 backend |
| Admin | 21 | 5 | 20 | AG4 source → AG1 backend |
| Mobile | 66 route files | 37 adapters | native offline/push | AG3 source → AG1 backend |
| Hono | 205 declarations | wildcard included | DTO pending | AG1 |
| Vite Web | 13 static routes | dynamic helpers | partial prototype | AG2 |

## Legacy Web — все 55 URL (AG2)

| URL | Старый исходник | Vite static match | Что дальше |
| --- | --- | --- | --- |
| `/login` | `apps/web/src/app/(auth)/login/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/passwordReset` | `apps/web/src/app/(auth)/passwordReset/page.tsx` | ROUTE_EXISTS_NOT_PARITY | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/register` | `apps/web/src/app/(auth)/register/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/vk-consent` | `apps/web/src/app/(auth)/vk-consent/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/achievements` | `apps/web/src/app/(main)/achievements/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/articles/[slug]` | `apps/web/src/app/(main)/articles/[slug]/page.tsx` | DYNAMIC_CANDIDATE | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/articles` | `apps/web/src/app/(main)/articles/page.tsx` | ROUTE_EXISTS_NOT_PARITY | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/consultations/[cynologistUserId]/confirm` | `apps/web/src/app/(main)/consultations/[cynologistUserId]/confirm/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/consultations/[cynologistUserId]` | `apps/web/src/app/(main)/consultations/[cynologistUserId]/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/consultations/call/[bookingId]` | `apps/web/src/app/(main)/consultations/call/[bookingId]/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/consultations/my` | `apps/web/src/app/(main)/consultations/my/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/consultations` | `apps/web/src/app/(main)/consultations/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/courses` | `apps/web/src/app/(main)/courses/page.tsx` | ROUTE_EXISTS_NOT_PARITY | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/cynologist-chat` | `apps/web/src/app/(main)/cynologist-chat/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/cynologist-chats/[chatId]` | `apps/web/src/app/(main)/cynologist-chats/[chatId]/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/cynologist-chats` | `apps/web/src/app/(main)/cynologist-chats/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/daily-course/[scheduleId]` | `apps/web/src/app/(main)/daily-course/[scheduleId]/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/favorites` | `apps/web/src/app/(main)/favorites/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/feed/[postId]` | `apps/web/src/app/(main)/feed/[postId]/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/feed/create` | `apps/web/src/app/(main)/feed/create/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/feed/hidden-authors` | `apps/web/src/app/(main)/feed/hidden-authors/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/feed/notifications` | `apps/web/src/app/(main)/feed/notifications/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/feed` | `apps/web/src/app/(main)/feed/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/feed/profile/[username]` | `apps/web/src/app/(main)/feed/profile/[username]/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/feed/saved` | `apps/web/src/app/(main)/feed/saved/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/gafus/guides` | `apps/web/src/app/(main)/gafus/guides/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/gafus` | `apps/web/src/app/(main)/gafus/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/partner` | `apps/web/src/app/(main)/partner/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/pets/[petId]/vet-visits` | `apps/web/src/app/(main)/pets/[petId]/vet-visits/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/pets` | `apps/web/src/app/(main)/pets/page.tsx` | ROUTE_EXISTS_NOT_PARITY | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/profile/addPet` | `apps/web/src/app/(main)/profile/addPet/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/profile/albums/[albumId]` | `apps/web/src/app/(main)/profile/albums/[albumId]/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/profile/albums` | `apps/web/src/app/(main)/profile/albums/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/profile/change-email` | `apps/web/src/app/(main)/profile/change-email/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/profile/change-password` | `apps/web/src/app/(main)/profile/change-password/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/profile/change-username` | `apps/web/src/app/(main)/profile/change-username/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/profile/confirm-email` | `apps/web/src/app/(main)/profile/confirm-email/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/profile/delete-account` | `apps/web/src/app/(main)/profile/delete-account/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/profile/editBio` | `apps/web/src/app/(main)/profile/editBio/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/profile` | `apps/web/src/app/(main)/profile/page.tsx` | ROUTE_EXISTS_NOT_PARITY | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/profile/set-password` | `apps/web/src/app/(main)/profile/set-password/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/questions/[id]/edit` | `apps/web/src/app/(main)/questions/[id]/edit/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/questions/[id]` | `apps/web/src/app/(main)/questions/[id]/page.tsx` | DYNAMIC_CANDIDATE | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/questions/new` | `apps/web/src/app/(main)/questions/new/page.tsx` | ROUTE_EXISTS_NOT_PARITY | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/questions` | `apps/web/src/app/(main)/questions/page.tsx` | ROUTE_EXISTS_NOT_PARITY | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/reminders` | `apps/web/src/app/(main)/reminders/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/subscription` | `apps/web/src/app/(main)/subscription/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/trainings/[courseType]/[day]` | `apps/web/src/app/(main)/trainings/[courseType]/[day]/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/trainings/[courseType]` | `apps/web/src/app/(main)/trainings/[courseType]/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/trainings/[courseType]/reviews` | `apps/web/src/app/(main)/trainings/[courseType]/reviews/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/otmazki` | `apps/web/src/app/otmazki/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/` | `apps/web/src/app/page.tsx` | ROUTE_EXISTS_NOT_PARITY | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/reset-password` | `apps/web/src/app/reset-password/page.tsx` | ROUTE_EXISTS_NOT_PARITY | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/tracer-test` | `apps/web/src/app/tracer-test/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |
| `/~offline` | `apps/web/src/app/~offline/page.tsx` | UNMAPPED_OR_ALIAS_REVIEW | AG2 parity URL/redirect/auth/SEO/E2E; AG1 API |

## Legacy Web — Next API HTTP операции (AG2 owns legacy source; AG1 owns replacement)

| Method | Legacy path | Legacy source | Static Hono match | Gate |
| --- | --- | --- | --- | --- |
| `GET` | `/api/auth/[...nextauth]` | `apps/web/src/app/api/auth/[...nextauth]/route.ts` | `LEGACY_NON_V1` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/auth/[...nextauth]` | `apps/web/src/app/api/auth/[...nextauth]/route.ts` | `LEGACY_NON_V1` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/auth/callback/vk-id` | `apps/web/src/app/api/auth/callback/vk-id/route.ts` | `LEGACY_NON_V1` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/course-path-export` | `apps/web/src/app/api/course-path-export/route.ts` | `LEGACY_NON_V1` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/csrf-token` | `apps/web/src/app/api/csrf-token/route.ts` | `LEGACY_NON_V1` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/excuses` | `apps/web/src/app/api/excuses/route.ts` | `LEGACY_NON_V1` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/health` | `apps/web/src/app/api/health/route.ts` | `LEGACY_NON_V1` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/internal/course-cache-metrics` | `apps/web/src/app/api/internal/course-cache-metrics/route.ts` | `LEGACY_NON_V1` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/ping` | `apps/web/src/app/api/ping/route.ts` | `LEGACY_NON_V1` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/public-key` | `apps/web/src/app/api/public-key/route.ts` | `LEGACY_NON_V1` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/revalidate/articles` | `apps/web/src/app/api/revalidate/articles/route.ts` | `LEGACY_NON_V1` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/revalidate/courses` | `apps/web/src/app/api/revalidate/courses/route.ts` | `LEGACY_NON_V1` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/revalidate/training-days` | `apps/web/src/app/api/revalidate/training-days/route.ts` | `LEGACY_NON_V1` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/track-reengagement-click` | `apps/web/src/app/api/track-reengagement-click/route.ts` | `LEGACY_NON_V1` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/achievements/training-dates` | `apps/web/src/app/api/v1/achievements/training-dates/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/app-subscription/apple/notifications` | `apps/web/src/app/api/v1/app-subscription/apple/notifications/route.ts` | `NOT_MATCHED` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/app-subscription/offer` | `apps/web/src/app/api/v1/app-subscription/offer/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/app-subscription/promo-code/preview` | `apps/web/src/app/api/v1/app-subscription/promo-code/preview/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/app-subscription/status` | `apps/web/src/app/api/v1/app-subscription/status/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/app-subscription/yookassa/cancel` | `apps/web/src/app/api/v1/app-subscription/yookassa/cancel/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/app-subscription/yookassa/start` | `apps/web/src/app/api/v1/app-subscription/yookassa/start/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/articles/[slug]/like` | `apps/web/src/app/api/v1/articles/[slug]/like/route.ts` | `NOT_MATCHED` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/articles/[slug]` | `apps/web/src/app/api/v1/articles/[slug]/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/articles/[slug]/view` | `apps/web/src/app/api/v1/articles/[slug]/view/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/articles` | `apps/web/src/app/api/v1/articles/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/auth/check-phone-match` | `apps/web/src/app/api/v1/auth/check-phone-match/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/auth/password-reset-request` | `apps/web/src/app/api/v1/auth/password-reset-request/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/auth/register` | `apps/web/src/app/api/v1/auth/register/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/auth/reset-password` | `apps/web/src/app/api/v1/auth/reset-password/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `DELETE` | `/api/v1/community-chat/[[...action]]` | `apps/web/src/app/api/v1/community-chat/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/community-chat/[[...action]]` | `apps/web/src/app/api/v1/community-chat/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/community-chat/[[...action]]` | `apps/web/src/app/api/v1/community-chat/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/consultations/admin/bookings` | `apps/web/src/app/api/v1/consultations/admin/bookings/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `PUT` | `/api/v1/consultations/admin/cynologists/listed` | `apps/web/src/app/api/v1/consultations/admin/cynologists/listed/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/consultations/admin/cynologists` | `apps/web/src/app/api/v1/consultations/admin/cynologists/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/consultations/book` | `apps/web/src/app/api/v1/consultations/book/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/consultations/bookings/[bookingId]/cancel` | `apps/web/src/app/api/v1/consultations/bookings/[bookingId]/cancel/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/consultations/cynologists/[cynologistUserId]/slots/[slotId]/verify` | `apps/web/src/app/api/v1/consultations/cynologists/[cynologistUserId]/slots/[slotId]/verify/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/consultations/cynologists/[cynologistUserId]/slots` | `apps/web/src/app/api/v1/consultations/cynologists/[cynologistUserId]/slots/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/consultations/cynologists` | `apps/web/src/app/api/v1/consultations/cynologists/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/consultations/my` | `apps/web/src/app/api/v1/consultations/my/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/consultations/trainer/availability` | `apps/web/src/app/api/v1/consultations/trainer/availability/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `PUT` | `/api/v1/consultations/trainer/availability` | `apps/web/src/app/api/v1/consultations/trainer/availability/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/consultations/trainer/bookings/[bookingId]/complete` | `apps/web/src/app/api/v1/consultations/trainer/bookings/[bookingId]/complete/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/consultations/trainer/bookings/[bookingId]/confirm` | `apps/web/src/app/api/v1/consultations/trainer/bookings/[bookingId]/confirm/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/consultations/trainer/bookings/[bookingId]/no-show` | `apps/web/src/app/api/v1/consultations/trainer/bookings/[bookingId]/no-show/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/consultations/trainer/bookings/[bookingId]/reject` | `apps/web/src/app/api/v1/consultations/trainer/bookings/[bookingId]/reject/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/consultations/trainer/bookings` | `apps/web/src/app/api/v1/consultations/trainer/bookings/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `DELETE` | `/api/v1/consultations/trainer/day-offs/[dayOffId]` | `apps/web/src/app/api/v1/consultations/trainer/day-offs/[dayOffId]/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/consultations/trainer/day-offs` | `apps/web/src/app/api/v1/consultations/trainer/day-offs/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `DELETE` | `/api/v1/consultations/trainer/exceptions/[exceptionId]` | `apps/web/src/app/api/v1/consultations/trainer/exceptions/[exceptionId]/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/consultations/trainer/exceptions` | `apps/web/src/app/api/v1/consultations/trainer/exceptions/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/courses/access` | `apps/web/src/app/api/v1/courses/access/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/courses/favorites` | `apps/web/src/app/api/v1/courses/favorites/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/courses/favorites` | `apps/web/src/app/api/v1/courses/favorites/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/courses/metadata` | `apps/web/src/app/api/v1/courses/metadata/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `DELETE` | `/api/v1/courses/reviews` | `apps/web/src/app/api/v1/courses/reviews/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/courses/reviews` | `apps/web/src/app/api/v1/courses/reviews/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `PATCH` | `/api/v1/courses/reviews` | `apps/web/src/app/api/v1/courses/reviews/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/courses/reviews` | `apps/web/src/app/api/v1/courses/reviews/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/courses` | `apps/web/src/app/api/v1/courses/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `DELETE` | `/api/v1/cynologist-chat/[[...action]]` | `apps/web/src/app/api/v1/cynologist-chat/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/cynologist-chat/[[...action]]` | `apps/web/src/app/api/v1/cynologist-chat/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/cynologist-chat/[[...action]]` | `apps/web/src/app/api/v1/cynologist-chat/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/exam/result` | `apps/web/src/app/api/v1/exam/result/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/exam/submit` | `apps/web/src/app/api/v1/exam/submit/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/feed-playback/[mediaId]` | `apps/web/src/app/api/v1/feed-playback/[mediaId]/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `DELETE` | `/api/v1/feed/[[...action]]` | `apps/web/src/app/api/v1/feed/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/feed/[[...action]]` | `apps/web/src/app/api/v1/feed/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `PATCH` | `/api/v1/feed/[[...action]]` | `apps/web/src/app/api/v1/feed/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/feed/[[...action]]` | `apps/web/src/app/api/v1/feed/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `PUT` | `/api/v1/feed/[[...action]]` | `apps/web/src/app/api/v1/feed/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/gafus/[[...action]]` | `apps/web/src/app/api/v1/gafus/[[...action]]/route.ts` | `NOT_MATCHED` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `PATCH` | `/api/v1/gafus/[[...action]]` | `apps/web/src/app/api/v1/gafus/[[...action]]/route.ts` | `NOT_MATCHED` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/gafus/[[...action]]` | `apps/web/src/app/api/v1/gafus/[[...action]]/route.ts` | `NOT_MATCHED` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `DELETE` | `/api/v1/gallery/[[...action]]` | `apps/web/src/app/api/v1/gallery/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/gallery/[[...action]]` | `apps/web/src/app/api/v1/gallery/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `PATCH` | `/api/v1/gallery/[[...action]]` | `apps/web/src/app/api/v1/gallery/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/gallery/[[...action]]` | `apps/web/src/app/api/v1/gallery/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `PUT` | `/api/v1/gallery/[[...action]]` | `apps/web/src/app/api/v1/gallery/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/media-cdn-probe` | `apps/web/src/app/api/v1/media-cdn-probe/route.ts` | `NOT_MATCHED` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/media-delivery/status` | `apps/web/src/app/api/v1/media-delivery/status/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/notifications/step/pause` | `apps/web/src/app/api/v1/notifications/step/pause/route.ts` | `NOT_MATCHED` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/notifications/step/reset` | `apps/web/src/app/api/v1/notifications/step/reset/route.ts` | `NOT_MATCHED` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/notifications/step/resume` | `apps/web/src/app/api/v1/notifications/step/resume/route.ts` | `NOT_MATCHED` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `DELETE` | `/api/v1/notifications/step` | `apps/web/src/app/api/v1/notifications/step/route.ts` | `NOT_MATCHED` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/notifications/step` | `apps/web/src/app/api/v1/notifications/step/route.ts` | `NOT_MATCHED` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/notifications/step/toggle` | `apps/web/src/app/api/v1/notifications/step/toggle/route.ts` | `NOT_MATCHED` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/offline/course/download` | `apps/web/src/app/api/v1/offline/course/download/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/offline/course/updates` | `apps/web/src/app/api/v1/offline/course/updates/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/offline/course/version` | `apps/web/src/app/api/v1/offline/course/version/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/partners/attribution` | `apps/web/src/app/api/v1/partners/attribution/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/partners/me` | `apps/web/src/app/api/v1/partners/me/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/partners/payouts` | `apps/web/src/app/api/v1/partners/payouts/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/payments/create` | `apps/web/src/app/api/v1/payments/create/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/payments/webhook` | `apps/web/src/app/api/v1/payments/webhook/route.ts` | `NOT_MATCHED` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/pets/[petId]/documents/[documentId]/download` | `apps/web/src/app/api/v1/pets/[petId]/documents/[documentId]/download/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `DELETE` | `/api/v1/pets/[petId]/documents/[documentId]` | `apps/web/src/app/api/v1/pets/[petId]/documents/[documentId]/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `PUT` | `/api/v1/pets/[petId]/documents/[documentId]` | `apps/web/src/app/api/v1/pets/[petId]/documents/[documentId]/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/pets/[petId]/documents` | `apps/web/src/app/api/v1/pets/[petId]/documents/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/pets/[petId]/documents` | `apps/web/src/app/api/v1/pets/[petId]/documents/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/pets/[petId]/prevention` | `apps/web/src/app/api/v1/pets/[petId]/prevention/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `DELETE` | `/api/v1/pets/[petId]` | `apps/web/src/app/api/v1/pets/[petId]/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `PUT` | `/api/v1/pets/[petId]` | `apps/web/src/app/api/v1/pets/[petId]/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `DELETE` | `/api/v1/pets/[petId]/vet-visits/[[...parts]]` | `apps/web/src/app/api/v1/pets/[petId]/vet-visits/[[...parts]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/pets/[petId]/vet-visits/[[...parts]]` | `apps/web/src/app/api/v1/pets/[petId]/vet-visits/[[...parts]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/pets/[petId]/vet-visits/[[...parts]]` | `apps/web/src/app/api/v1/pets/[petId]/vet-visits/[[...parts]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `PUT` | `/api/v1/pets/[petId]/vet-visits/[[...parts]]` | `apps/web/src/app/api/v1/pets/[petId]/vet-visits/[[...parts]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `DELETE` | `/api/v1/pets/[petId]/weight/[entryId]` | `apps/web/src/app/api/v1/pets/[petId]/weight/[entryId]/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/pets/[petId]/weight` | `apps/web/src/app/api/v1/pets/[petId]/weight/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/pets/[petId]/weight` | `apps/web/src/app/api/v1/pets/[petId]/weight/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `PUT` | `/api/v1/pets/[petId]/weight/target` | `apps/web/src/app/api/v1/pets/[petId]/weight/target/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/pets/documents` | `apps/web/src/app/api/v1/pets/documents/route.ts` | `NOT_MATCHED` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/pets/prevention` | `apps/web/src/app/api/v1/pets/prevention/route.ts` | `NOT_MATCHED` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/pets` | `apps/web/src/app/api/v1/pets/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/pets` | `apps/web/src/app/api/v1/pets/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `DELETE` | `/api/v1/questions/[[...action]]` | `apps/web/src/app/api/v1/questions/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/questions/[[...action]]` | `apps/web/src/app/api/v1/questions/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `PATCH` | `/api/v1/questions/[[...action]]` | `apps/web/src/app/api/v1/questions/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/questions/[[...action]]` | `apps/web/src/app/api/v1/questions/[[...action]]/route.ts` | `DISPATCH_REVIEW` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `DELETE` | `/api/v1/subscriptions/push` | `apps/web/src/app/api/v1/subscriptions/push/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/subscriptions/push` | `apps/web/src/app/api/v1/subscriptions/push/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/subscriptions/push` | `apps/web/src/app/api/v1/subscriptions/push/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/surveys/[slug]/response` | `apps/web/src/app/api/v1/surveys/[slug]/response/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/surveys/[slug]` | `apps/web/src/app/api/v1/surveys/[slug]/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/surveys/comparison` | `apps/web/src/app/api/v1/surveys/comparison/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/training/day` | `apps/web/src/app/api/v1/training/day/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/training/days` | `apps/web/src/app/api/v1/training/days/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/training/step/complete/practice` | `apps/web/src/app/api/v1/training/step/complete/practice/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/training/step/complete/theory` | `apps/web/src/app/api/v1/training/step/complete/theory/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/training/step/pause` | `apps/web/src/app/api/v1/training/step/pause/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/training/step/resume` | `apps/web/src/app/api/v1/training/step/resume/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/training/step/start` | `apps/web/src/app/api/v1/training/step/start/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/training/step/status` | `apps/web/src/app/api/v1/training/step/status/route.ts` | `NOT_MATCHED` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/user/avatar` | `apps/web/src/app/api/v1/user/avatar/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/v1/user/onboarding-tour/complete` | `apps/web/src/app/api/v1/user/onboarding-tour/complete/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/user/onboarding-tour` | `apps/web/src/app/api/v1/user/onboarding-tour/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/user/profile/public` | `apps/web/src/app/api/v1/user/profile/public/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/user/profile` | `apps/web/src/app/api/v1/user/profile/route.ts` | `STATIC_PATH_ONLY` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `PATCH` | `/api/v1/user/profile` | `apps/web/src/app/api/v1/user/profile/route.ts` | `NOT_MATCHED` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/v1/video/playback-url` | `apps/web/src/app/api/v1/video/playback-url/route.ts` | `NOT_MATCHED` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/video/[videoId]/manifest` | `apps/web/src/app/api/video/[videoId]/manifest/route.ts` | `LEGACY_NON_V1` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `GET` | `/api/video/[videoId]/segment` | `apps/web/src/app/api/video/[videoId]/segment/route.ts` | `LEGACY_NON_V1` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |
| `POST` | `/api/webhooks/resend` | `apps/web/src/app/api/webhooks/resend/route.ts` | `LEGACY_NON_V1` | AG1 DTO/auth/RBAC + AG2 consumer + contract/E2E |

## Legacy Web — 73 use server modules, exported actions (AG2 legacy; AG1 business)

| Legacy module | Export/function (static) | Gate |
| --- | --- | --- |
| `apps/web/src/app/(main)/trainings/[courseType]/[day]/actions.ts` | `pauseNotificationAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/app/(main)/trainings/[courseType]/[day]/actions.ts` | `resetNotificationAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/app/(main)/trainings/[courseType]/[day]/actions.ts` | `resumeNotificationAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/features/consultations/lib/voximplant-call-actions.ts` | `createConsultationCallAdmissionAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/features/consultations/lib/voximplant-call-actions.ts` | `prepareConsultationCallAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/features/consultations/lib/voximplant-call-actions.ts` | `signConsultationKeyAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/StepNotification/notificationActions.ts` | `pauseNotificationAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/StepNotification/notificationActions.ts` | `resetNotificationAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/StepNotification/notificationActions.ts` | `resumeNotificationAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/achievements/getUserTrainingDates.ts` | `getUserTrainingDates` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/cachedArticles.ts` | `getArticlesCached` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/cachedCourses.ts` | `getCoursesWithProgressCached` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/cachedCourses.ts` | `getFavoritesCoursesCached` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/generateCoursePathPdf.ts` | `generateCoursePathPdf` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/getDiaryEntries.ts` | `getDiaryEntries` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/getExamResult.ts` | `getExamResult` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/getVideoIdFromUrlAction.ts` | `getVideoIdFromUrlAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/invalidateAllCache.ts` | `invalidateAllCache` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/invalidateCoursesCache.ts` | `invalidateUserProgressCache` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/offlineCourseActions.ts` | `checkCourseUpdates` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/offlineCourseActions.ts` | `downloadFullCourse` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/offlineCourseActions.ts` | `getCourseVersion` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/publicKey.ts` | `getPublicKeyAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/saveDiaryEntry.ts` | `saveDiaryEntry` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/submitExamResult.ts` | `submitExamResult` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/subscription.ts` | `deleteSubscriptionAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/subscription.ts` | `updateSubscriptionAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/trackReengagementClick.ts` | `trackReengagementClick` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/trainingReminders.ts` | `createTrainingReminder` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/trainingReminders.ts` | `deleteTrainingReminder` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/trainingReminders.ts` | `getTrainingReminders` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/trainingReminders.ts` | `updateTrainingReminder` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/updateReengagementSettings.ts` | `getReengagementSettings` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/updateReengagementSettings.ts` | `updateReengagementSettings` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/uploadExamVideo.ts` | `uploadExamVideo` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/userProgress.ts` | `getUserProgressForCurrentUser` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/actions/userProgress.ts` | `getUserProgressForMultipleCourses` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/daily-course/actions.ts` | `completeDailyCourseStepServerAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/daily-course/actions.ts` | `getDailyCourseTrainingForWeb` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/daily-course/actions.ts` | `getTodayDailyCourseForWeb` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/daily-course/actions.ts` | `pauseDailyCourseStepServerAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/daily-course/actions.ts` | `resetDailyCourseStepServerAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/daily-course/actions.ts` | `resumeDailyCourseStepServerAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/daily-course/actions.ts` | `startDailyCourseStepServerAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/daily-course/actions.ts` | `unlockDailyCourseStepServerAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/notes/getStudentNotes.ts` | `getStudentNotes` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/pet-prevention/createPreventionEntry.ts` | `createPreventionEntry` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/pet-prevention/deletePreventionEntry.ts` | `deletePreventionEntry` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/pet-prevention/getPreventionEntriesByUser.ts` | `getPreventionEntriesByPetForUser` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/pet-prevention/getPreventionEntriesByUser.ts` | `getPreventionEntriesByPetsForUser` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/pet-prevention/updatePreventionEntry.ts` | `updatePreventionEntry` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/pets/createPet.ts` | `createPet` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/pets/deletePet.ts` | `deletePet` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/pets/getCurrentUserPetsPageData.ts` | `getCurrentUserPetsPageData` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/pets/getUserPets.ts` | `getUserPets` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/pets/listUserPetDocuments.ts` | `listUserPetDocuments` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/pets/pet-documents-server.ts` | `deletePetDocumentForUser` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/pets/pet-documents-server.ts` | `getPetDocumentByIdForUser` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/pets/pet-documents-server.ts` | `listPetDocumentsForUser` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/pets/pet-documents-server.ts` | `preparePetDocumentDownloadForUser` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/pets/pet-documents-server.ts` | `renamePetDocumentForUser` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/pets/pet-documents-server.ts` | `uploadPetDocumentForUser` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/pets/savePet.ts` | `savePet` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/pets/updatePet.ts` | `updatePet` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/pets/updatePetAvatar.ts` | `updatePetAvatar` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/profile/updateAvatar.ts` | `updateAvatar` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/savePushSubscription/deletePushSubscription.ts` | `deleteAllPushSubscriptions` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/savePushSubscription/deletePushSubscription.ts` | `deletePushSubscriptionByEndpoint` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/savePushSubscription/getUserSubscriptionStatus.ts` | `getUserSubscriptionCount` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/savePushSubscription/getUserSubscriptionStatus.ts` | `getUserSubscriptionStatus` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/savePushSubscription/getUserSubscriptionStatus.ts` | `getUserSubscriptions` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/savePushSubscription/savePushSubscription.ts` | `savePushSubscription` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/training/checkDayAccess.ts` | `checkDayAccess` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/training/getDeclinedName.ts` | `getDeclinedName` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/training/getTrainingDayWithUserSteps.ts` | `getTrainingDayWithUserSteps` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/training/getTrainingDays.ts` | `getTrainingDays` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/training/markDiaryStepAsCompleted.ts` | `markDiaryStepAsCompleted` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/training/markPracticeStepAsCompleted.ts` | `markPracticeStepAsCompleted` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/training/markTheoryStepAsCompleted.ts` | `markTheoryStepAsCompleted` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/training/pauseResumeUserStep.ts` | `pauseUserStepServerAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/training/pauseResumeUserStep.ts` | `resumeUserStepServerAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/training/saveCoursePersonalization.ts` | `saveCoursePersonalization` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/training/startUserStepServerAction.ts` | `startUserStepServerAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/training/updateUserStepStatus.ts` | `updateStepStatusServerAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/training/updateUserStepStatus.ts` | `updateUserStepStatus` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/user/deleteUserAccount.ts` | `requestAccountDeletionCodeAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/user/deleteUserAccount.ts` | `submitDeleteUserAccount` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/user/getUserProfile.ts` | `getUserProfile` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/user/getUserProgress.ts` | `getUserProgress` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/user/getUserWithTrainings.ts` | `getUserWithTrainings` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/user/updateUserProfile.ts` | `updateUserProfile` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/user/userCourses.ts` | `assignCoursesToUser` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/user/userCourses.ts` | `checkAndCompleteCourse` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/user/userCourses.ts` | `completeUserCourse` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/user/userCourses.ts` | `syncUserCourseStatusFromDays` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/video/getSignedVideoUrl.ts` | `getSignedVideoUrl` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/video/getVideoMetadata.ts` | `getVideoMetadata` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/video/getVideoUrlForPlayback.ts` | `getVideoUrlForPlayback` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/video/videoProgressActions.ts` | `getVideoProgress` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/video/videoProgressActions.ts` | `saveVideoProgress` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/lib/video/videoProgressActions.ts` | `syncVideoProgressFromLocal` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/achievements.ts` | `getUserTrainingDatesAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/auth.ts` | `changePasswordAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/auth.ts` | `changeUsernameAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/auth.ts` | `checkLoginRateLimit` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/auth.ts` | `checkUsernameAvailableAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/auth.ts` | `confirmEmailChangeByTokenAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/auth.ts` | `getVkConsentPromoAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/auth.ts` | `initiateVkIdAuth` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/auth.ts` | `initiateVkIdLink` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/auth.ts` | `prepareVkIdOneTap` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/auth.ts` | `previewRegistrationPromoAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/auth.ts` | `registerUserAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/auth.ts` | `requestEmailChangeAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/auth.ts` | `resetPasswordAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/auth.ts` | `sendPasswordResetRequestAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/auth.ts` | `setPasswordAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/auth.ts` | `submitVkConsentAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/cache.ts` | `invalidateCoursesCache` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/cache.ts` | `invalidateTrainingCache` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/cache.ts` | `invalidateUserProgressCache` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/course.ts` | `addFavoriteCourseAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/course.ts` | `checkCourseAccessAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/course.ts` | `checkCourseAccessByIdAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/course.ts` | `createCourseReviewAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/course.ts` | `deleteCourseReviewAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/course.ts` | `getAuthoredCoursesAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/course.ts` | `getCourseMetadataAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/course.ts` | `getCourseReviewsAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/course.ts` | `getCoursesWithProgressAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/course.ts` | `getFavoritesCoursesAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/course.ts` | `rateCourseAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/course.ts` | `removeFavoriteCourseAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/course.ts` | `toggleFavoriteCourseAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/course.ts` | `updateCourseRatingAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/course.ts` | `updateCourseReviewAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/notes.ts` | `getStudentNotes` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/notifications.ts` | `createStepNotificationAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/notifications.ts` | `deleteStepNotificationAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/notifications.ts` | `pauseNotificationAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/notifications.ts` | `resetNotificationAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/notifications.ts` | `resumeNotificationAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/notifications.ts` | `toggleStepNotificationPauseAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/notifications.ts` | `toggleStepNotificationPauseByDayOnCourseAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/push.ts` | `getPublicKeyAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/subscriptions.ts` | `deleteSubscriptionAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/subscriptions.ts` | `getSubscriptionCountAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/subscriptions.ts` | `getSubscriptionStatusAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/subscriptions.ts` | `getUserSubscriptionsAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/subscriptions.ts` | `savePushSubscriptionAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/subscriptions.ts` | `updateSubscriptionAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/tracking.ts` | `trackReengagementClickAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/user.ts` | `getPublicProfileAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/user.ts` | `getUserProfileAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/user.ts` | `updateAvatarAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/server-actions/user.ts` | `updateUserProfileAction` | AG1 Core/API mapping + AG2 UI + negative/contract tests |
| `apps/web/src/shared/utils/getCurrentUserId.ts` | `getCurrentUserId` | AG1 Core/API mapping + AG2 UI + negative/contract tests |

## Trainer — все 29 Next pages (AG4)

| URL | Source | Gate |
| --- | --- | --- |
| `/main-panel/articles/[id]/edit` | `apps/trainer-panel/src/app/(main)/main-panel/articles/[id]/edit/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/articles/new` | `apps/trainer-panel/src/app/(main)/main-panel/articles/new/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/articles` | `apps/trainer-panel/src/app/(main)/main-panel/articles/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/consultations/availability` | `apps/trainer-panel/src/app/(main)/main-panel/consultations/availability/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/consultations/call/[bookingId]` | `apps/trainer-panel/src/app/(main)/main-panel/consultations/call/[bookingId]/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/consultations` | `apps/trainer-panel/src/app/(main)/main-panel/consultations/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/courses/[id]/edit` | `apps/trainer-panel/src/app/(main)/main-panel/courses/[id]/edit/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/courses/new` | `apps/trainer-panel/src/app/(main)/main-panel/courses/new/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/daily-course/bundles` | `apps/trainer-panel/src/app/(main)/main-panel/daily-course/bundles/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/daily-course/import` | `apps/trainer-panel/src/app/(main)/main-panel/daily-course/import/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/daily-course` | `apps/trainer-panel/src/app/(main)/main-panel/daily-course/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/daily-course/statistics` | `apps/trainer-panel/src/app/(main)/main-panel/daily-course/statistics/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/daily-course/steps` | `apps/trainer-panel/src/app/(main)/main-panel/daily-course/steps/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/days/[id]/edit` | `apps/trainer-panel/src/app/(main)/main-panel/days/[id]/edit/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/days/new` | `apps/trainer-panel/src/app/(main)/main-panel/days/new/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/days` | `apps/trainer-panel/src/app/(main)/main-panel/days/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/exam-results` | `apps/trainer-panel/src/app/(main)/main-panel/exam-results/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/faq` | `apps/trainer-panel/src/app/(main)/main-panel/faq/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/my-videos` | `apps/trainer-panel/src/app/(main)/main-panel/my-videos/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/notes` | `apps/trainer-panel/src/app/(main)/main-panel/notes/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel` | `apps/trainer-panel/src/app/(main)/main-panel/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/statistics/courses/[courseId]` | `apps/trainer-panel/src/app/(main)/main-panel/statistics/courses/[courseId]/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/statistics` | `apps/trainer-panel/src/app/(main)/main-panel/statistics/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/steps/[id]/edit` | `apps/trainer-panel/src/app/(main)/main-panel/steps/[id]/edit/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/steps/new` | `apps/trainer-panel/src/app/(main)/main-panel/steps/new/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/steps` | `apps/trainer-panel/src/app/(main)/main-panel/steps/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/main-panel/templates` | `apps/trainer-panel/src/app/(main)/main-panel/templates/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/login` | `apps/trainer-panel/src/app/login/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |
| `/` | `apps/trainer-panel/src/app/page.tsx` | AG4 Vite route+UI; AG1 API+owner RBAC |

## Trainer — Next API + прочие route handlers (AG4 legacy; AG1 backend)

| Method | URL | Source | Status |
| --- | --- | --- | --- |
| `GET` | `/api/auth/[...nextauth]` | `apps/trainer-panel/src/app/api/auth/[...nextauth]/route.ts` | `LEGACY_NON_V1` |
| `POST` | `/api/auth/[...nextauth]` | `apps/trainer-panel/src/app/api/auth/[...nextauth]/route.ts` | `LEGACY_NON_V1` |
| `OPTIONS` | `/api/chat` | `apps/trainer-panel/src/app/api/chat/route.ts` | `LEGACY_NON_V1` |
| `POST` | `/api/chat` | `apps/trainer-panel/src/app/api/chat/route.ts` | `LEGACY_NON_V1` |
| `GET` | `/api/csrf-token` | `apps/trainer-panel/src/app/api/csrf-token/route.ts` | `LEGACY_NON_V1` |
| `GET` | `/api/health` | `apps/trainer-panel/src/app/api/health/route.ts` | `LEGACY_NON_V1` |
| `GET` | `/api/video/[videoId]/manifest` | `apps/trainer-panel/src/app/api/video/[videoId]/manifest/route.ts` | `LEGACY_NON_V1` |
| `GET` | `/api/video/[videoId]/segment` | `apps/trainer-panel/src/app/api/video/[videoId]/segment/route.ts` | `LEGACY_NON_V1` |
| `POST` | `/main-panel/my-videos/upload` | `apps/trainer-panel/src/app/(main)/main-panel/my-videos/upload/route.ts` | `NON_API_ROUTE` |

## Trainer — 50 use server modules, exported actions

| Module | Export/function (static) | Gate |
| --- | --- | --- |
| `apps/trainer-panel/src/features/ai-chat/lib/clearChatHistory.ts` | `clearChatHistory` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/ai-chat/lib/getAIConfig.ts` | `getAIConfig` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/ai-chat/lib/getChatHistory.ts` | `getChatHistory` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/ai-chat/lib/saveAIConfig.ts` | `saveAIConfig` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/articles/lib/uploadArticleImageServerAction.ts` | `uploadArticleImageServerAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/articles/lib/uploadArticleLogoServerAction.ts` | `uploadArticleLogoServerAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/consultations/lib/trainer-availability-actions.ts` | `addDayOffAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/consultations/lib/trainer-availability-actions.ts` | `addSlotExceptionAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/consultations/lib/trainer-availability-actions.ts` | `removeDayOffAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/consultations/lib/trainer-availability-actions.ts` | `removeSlotExceptionAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/consultations/lib/trainer-availability-actions.ts` | `saveTrainerAvailabilityAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/consultations/lib/trainer-booking-actions.ts` | `completeBookingTrainerAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/consultations/lib/trainer-booking-actions.ts` | `confirmBookingTrainerAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/consultations/lib/trainer-booking-actions.ts` | `markNoShowBookingTrainerAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/consultations/lib/trainer-booking-actions.ts` | `rejectBookingTrainerAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/consultations/lib/voximplant-call-actions.ts` | `createConsultationCallAdmissionAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/consultations/lib/voximplant-call-actions.ts` | `prepareConsultationCallAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/consultations/lib/voximplant-call-actions.ts` | `signConsultationKeyAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/courses/lib/deleteDays.ts` | `deleteDays` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/courses/lib/getVisibleDays.ts` | `getVisibleDays` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/courses/lib/uploadCourseImageServerAction.ts` | `uploadCourseImageServerAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/daily-course/lib/actions.ts` | `confirmDailyCourseCleanupAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/daily-course/lib/actions.ts` | `confirmDailyCourseImportAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/daily-course/lib/actions.ts` | `deleteDailyCourseBundleAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/daily-course/lib/actions.ts` | `deleteDailyCourseScheduleAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/daily-course/lib/actions.ts` | `getDailyCourseBundlesPageData` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/daily-course/lib/actions.ts` | `getDailyCoursePageData` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/daily-course/lib/actions.ts` | `getDailyCourseStatisticsPageData` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/daily-course/lib/actions.ts` | `previewDailyCourseCleanupAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/daily-course/lib/actions.ts` | `previewDailyCourseImportAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/daily-course/lib/actions.ts` | `upsertDailyCourseBundleAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/daily-course/lib/actions.ts` | `upsertDailyCourseScheduleAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/exam-results/lib/getExamResults.ts` | `getExamResults` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/exam-results/lib/getExamResults.ts` | `getExamResultsByCourse` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/exam-results/lib/getPendingExamCount.ts` | `getPendingExamCount` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/exam-results/lib/getPendingExamResults.ts` | `getPendingExamResults` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/exam-results/lib/reviewExamResult.ts` | `reviewExamResult` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/notes/lib/createNote.ts` | `createNote` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/notes/lib/deleteNote.ts` | `deleteNote` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/notes/lib/getNotes.ts` | `getNotes` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/notes/lib/getNotes.ts` | `getNotesCached` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/notes/lib/updateNote.ts` | `updateNote` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/steps/lib/createStep.ts` | `createStep` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/steps/lib/createStepFromTemplate.ts` | `createStepFromTemplate` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/steps/lib/createTrainingDay.ts` | `createTrainingDay` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/steps/lib/deleteStepImageServerAction.ts` | `deleteStepImageServerAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/steps/lib/deleteSteps.ts` | `deleteSteps` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/steps/lib/getStepCategories.ts` | `getStepCategories` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/steps/lib/getStepTemplates.ts` | `getStepTemplateById` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/steps/lib/getStepTemplates.ts` | `getStepTemplates` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/steps/lib/getStepTemplates.ts` | `searchStepTemplates` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/steps/lib/getVisibleSteps.ts` | `getVisibleSteps` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/steps/lib/manageTemplates.ts` | `createStepCategory` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/steps/lib/manageTemplates.ts` | `createStepTemplate` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/steps/lib/manageTemplates.ts` | `deleteStepTemplate` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/steps/lib/updateStep.ts` | `updateStep` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/steps/lib/updateTrainingDay.ts` | `updateTrainingDay` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/trainer-videos/lib/deleteTrainerVideo.ts` | `deleteTrainerVideo` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/trainer-videos/lib/getMultipleVideoStatuses.ts` | `getMultipleVideoStatuses` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/trainer-videos/lib/getSignedVideoUrl.ts` | `getSignedVideoUrl` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/trainer-videos/lib/getTrainerVideos.ts` | `getTrainerVideos` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/features/trainer-videos/lib/updateTrainerVideoName.ts` | `updateTrainerVideoName` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/articles.ts` | `createArticleAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/articles.ts` | `deleteArticleAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/articles.ts` | `getArticleViewersAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/articles.ts` | `updateArticleAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/cachedStatistics.ts` | `getCourseStatisticsCached` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/cachedStatistics.ts` | `searchUsersByUsernameCached` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/courses.ts` | `createCourseServerAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/courses.ts` | `deleteCourseServerAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/courses.ts` | `updateCourseServerAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/getUserProgress.ts` | `getUserProgress` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/invalidateArticlesCache.ts` | `invalidateArticlesCache` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/invalidateCacheActions.ts` | `invalidateCoursesCacheAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/invalidateCoursesCache.ts` | `invalidateBaseCoursesCache` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/invalidateCoursesCache.ts` | `invalidateCoursesCache` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/invalidateTrainingDaysCache.ts` | `invalidateTrainingDayCache` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/invalidateTrainingDaysCache.ts` | `invalidateTrainingDaysCache` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/statistics.ts` | `getCourseStatisticsAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/statistics.ts` | `getDetailedCourseStatisticsAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/statistics.ts` | `getDetailedStepStatisticsAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/statistics.ts` | `getStepStatisticsAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/actions/users.ts` | `getPublicProfileAction` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/utils/getStudentsByIds.ts` | `getStudentsByIds` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/utils/searchStudentsByUsername.ts` | `searchStudentsByUsername` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |
| `apps/trainer-panel/src/shared/lib/utils/searchUsersByUsername.ts` | `searchUsersByUsername` | AG1 endpoint+role+owner; AG4 adapter/form; contract+E2E |

## Admin — все 21 Next pages (AG4)

| URL | Source | Gate |
| --- | --- | --- |
| `/main-panel/admin` | `apps/admin-panel/src/app/(main)/main-panel/admin/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/main-panel/app-subscriptions` | `apps/admin-panel/src/app/(main)/main-panel/app-subscriptions/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/main-panel/broadcasts` | `apps/admin-panel/src/app/(main)/main-panel/broadcasts/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/main-panel/consultations/bookings` | `apps/admin-panel/src/app/(main)/main-panel/consultations/bookings/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/main-panel/consultations` | `apps/admin-panel/src/app/(main)/main-panel/consultations/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/main-panel/consultations/trainers-schedules` | `apps/admin-panel/src/app/(main)/main-panel/consultations/trainers-schedules/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/main-panel/feature-flags` | `apps/admin-panel/src/app/(main)/main-panel/feature-flags/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/main-panel/feed-moderation` | `apps/admin-panel/src/app/(main)/main-panel/feed-moderation/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/main-panel/gafus` | `apps/admin-panel/src/app/(main)/main-panel/gafus/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/main-panel/mail` | `apps/admin-panel/src/app/(main)/main-panel/mail/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/main-panel/mobile-intro` | `apps/admin-panel/src/app/(main)/main-panel/mobile-intro/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/main-panel` | `apps/admin-panel/src/app/(main)/main-panel/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/main-panel/partners/[id]` | `apps/admin-panel/src/app/(main)/main-panel/partners/[id]/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/main-panel/partners` | `apps/admin-panel/src/app/(main)/main-panel/partners/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/main-panel/profit` | `apps/admin-panel/src/app/(main)/main-panel/profit/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/main-panel/questions` | `apps/admin-panel/src/app/(main)/main-panel/questions/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/main-panel/reengagement` | `apps/admin-panel/src/app/(main)/main-panel/reengagement/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/main-panel/rewarded-ads` | `apps/admin-panel/src/app/(main)/main-panel/rewarded-ads/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/main-panel/users` | `apps/admin-panel/src/app/(main)/main-panel/users/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/login` | `apps/admin-panel/src/app/login/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |
| `/` | `apps/admin-panel/src/app/page.tsx` | AG4 Vite route+UI; AG1 API+RBAC/audit |

## Admin — Next API HTTP операции (AG4 legacy; AG1 backend)

| Method | URL | Source | Status |
| --- | --- | --- | --- |
| `GET` | `/api/auth/[...nextauth]` | `apps/admin-panel/src/app/api/auth/[...nextauth]/route.ts` | `LEGACY_NON_V1` |
| `POST` | `/api/auth/[...nextauth]` | `apps/admin-panel/src/app/api/auth/[...nextauth]/route.ts` | `LEGACY_NON_V1` |
| `GET` | `/api/csrf-token` | `apps/admin-panel/src/app/api/csrf-token/route.ts` | `LEGACY_NON_V1` |
| `GET` | `/api/health` | `apps/admin-panel/src/app/api/health/route.ts` | `LEGACY_NON_V1` |
| `GET` | `/api/users/[id]/app-subscription` | `apps/admin-panel/src/app/api/users/[id]/app-subscription/route.ts` | `LEGACY_NON_V1` |
| `POST` | `/api/users/[id]/app-subscription` | `apps/admin-panel/src/app/api/users/[id]/app-subscription/route.ts` | `LEGACY_NON_V1` |
| `PUT` | `/api/users/[id]` | `apps/admin-panel/src/app/api/users/[id]/route.ts` | `LEGACY_NON_V1` |

## Admin — 20 use server modules, exported actions

| Module | Export/function (static) | Gate |
| --- | --- | --- |
| `apps/admin-panel/src/app/(main)/main-panel/feed-moderation/actions.ts` | `loadFeedReports` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/app/(main)/main-panel/feed-moderation/actions.ts` | `moderateFeedReport` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/app/(main)/main-panel/gafus/actions.ts` | `adjustGafusWallet` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/app/(main)/main-panel/gafus/actions.ts` | `importLegacyGafusCredits` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/app/(main)/main-panel/gafus/actions.ts` | `reviewGafusFraudSignal` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/app/(main)/main-panel/gafus/actions.ts` | `saveGafusSettings` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/app/(main)/main-panel/questions/actions.ts` | `loadQuestionModeration` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/app/(main)/main-panel/questions/actions.ts` | `moderateQuestion` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/app/(main)/main-panel/questions/actions.ts` | `unblockQuestionUser` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/features/admin/lib/getStorageStats.ts` | `getStorageStats` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/features/broadcasts/lib/sendBroadcastPush.ts` | `sendBroadcastPush` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/features/consultations/lib/admin-availability-actions.ts` | `addAdminDayOffAction` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/features/consultations/lib/admin-availability-actions.ts` | `addAdminSlotExceptionAction` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/features/consultations/lib/admin-availability-actions.ts` | `removeAdminDayOffAction` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/features/consultations/lib/admin-availability-actions.ts` | `removeAdminSlotExceptionAction` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/features/consultations/lib/admin-availability-actions.ts` | `saveAdminTrainerAvailabilityAction` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/features/consultations/lib/set-listed-cynologists.ts` | `setListedCynologistsAction` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/features/partners/lib/partnerPayoutActions.ts` | `markPartnerBalancePaid` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/features/profit/profitActions.ts` | `cancelVideoExpenseAction` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/features/profit/profitActions.ts` | `saveVideoExpenseAction` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/features/reengagement/lib/getReengagementMetrics.ts` | `getReengagementMetrics` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/features/reengagement/lib/triggerScheduler.ts` | `triggerReengagementScheduler` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/features/users/lib/deleteUser.ts` | `deleteUser` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/features/users/lib/updateUser.ts` | `updateUser` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/shared/lib/actions/appSubscriptionAdminActions.ts` | `getAppSubscriptionSettingsAction` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/shared/lib/actions/appSubscriptionAdminActions.ts` | `updateAppSubscriptionSettingsAction` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/shared/lib/actions/appSubscriptionPromoCodeActions.ts` | `archiveAppSubscriptionPromoCodeAction` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/shared/lib/actions/appSubscriptionPromoCodeActions.ts` | `createAppSubscriptionPromoCodeAction` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/shared/lib/actions/appSubscriptionPromoCodeActions.ts` | `updateAppSubscriptionPromoCodeAction` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/shared/lib/actions/invalidateAllCache.ts` | `invalidateAllCache` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/shared/lib/actions/invalidateCacheActions.ts` | `invalidateCoursesCacheAction` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/shared/lib/actions/invalidateCoursesCache.ts` | `invalidateBaseCoursesCache` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/shared/lib/actions/invalidateCoursesCache.ts` | `invalidateCoursesCache` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/shared/lib/actions/mobileAppFeatureFlagsActions.ts` | `updateMobileReleaseControlAction` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/shared/lib/actions/npdAdminActions.ts` | `reconcileNpdReceiptAction` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |
| `apps/admin-panel/src/shared/lib/actions/npdAdminActions.ts` | `retryNpdReceiptAction` | AG1 endpoint+RBAC+audit; AG4 UI+negative tests |

## Mobile — все 66 Expo route files (AG3; layouts/service files included)

| Expo route (static approximation) | Source | Gate |
| --- | --- | --- |
| `/_layout` | `apps/mobile/app/(auth)/_layout.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/intro` | `apps/mobile/app/(auth)/intro.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/login` | `apps/mobile/app/(auth)/login.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/register` | `apps/mobile/app/(auth)/register.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/reset-password` | `apps/mobile/app/(auth)/reset-password.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/vk-consent` | `apps/mobile/app/(auth)/vk-consent.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/vk-set-phone` | `apps/mobile/app/(auth)/vk-set-phone.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/welcome` | `apps/mobile/app/(auth)/welcome.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/_layout` | `apps/mobile/app/(main)/(tabs)/_layout.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/achievements` | `apps/mobile/app/(main)/(tabs)/achievements.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/albums` | `apps/mobile/app/(main)/(tabs)/albums.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/articles` | `apps/mobile/app/(main)/(tabs)/articles.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/consultations` | `apps/mobile/app/(main)/(tabs)/consultations.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/courses` | `apps/mobile/app/(main)/(tabs)/courses.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/cynologist-chat` | `apps/mobile/app/(main)/(tabs)/cynologist-chat.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/cynologist-chats` | `apps/mobile/app/(main)/(tabs)/cynologist-chats.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/feed` | `apps/mobile/app/(main)/(tabs)/feed.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/index` | `apps/mobile/app/(main)/(tabs)/index.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/more` | `apps/mobile/app/(main)/(tabs)/more.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/pets` | `apps/mobile/app/(main)/(tabs)/pets.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/profile` | `apps/mobile/app/(main)/(tabs)/profile.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/questions` | `apps/mobile/app/(main)/(tabs)/questions.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/reminders` | `apps/mobile/app/(main)/(tabs)/reminders.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/_layout` | `apps/mobile/app/(main)/_layout.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/articles/[slug]` | `apps/mobile/app/(main)/articles/[slug].tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/consultations/[userId]` | `apps/mobile/app/(main)/consultations/[userId].tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/consultations/booking-confirm` | `apps/mobile/app/(main)/consultations/booking-confirm.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/consultations/index` | `apps/mobile/app/(main)/consultations/index.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/consultations/mine` | `apps/mobile/app/(main)/consultations/mine.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/cynologist-chats/[chatId]` | `apps/mobile/app/(main)/cynologist-chats/[chatId].tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/daily-course/[scheduleId]` | `apps/mobile/app/(main)/daily-course/[scheduleId].tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/feed/[postId]` | `apps/mobile/app/(main)/feed/[postId].tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/feed/create` | `apps/mobile/app/(main)/feed/create.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/feed/hidden-authors` | `apps/mobile/app/(main)/feed/hidden-authors.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/feed/profile/[username]` | `apps/mobile/app/(main)/feed/profile/[username].tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/feed/saved` | `apps/mobile/app/(main)/feed/saved.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/gafus-guides` | `apps/mobile/app/(main)/gafus-guides.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/gafus` | `apps/mobile/app/(main)/gafus.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/partner` | `apps/mobile/app/(main)/partner.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/pets/[petId]/vet-visits` | `apps/mobile/app/(main)/pets/[petId]/vet-visits.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/pets/add` | `apps/mobile/app/(main)/pets/add.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/pets/edit/[id]` | `apps/mobile/app/(main)/pets/edit/[id].tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/profile/[username]` | `apps/mobile/app/(main)/profile/[username].tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/profile/albums/[albumId]` | `apps/mobile/app/(main)/profile/albums/[albumId].tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/profile/albums/index` | `apps/mobile/app/(main)/profile/albums/index.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/profile/change-email` | `apps/mobile/app/(main)/profile/change-email.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/profile/change-password` | `apps/mobile/app/(main)/profile/change-password.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/profile/change-username` | `apps/mobile/app/(main)/profile/change-username.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/profile/delete-account` | `apps/mobile/app/(main)/profile/delete-account.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/profile/edit` | `apps/mobile/app/(main)/profile/edit.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/profile/set-password` | `apps/mobile/app/(main)/profile/set-password.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/questions/[id]/edit` | `apps/mobile/app/(main)/questions/[id]/edit.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/questions/[id]/index` | `apps/mobile/app/(main)/questions/[id]/index.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/questions/index` | `apps/mobile/app/(main)/questions/index.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/questions/new` | `apps/mobile/app/(main)/questions/new.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/reminders` | `apps/mobile/app/(main)/reminders.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/training/[courseType]/[dayId]` | `apps/mobile/app/(main)/training/[courseType]/[dayId].tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/training/[courseType]/index` | `apps/mobile/app/(main)/training/[courseType]/index.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/training/[courseType]/reviews` | `apps/mobile/app/(main)/training/[courseType]/reviews.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/trainings/[courseType]/[day]` | `apps/mobile/app/(main)/trainings/[courseType]/[day].tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/trainings/[courseType]/index` | `apps/mobile/app/(main)/trainings/[courseType]/index.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/trainings/[courseType]/reviews` | `apps/mobile/app/(main)/trainings/[courseType]/reviews.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/+native-intent` | `apps/mobile/app/+native-intent.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/+not-found` | `apps/mobile/app/+not-found.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/_layout` | `apps/mobile/app/_layout.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |
| `/index` | `apps/mobile/app/index.tsx` | AG3 behavior/deep link/device test; AG1 API compatibility |

## Mobile — 37 API adapters и обнаруженные endpoint references (AG3)

| Adapter | Exported symbols (static) | Endpoint string references (static) | Gate |
| --- | --- | --- | --- |
| `apps/mobile/src/shared/lib/api/abortError.ts` | `isAbortError` | DYNAMIC_URL_REVIEW | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/achievements.ts` | `achievementsApi` | `/api/v1/achievements`, `/api/v1/achievements/training-dates` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/achievementsQuery.ts` | `achievementsQueryOptions` | DYNAMIC_URL_REVIEW | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/articles.ts` | `articlesApi` | `/api/v1/articles`, `/api/v1/articles/${articleId}/like`, `/api/v1/articles/${slug}`, `/api/v1/articles/${slug}/view` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/articlesQuery.ts` | `articlesQueryOptions` | DYNAMIC_URL_REVIEW | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/auth.ts` | `authApi` | `/api/v1/auth/change-password`, `/api/v1/auth/login`, `/api/v1/auth/logout`, `/api/v1/auth/password-reset-request`, `/api/v1/auth/register`, `/api/v1/auth/registration-promo-preview`, `/api/v1/auth/reset-password`, `/api/v1/auth/set-password`, `/api/v1/auth/vk`, `/api/v1/auth/vk-consent`, `/api/v1/auth/vk-consent/${encodeURIComponent`, `/api/v1/auth/vk-link`, `/api/v1/auth/vk-phone-set`, `/api/v1/user/profile` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/client-context.ts` | `getMobileClientHeaders` | DYNAMIC_URL_REVIEW | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/client.ts` | `apiClient`, `apiClientMultipart` | `/api/v1/app-subscription/yookassa/start`, `/api/v1/auth/refresh` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/consultations.ts` | `consultationsApi` | `/api/v1/consultations/book`, `/api/v1/consultations/bookings/${encodeURIComponent`, `/api/v1/consultations/cynologists`, `/api/v1/consultations/cynologists/${encodeURIComponent`, `/api/v1/consultations/my${q}` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/courseParticipation.ts` | `getCourseStartedUsersCount` | DYNAMIC_URL_REVIEW | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/courses.ts` | `coursesApi` | `/api/v1/courses`, `/api/v1/courses/${type}`, `/api/v1/courses/access`, `/api/v1/courses/favorites`, `/api/v1/courses/personalization`, `/api/v1/courses/reviews` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/coursesQuery.ts` | `coursesCatalogQueryOptions` | DYNAMIC_URL_REVIEW | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/cynologistChat.ts` | `chatApi`, `uploadChatFile` | `/api/v1/${community`, `/api/v1/${options.community` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/dailyCourse.ts` | `dailyCourseApi`, `getDailyCourseStoreCourseId` | `/api/v1/daily-course/day`, `/api/v1/daily-course/step/complete`, `/api/v1/daily-course/step/pause`, `/api/v1/daily-course/step/reset`, `/api/v1/daily-course/step/resume`, `/api/v1/daily-course/step/start`, `/api/v1/daily-course/today` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/exam.ts` | `examApi` | `/api/v1/exam/result`, `/api/v1/exam/submit`, `/api/v1/exam/upload-video` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/favoritesQuery.ts` | `favoritesQueryOptions` | DYNAMIC_URL_REVIEW | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/feed.ts` | `feedApi`, `feedTransport` | `/api/v1/feed/${path}` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/gafus.ts` | `gafusApi` | `/api/v1/gafus/${path}` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/gallery.ts` | `galleryApi`, `galleryTransport` | `/api/v1/gallery/${path}` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/index.ts` | DYNAMIC_EXPORT_REVIEW | DYNAMIC_URL_REVIEW | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/mobile-intro.ts` | `flushMobileIntroEvents`, `trackMobileIntroAuthOutcome`, `trackMobileIntroEvent` | `/api/v1/mobile-intro/auth-outcome`, `/api/v1/mobile-intro/events` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/notes.ts` | `notesApi` | `/api/v1/notes/student` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/offline.ts` | `offlineApi` | `/api/v1/offline/course/download`, `/api/v1/offline/course/updates`, `/api/v1/offline/course/version` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/onboarding-tour.ts` | `onboardingTourApi` | `/api/v1/user/onboarding-tour`, `/api/v1/user/onboarding-tour/complete` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/partners.ts` | `partnersApi` | `/api/v1/partners/me`, `/api/v1/partners/payouts` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/pet-vet-visits.ts` | `petVetVisitsApi` | `/api/v1/pets/${encodeURIComponent` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/pets.ts` | `parsePetKind`, `petWeightApi`, `petsApi` | `/api/v1/pets`, `/api/v1/pets/${petId}`, `/api/v1/pets/${petId}/documents`, `/api/v1/pets/${petId}/documents/${documentId}`, `/api/v1/pets/${petId}/photo`, `/api/v1/pets/${petId}/prevention`, `/api/v1/pets/${petId}/prevention/${entryId}`, `/api/v1/pets/${petId}/prevention/batch`, `/api/v1/pets/${petId}/weight`, `/api/v1/pets/${petId}/weight/${entryId}`, `/api/v1/pets/${petId}/weight/target` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/profileTabQueries.ts` | `petsQueryOptions`, `pushSubscriptionDeviceStatusQueryOptions`, `studentNotesQueryOptions`, `trainerPublicProfileQueryOptions`, `userProfileQueryOptions` | DYNAMIC_URL_REVIEW | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/public-config-query.ts` | `useMobileAppPublicConfig` | DYNAMIC_URL_REVIEW | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/public-config.ts` | `fetchMobileAppPublicConfig` | `/api/v1/public/mobile-app` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/questions.ts` | `discardQuestionPhoto`, `questionsApi`, `uploadQuestionPhoto` | `/api/v1/questions${path`, `/api/v1/questions/photos` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/reminders.ts` | `remindersApi` | `/api/v1/reminders`, `/api/v1/reminders/${id}` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/subscriptionRequired.ts` | `isSubscriptionRequiredCode`, `notifySubscriptionRequired`, `setSubscriptionRequiredHandler`, `shouldNotifySubscriptionRequired` | DYNAMIC_URL_REVIEW | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/subscriptions.ts` | `subscriptionsApi` | `/api/v1/subscriptions/push`, `/api/v1/subscriptions/push/device-status` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/surveys.ts` | `surveyApi` | `/api/v1/surveys/${encodeURIComponent`, `/api/v1/surveys/comparison` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/training.ts` | `getStepContent`, `trainingApi` | `/api/v1/training/day`, `/api/v1/training/days`, `/api/v1/training/diary`, `/api/v1/training/step/complete/practice`, `/api/v1/training/step/complete/theory`, `/api/v1/training/step/pause`, `/api/v1/training/step/reset`, `/api/v1/training/step/resume`, `/api/v1/training/step/start`, `/api/v1/training/step/status`, `/api/v1/training/video/${encodeURIComponent`, `/api/v1/training/video/url` | AG3 old-native JSON fixture; AG1 response/error compatibility |
| `apps/mobile/src/shared/lib/api/user.ts` | `userApi` | `/api/v1/auth/email-change-request`, `/api/v1/auth/username-available`, `/api/v1/auth/username-change`, `/api/v1/user/account/delete`, `/api/v1/user/account/deletion-code`, `/api/v1/user/avatar`, `/api/v1/user/profile`, `/api/v1/user/profile/public` | AG3 old-native JSON fixture; AG1 response/error compatibility |

## Hono — 205 статических HTTP-деклараций (AG1)

| Method | Path | Source:line | Kind | Gate |
| --- | --- | --- | --- | --- |
| `ALL` | `/api/v1/community-chat/*` | `apps/api/src/routes/v1/community-chat.ts:4` | WILDCARD/DISPATCH | AG1 request/response/error/auth/owner/side-effect + tests |
| `ALL` | `/api/v1/cynologist-chat/*` | `apps/api/src/routes/v1/cynologist-chat.ts:5` | WILDCARD/DISPATCH | AG1 request/response/error/auth/owner/side-effect + tests |
| `ALL` | `/api/v1/feed/*` | `apps/api/src/routes/v1/feed.ts:11` | WILDCARD/DISPATCH | AG1 request/response/error/auth/owner/side-effect + tests |
| `ALL` | `/api/v1/gallery/*` | `apps/api/src/routes/v1/gallery.ts:14` | WILDCARD/DISPATCH | AG1 request/response/error/auth/owner/side-effect + tests |
| `ALL` | `/api/v1/pets/:petId/vet-visits` | `apps/api/src/routes/v1/pet-vet-visits.ts:5` | WILDCARD/DISPATCH | AG1 request/response/error/auth/owner/side-effect + tests |
| `ALL` | `/api/v1/pets/:petId/vet-visits/*` | `apps/api/src/routes/v1/pet-vet-visits.ts:8` | WILDCARD/DISPATCH | AG1 request/response/error/auth/owner/side-effect + tests |
| `ALL` | `/api/v1/questions/*` | `apps/api/src/routes/v1/questions.ts:12` | WILDCARD/DISPATCH | AG1 request/response/error/auth/owner/side-effect + tests |
| `ALL` | `/api/v1/stream-chat/webhook/*` | `apps/api/src/routes/v1/cynologist-chat.ts:5` | WILDCARD/DISPATCH | AG1 request/response/error/auth/owner/side-effect + tests |
| `ALL` | `/internal/feed/*` | `apps/api/src/routes/internal/feed.ts:6` | WILDCARD/DISPATCH | AG1 request/response/error/auth/owner/side-effect + tests |
| `ALL` | `/internal/gallery/*` | `apps/api/src/routes/internal/gallery.ts:6` | WILDCARD/DISPATCH | AG1 request/response/error/auth/owner/side-effect + tests |
| `DELETE` | `/api/v1/consultations/trainer/day-offs/:dayOffId` | `apps/api/src/routes/v1/consultations.ts:368` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `DELETE` | `/api/v1/consultations/trainer/exceptions/:exceptionId` | `apps/api/src/routes/v1/consultations.ts:399` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `DELETE` | `/api/v1/courses/reviews` | `apps/api/src/routes/v1/courses.ts:288` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `DELETE` | `/api/v1/pets/:petId` | `apps/api/src/routes/v1/pets.ts:439` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `DELETE` | `/api/v1/pets/:petId/documents/:documentId` | `apps/api/src/routes/v1/pets.ts:363` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `DELETE` | `/api/v1/pets/:petId/prevention/:entryId` | `apps/api/src/routes/v1/pet-prevention.ts:123` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `DELETE` | `/api/v1/pets/:petId/weight/:entryId` | `apps/api/src/routes/v1/pets.ts:213` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `DELETE` | `/api/v1/reminders/:id` | `apps/api/src/routes/v1/reminders.ts:124` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `DELETE` | `/api/v1/subscriptions/push` | `apps/api/src/routes/v1/subscriptions.ts:101` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/achievements/` | `apps/api/src/routes/v1/achievements.ts:31` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/achievements/training-dates` | `apps/api/src/routes/v1/achievements.ts:17` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/achievements/user` | `apps/api/src/routes/v1/achievements.ts:33` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/app-subscription/offer` | `apps/api/src/routes/v1/app-subscription.ts:106` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/app-subscription/status` | `apps/api/src/routes/v1/app-subscription.ts:90` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/app-subscription/user` | `apps/api/src/routes/v1/app-subscription.ts:291` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/articles/` | `apps/api/src/routes/v1/articles.ts:36` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/articles/:slug` | `apps/api/src/routes/v1/articles.ts:116` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/articles/user` | `apps/api/src/routes/v1/articles.ts:118` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/auth/me` | `apps/api/src/routes/v1/auth.ts:331` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/auth/user` | `apps/api/src/routes/v1/auth.ts:930` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/auth/username-available` | `apps/api/src/routes/v1/auth.ts:905` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/auth/vk-consent/:contextToken` | `apps/api/src/routes/v1/auth.ts:569` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/community-chat/user` | `apps/api/src/routes/v1/community-chat.ts:11` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/consultations/admin/bookings` | `apps/api/src/routes/v1/consultations.ts:439` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/consultations/admin/cynologists` | `apps/api/src/routes/v1/consultations.ts:414` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/consultations/cynologists` | `apps/api/src/routes/v1/consultations.ts:141` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/consultations/cynologists/:cynologistUserId/slots` | `apps/api/src/routes/v1/consultations.ts:167` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/consultations/cynologists/:cynologistUserId/slots/:slotId/verify` | `apps/api/src/routes/v1/consultations.ts:152` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/consultations/my` | `apps/api/src/routes/v1/consultations.ts:220` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/consultations/trainer/availability` | `apps/api/src/routes/v1/consultations.ts:322` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/consultations/trainer/bookings` | `apps/api/src/routes/v1/consultations.ts:246` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/consultations/user` | `apps/api/src/routes/v1/consultations.ts:429` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/courses/` | `apps/api/src/routes/v1/courses.ts:33` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/courses/access` | `apps/api/src/routes/v1/courses.ts:59` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/courses/favorites` | `apps/api/src/routes/v1/courses.ts:85` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/courses/metadata` | `apps/api/src/routes/v1/courses.ts:173` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/courses/reviews` | `apps/api/src/routes/v1/courses.ts:202` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/courses/user` | `apps/api/src/routes/v1/courses.ts:290` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/cynologist-chat/user` | `apps/api/src/routes/v1/cynologist-chat.ts:12` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/daily-course/day` | `apps/api/src/routes/v1/daily-course.ts:90` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/daily-course/today` | `apps/api/src/routes/v1/daily-course.ts:78` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/daily-course/user` | `apps/api/src/routes/v1/daily-course.ts:172` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/exam/result` | `apps/api/src/routes/v1/exam.ts:67` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/exam/user` | `apps/api/src/routes/v1/exam.ts:143` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/feed-playback/:mediaId` | `apps/api/src/app.ts:117` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/feed/user` | `apps/api/src/routes/v1/feed.ts:12` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/gafus/admin/dashboard` | `apps/api/src/routes/v1/gafus-admin.ts:45` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/gafus/admin/user` | `apps/api/src/routes/v1/gafus-admin.ts:77` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/gafus/history` | `apps/api/src/routes/v1/gafus.ts:65` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/gafus/mini-guide/:courseId` | `apps/api/src/routes/v1/gafus.ts:127` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/gafus/mini-guides` | `apps/api/src/routes/v1/gafus.ts:118` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/gafus/reaction-progress/:postId` | `apps/api/src/routes/v1/gafus.ts:106` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/gafus/status` | `apps/api/src/routes/v1/gafus.ts:55` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/gafus/user` | `apps/api/src/routes/v1/gafus.ts:130` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/gallery/user` | `apps/api/src/routes/v1/gallery.ts:15` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/media-delivery/status` | `apps/api/src/routes/v1/media-delivery.ts:10` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/mobile-intro/admin/report` | `apps/api/src/routes/v1/mobile-intro.ts:55` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/mobile-intro/user` | `apps/api/src/routes/v1/mobile-intro.ts:46` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/notes/student` | `apps/api/src/routes/v1/notes.ts:8` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/notes/user` | `apps/api/src/routes/v1/notes.ts:10` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/offline/course/download` | `apps/api/src/routes/v1/offline.ts:82` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/offline/course/updates` | `apps/api/src/routes/v1/offline.ts:54` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/offline/course/version` | `apps/api/src/routes/v1/offline.ts:31` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/offline/user` | `apps/api/src/routes/v1/offline.ts:84` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/partners/me` | `apps/api/src/routes/v1/partners.ts:27` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/partners/user` | `apps/api/src/routes/v1/partners.ts:47` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/payments/apple/course-metadata` | `apps/api/src/routes/v1/payments.ts:16` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/pets/` | `apps/api/src/routes/v1/pets.ts:159` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/pets/:petId` | `apps/api/src/routes/v1/pets.ts:234` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/pets/:petId/documents` | `apps/api/src/routes/v1/pets.ts:295` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/pets/:petId/documents/:documentId/download` | `apps/api/src/routes/v1/pets.ts:395` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/pets/:petId/prevention` | `apps/api/src/routes/v1/pet-prevention.ts:28` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/pets/:petId/weight` | `apps/api/src/routes/v1/pets.ts:188` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/pets/user` | `apps/api/src/routes/v1/pet-prevention.ts:125` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/pets/user` | `apps/api/src/routes/v1/pet-vet-visits.ts:13` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/pets/user` | `apps/api/src/routes/v1/pets.ts:441` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/public/courses/` | `apps/api/src/routes/v1/public-courses.ts:13` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/public/mobile-app` | `apps/api/src/routes/v1/public-mobile.ts:14` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/questions/user` | `apps/api/src/routes/v1/questions.ts:18` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/reminders/` | `apps/api/src/routes/v1/reminders.ts:58` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/reminders/user` | `apps/api/src/routes/v1/reminders.ts:126` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/rewarded-ads/status` | `apps/api/src/routes/v1/rewarded-ads.ts:145` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/rewarded-ads/user` | `apps/api/src/routes/v1/rewarded-ads.ts:205` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/stream-chat/webhook/user` | `apps/api/src/routes/v1/cynologist-chat.ts:12` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/subscriptions/push` | `apps/api/src/routes/v1/subscriptions.ts:61` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/subscriptions/user` | `apps/api/src/routes/v1/subscriptions.ts:103` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/surveys/:slug` | `apps/api/src/routes/v1/surveys.ts:87` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/surveys/comparison` | `apps/api/src/routes/v1/surveys.ts:75` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/surveys/user` | `apps/api/src/routes/v1/surveys.ts:118` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/training/day` | `apps/api/src/routes/v1/training.ts:284` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/training/days` | `apps/api/src/routes/v1/training.ts:256` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/training/diary` | `apps/api/src/routes/v1/training.ts:691` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/training/user` | `apps/api/src/routes/v1/training.ts:992` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/training/video/:videoId/manifest` | `apps/api/src/routes/v1/training.ts:1127` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/training/video/:videoId/manifest.m3u8` | `apps/api/src/routes/v1/training.ts:1128` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/training/video/:videoId/progress` | `apps/api/src/routes/v1/training.ts:961` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/training/video/:videoId/segment` | `apps/api/src/routes/v1/training.ts:1133` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/user/onboarding-tour` | `apps/api/src/routes/v1/user.ts:148` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/user/profile` | `apps/api/src/routes/v1/user.ts:131` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/user/profile/public` | `apps/api/src/routes/v1/user.ts:40` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/api/v1/user/user` | `apps/api/src/routes/v1/user.ts:264` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/health` | `apps/api/src/routes/v1/health.ts:16` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/metrics/course-cache` | `apps/api/src/routes/v1/health.ts:35` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `GET` | `/ready` | `apps/api/src/routes/v1/health.ts:24` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `PATCH` | `/api/v1/courses/reviews` | `apps/api/src/routes/v1/courses.ts:264` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `PATCH` | `/api/v1/gafus/admin/settings` | `apps/api/src/routes/v1/gafus-admin.ts:54` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/app-subscription/apple/restore` | `apps/api/src/routes/v1/app-subscription.ts:289` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/app-subscription/apple/verify` | `apps/api/src/routes/v1/app-subscription.ts:277` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/app-subscription/promo-code/preview` | `apps/api/src/routes/v1/app-subscription.ts:124` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/app-subscription/yookassa/cancel` | `apps/api/src/routes/v1/app-subscription.ts:255` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/app-subscription/yookassa/start` | `apps/api/src/routes/v1/app-subscription.ts:154` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/articles/:id/like` | `apps/api/src/routes/v1/articles.ts:56` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/articles/:slug/view` | `apps/api/src/routes/v1/articles.ts:89` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/auth/change-password` | `apps/api/src/routes/v1/auth.ts:884` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/auth/check-phone-match` | `apps/api/src/routes/v1/auth.ts:452` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/auth/email-change-confirm` | `apps/api/src/routes/v1/auth.ts:527` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/auth/email-change-request` | `apps/api/src/routes/v1/auth.ts:506` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/auth/login` | `apps/api/src/routes/v1/auth.ts:167` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/auth/logout` | `apps/api/src/routes/v1/auth.ts:420` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/auth/password-reset-request` | `apps/api/src/routes/v1/auth.ts:462` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/auth/refresh` | `apps/api/src/routes/v1/auth.ts:339` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/auth/register` | `apps/api/src/routes/v1/auth.ts:230` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/auth/registration-promo-preview` | `apps/api/src/routes/v1/auth.ts:315` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/auth/reset-password` | `apps/api/src/routes/v1/auth.ts:486` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/auth/set-password` | `apps/api/src/routes/v1/auth.ts:855` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/auth/username-change` | `apps/api/src/routes/v1/auth.ts:923` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/auth/vk` | `apps/api/src/routes/v1/auth.ts:578` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/auth/vk-consent` | `apps/api/src/routes/v1/auth.ts:702` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/auth/vk-link` | `apps/api/src/routes/v1/auth.ts:791` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/auth/vk-phone-set` | `apps/api/src/routes/v1/auth.ts:764` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/consultations/book` | `apps/api/src/routes/v1/consultations.ts:198` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/consultations/bookings/:bookingId/cancel` | `apps/api/src/routes/v1/consultations.ts:231` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/consultations/bookings/:bookingId/voximplant/admission` | `apps/api/src/routes/v1/consultations.ts:122` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/consultations/bookings/:bookingId/voximplant/prepare` | `apps/api/src/routes/v1/consultations.ts:113` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/consultations/bookings/:bookingId/voximplant/sign` | `apps/api/src/routes/v1/consultations.ts:130` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/consultations/trainer/bookings/:bookingId/complete` | `apps/api/src/routes/v1/consultations.ts:275` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/consultations/trainer/bookings/:bookingId/confirm` | `apps/api/src/routes/v1/consultations.ts:260` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/consultations/trainer/bookings/:bookingId/no-show` | `apps/api/src/routes/v1/consultations.ts:290` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/consultations/trainer/bookings/:bookingId/reject` | `apps/api/src/routes/v1/consultations.ts:305` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/consultations/trainer/day-offs` | `apps/api/src/routes/v1/consultations.ts:352` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/consultations/trainer/exceptions` | `apps/api/src/routes/v1/consultations.ts:383` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/courses/favorites` | `apps/api/src/routes/v1/courses.ts:104` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/courses/personalization` | `apps/api/src/routes/v1/courses.ts:146` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/courses/reviews` | `apps/api/src/routes/v1/courses.ts:232` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/cynologist-chat/` | `apps/api/src/routes/v1/cynologist-chat.ts:20` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/daily-course/step/complete` | `apps/api/src/routes/v1/daily-course.ts:170` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/daily-course/step/pause` | `apps/api/src/routes/v1/daily-course.ts:128` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/daily-course/step/reset` | `apps/api/src/routes/v1/daily-course.ts:157` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/daily-course/step/resume` | `apps/api/src/routes/v1/daily-course.ts:144` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/daily-course/step/start` | `apps/api/src/routes/v1/daily-course.ts:112` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/exam/submit` | `apps/api/src/routes/v1/exam.ts:111` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/exam/upload-video` | `apps/api/src/routes/v1/exam.ts:141` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/gafus/admin/adjust` | `apps/api/src/routes/v1/gafus-admin.ts:69` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/gafus/unlock` | `apps/api/src/routes/v1/gafus.ts:89` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/mobile-intro/auth-outcome` | `apps/api/src/routes/v1/mobile-intro.ts:44` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/mobile-intro/events` | `apps/api/src/routes/v1/mobile-intro.ts:38` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/partners/attribution` | `apps/api/src/routes/v1/partners.ts:36` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/partners/payouts` | `apps/api/src/routes/v1/partners.ts:42` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/payments/apple/verify` | `apps/api/src/routes/v1/payments.ts:15` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/payments/create` | `apps/api/src/routes/v1/payments.ts:14` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/pets/` | `apps/api/src/routes/v1/pets.ts:174` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/pets/:petId/documents` | `apps/api/src/routes/v1/pets.ts:315` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/pets/:petId/photo` | `apps/api/src/routes/v1/pets.ts:259` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/pets/:petId/prevention` | `apps/api/src/routes/v1/pet-prevention.ts:47` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/pets/:petId/prevention/batch` | `apps/api/src/routes/v1/pet-prevention.ts:71` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/pets/:petId/weight` | `apps/api/src/routes/v1/pets.ts:196` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/reminders/` | `apps/api/src/routes/v1/reminders.ts:69` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/rewarded-ads/events` | `apps/api/src/routes/v1/rewarded-ads.ts:183` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/rewarded-ads/grant` | `apps/api/src/routes/v1/rewarded-ads.ts:202` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/rewarded-ads/session` | `apps/api/src/routes/v1/rewarded-ads.ts:164` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/stream-chat/webhook/` | `apps/api/src/routes/v1/cynologist-chat.ts:20` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/subscriptions/push` | `apps/api/src/routes/v1/subscriptions.ts:72` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/subscriptions/push/device-status` | `apps/api/src/routes/v1/subscriptions.ts:85` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/surveys/:slug/response` | `apps/api/src/routes/v1/surveys.ts:112` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/training/diary` | `apps/api/src/routes/v1/training.ts:668` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/training/step/complete/practice` | `apps/api/src/routes/v1/training.ts:569` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/training/step/complete/theory` | `apps/api/src/routes/v1/training.ts:619` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/training/step/pause` | `apps/api/src/routes/v1/training.ts:386` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/training/step/reset` | `apps/api/src/routes/v1/training.ts:500` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/training/step/resume` | `apps/api/src/routes/v1/training.ts:444` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/training/step/start` | `apps/api/src/routes/v1/training.ts:328` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/training/video/:videoId/progress` | `apps/api/src/routes/v1/training.ts:986` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/training/video/url` | `apps/api/src/routes/v1/training.ts:714` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/user/account/delete` | `apps/api/src/routes/v1/user.ts:260` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/user/account/deletion-code` | `apps/api/src/routes/v1/user.ts:226` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/user/avatar` | `apps/api/src/routes/v1/user.ts:187` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `POST` | `/api/v1/user/onboarding-tour/complete` | `apps/api/src/routes/v1/user.ts:160` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `PUT` | `/api/v1/consultations/admin/cynologists/listed` | `apps/api/src/routes/v1/consultations.ts:423` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `PUT` | `/api/v1/consultations/trainer/availability` | `apps/api/src/routes/v1/consultations.ts:336` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `PUT` | `/api/v1/pets/:petId` | `apps/api/src/routes/v1/pets.ts:419` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `PUT` | `/api/v1/pets/:petId/documents/:documentId` | `apps/api/src/routes/v1/pets.ts:387` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `PUT` | `/api/v1/pets/:petId/prevention/:entryId` | `apps/api/src/routes/v1/pet-prevention.ts:98` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `PUT` | `/api/v1/pets/:petId/weight/target` | `apps/api/src/routes/v1/pets.ts:221` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `PUT` | `/api/v1/reminders/:id` | `apps/api/src/routes/v1/reminders.ts:98` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |
| `PUT` | `/api/v1/user/profile` | `apps/api/src/routes/v1/user.ts:172` | DIRECT_DECLARATION | AG1 request/response/error/auth/owner/side-effect + tests |

## Незакрытые операции: как закрывать 1:1

1. Владелец UI помечает для каждой строки: legacy behavior, DTO, permission, side effect, новый URL/file, feature test, browser/native E2E ID. Если удаляется — отдельный утверждённый ADR.
2. AG1 для каждого Next API, server action export и Mobile adapter связывает метод с существующим Hono+Core или создаёт согласованную additive API карточку. Совпадение path не доказывает DTO; wildcard dispatcher надо расписывать по action.
3. AG3 защищает старые native response/error fixtures; AG4 фиксирует Trainer/Admin roles, audit, finance и non-prod integration.
4. Закрытие операции только по коду+тестам: DONE_VERIFIED; без выполнения — PARTIAL/BLOCKED/UNKNOWN. Этот snapshot никогда не переписывать для косметического уменьшения незакрытых строк.
5. Проверки: `python3 scripts/refactor/parallel_baseline.py --verify`, `node scripts/refactor/render_operations.mjs --check`, `node scripts/refactor/verify_parallel_freeze.mjs`.
