# Матрица миграции: Core vs прямой Prisma

**Цель:** Все Route Handlers и shared/lib используют только `@gafus/core`; прямой prisma — только в packages.

**Источник:** План architecture-core-refactor-plan.md, разделы 2.2 и 2.3.

---

## Колонки

| Route/File path | Source | Uses Core | Uses Prisma | Status | Priority |
|-----------------|--------|-----------|-------------|--------|----------|
| Путь к файлу | web/api | Y/N | Y/N | migrated / TODO / N/A | high / medium / low |

**Priority:**
- **high** — дублирование логики между web и api
- **medium** — тонкая обёртка, небольшой рефактор
- **low** — уже через core, только документация / verify

---

## apps/web — Route Handlers

| Route/File path | Source | Uses Core | Uses Prisma | Status | Priority |
|-----------------|--------|-----------|-------------|--------|----------|
| `app/api/v1/courses/route.ts` | web | Y | N | migrated | low |
| `app/api/v1/courses/access/route.ts` | web | Y | N | migrated | low |
| `app/api/v1/courses/favorites/route.ts` | web | Y | N | migrated | low |
| `app/api/v1/courses/metadata/route.ts` | web | Y | N | migrated | low |
| `app/api/v1/courses/reviews/route.ts` | web | Y | N | migrated | low |
| `app/api/v1/training/days/route.ts` | web | Y | N | migrated | low |
| `app/api/v1/training/day/route.ts` | web | Y | N | migrated | low |
| `app/api/v1/training/step/*` | web | Y | N | migrated | low |
| `app/api/v1/pets/route.ts` | web | Y | N | migrated | low |
| `app/api/v1/pets/[petId]/route.ts` | web | Y | N | migrated | low |
| `app/api/v1/user/profile/route.ts` | web | Y | N | migrated | low |
| `app/api/v1/user/preferences/route.ts` | web | Y | N | migrated | low |
| `app/api/v1/user/avatar/route.ts` | web | Y | N | migrated | low |
| `app/api/v1/subscriptions/push/route.ts` | web | Y | N | migrated | low |
| `app/api/v1/payments/create/route.ts` | web | Y | N | migrated | low |
| `app/api/v1/payments/webhook/route.ts` | web | Y | Y | TODO | medium |
| `app/api/v1/auth/register/route.ts` | web | Y | N | migrated | low |
| `app/api/v1/auth/password-reset-request/route.ts` | web | Y | N | migrated | low |
| `app/api/v1/auth/reset-password/route.ts` | web | Y | N | migrated | low |
| `app/api/track-presentation/route.ts` | web | Y | N | migrated | low |
| `app/api/track-presentation-event/route.ts` | web | Y | N | migrated | low |
| `app/api/track-reengagement-click/route.ts` | web | Y | N | migrated | low |
| `app/api/video/[videoId]/manifest/route.ts` | web | Y | N | migrated | low |
| `app/api/video/[videoId]/segment/route.ts` | web | Y | N | migrated | low |

---

## apps/web — shared/lib (прямой prisma)

| Route/File path | Source | Uses Core | Uses Prisma | Status | Priority |
|-----------------|--------|-----------|-------------|--------|----------|
| `shared/lib/pets/getUserPets.ts` | web | Y | N | migrated | low |
| `shared/lib/pets/createPet.ts` | web | Y | N | migrated | low |
| `shared/lib/pets/updatePet.ts` | web | Y | N | migrated | low |
| `shared/lib/pets/deletePet.ts` | web | Y | N | migrated | low |
| `shared/lib/pets/savePet.ts` | web | Y | N | migrated | low |
| `shared/lib/pets/updatePetAvatar.ts` | web | Y | N | verify | low |
| `shared/lib/savePushSubscription/savePushSubscription.ts` | web | Y | N | migrated | low |
| `shared/lib/savePushSubscription/deletePushSubscription.ts` | web | Y | N | migrated | low |
| `shared/lib/savePushSubscription/getUserSubscriptionStatus.ts` | web | Y | N | migrated | low |
| `shared/lib/actions/trackPresentationView.ts` | web | Y | N | migrated | low |
| `shared/lib/actions/trackPresentationEvent.ts` | web | Y | N | migrated | low |
| `shared/lib/actions/trackReengagementClick.ts` | web | Y | N | migrated | low |
| `shared/lib/training/updateUserStepStatus.ts` | web | Y | N | migrated | low |
| `shared/lib/training/markPracticeStepAsCompleted.ts` | web | Y | N | migrated | low |
| `shared/lib/training/markTheoryStepAsCompleted.ts` | web | Y | N | migrated | low |
| `shared/lib/training/markDiaryStepAsCompleted.ts` | web | Y | N | migrated | low |
| `shared/lib/training/pauseResumeUserStep.ts` | web | Y | N | migrated | low |
| `shared/lib/training/startUserStepServerAction.ts` | web | Y | N | migrated | low |
| `shared/lib/training/checkDayAccess.ts` | web | Y | N | migrated | low |
| `shared/lib/user/getUserProgress.ts` | web | N | Y | TODO | medium |
| `shared/lib/user/userCourses.ts` | web | Y | Y | TODO | medium |
| `shared/lib/user/getUserWithTrainings.ts` | web | N | Y | TODO | medium |
| `shared/lib/video/getVideoMetadata.ts` | web | N | Y | TODO | medium |
| `shared/lib/video/getVideoUrlForPlayback.ts` | web | N | Y | TODO | medium |
| `shared/lib/actions/cachedCourses.ts` | web | Y | Y | TODO | medium |
| `shared/lib/actions/updateReengagementSettings.ts` | web | N | Y | TODO | medium |
| `shared/lib/actions/trainingReminders.ts` | web | N | Y | TODO | medium |
| `shared/lib/actions/uploadExamVideo.ts` | web | N | Y | TODO | medium |
| `shared/lib/actions/submitExamResult.ts` | web | N | Y | TODO | medium |
| `shared/lib/actions/getExamResult.ts` | web | N | Y | TODO | medium |
| `shared/lib/actions/getVideoIdFromUrlAction.ts` | web | N | Y | TODO | medium |
| `shared/lib/actions/offlineCourseActions.ts` | web | Y | Y | TODO | medium |
| `shared/lib/achievements/getUserTrainingDates.ts` | web | Y | N | migrated | low |
| `shared/server-actions/subscriptions.ts` | web | Y | N | migrated | low |
| `shared/lib/validation/petSchemas.ts` | web | N | N | N/A (типы Prisma) | low |

---

## apps/api — routes

| Route/File path | Source | Uses Core | Uses Prisma | Status | Priority |
|-----------------|--------|-----------|-------------|--------|----------|
| `routes/v1/auth.ts` | api | N | Y | TODO (login, refresh, register) | medium |
| `routes/v1/training.ts` | api | Y | Y | partially migrated (theory, video) | medium |
| `routes/v1/user.ts` | api | Y | Y | TODO (avatar?) | medium |
| `routes/v1/payments.ts` | api | Y | Y | TODO | medium |
| `routes/v1/health.ts` | api | N | Y | N/A (инфраструктура) | low |
| `index.ts` (shutdown prisma) | api | N | Y | N/A (shutdown) | low |

---

## Сводка по приоритетам

| Priority | Count | Примеры |
|----------|-------|--------|
| high | 0 | — |
| medium | 22 | training steps, user, payments, video metadata |
| low | 33 | pets, push, tracking, auth, video manifest, subscriptions |

---

_Последнее обновление: Step 10 (training, achievements). Оставшиеся TODO: user, video, actions, payments._
