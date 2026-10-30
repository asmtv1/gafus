# Web SPA — route-level code splitting (2026-10-29)

Scope: `apps/web-vite` **only** in GAFUS Refactor. No production writes, deployment or push.

## Baseline and result

Measured from local Vite 8 production `pnpm --filter @gafus/web-vite build`, before and after the change (not the dev server's source modules):

| Build metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Main `dist/assets/index-*.js`, minified raw | 1,373.68 kB | 335.75 kB | **−75.6%** |
| Main JS, gzip (Vite reported) | 377.29 kB | 102.75 kB | **−72.8%** |

The HTML entry now module-preloads only common runtime/auth dependencies. Heavy route chunks such as `ProfileOverview`, `CourseCatalog`, `CourseOverview`, `PetDetails`, `TrainingIndexOptInHarness`, `DailyCourseOptInHarness` and `ConsultationsLivePage` are no longer present in that preload list. This does not claim a measured end-user LCP or byte count for every route; each selected route still downloads its own code and shared dependencies on demand.

## Implementation

- `apps/web-vite/src/App.tsx`: converted 23 screen imports from static to `React.lazy(() => import(...))`, on top of existing split Moments, Questions, Chat, articles and public-profile routes. Their behavior/props, API, routing and session fences were retained.
- Kept the App-owned session/authorization checks **eager**. The lazy component boundary is *inside* the owner gate, so no protected API request should occur before authorization.
- Added a route-keyed Suspense/loading and chunk-error boundary to the MainView screen area. A failed chunk offers a full-page reload rather than an infinite loading state; the existing Web `Loading` component is reused.
- Preserved current independent HLS, Voximplant and admin chunks. Their sizes are not the initial Web `index` size; no artificial manual vendor grouping was imposed.
- `scripts/refactor/vite-preview-smoke.test.mjs`: extended the built-artifact test with a **500,000-byte main JS budget**, named heavy-route chunk checks and preload guards, to catch accidental regression to eager imports.
- `apps/web-vite/src/App.test.tsx`: assertions wait for lazily mounted components' actual Hono requests/results rather than assuming an immediate first render.

## Verification

- `pnpm --filter @gafus/web-vite typecheck`: PASS.
- `pnpm --filter @gafus/web-vite build`: PASS.
- `node --test scripts/refactor/vite-preview-smoke.test.mjs`: PASS (static SPA deep links, no dev proxy/PWA, route chunks/budget).
- `pnpm --filter @gafus/web-vite exec vitest run src/App.test.tsx --maxWorkers=1`: PASS (15/15, including real App route navigation with Hono-shaped mock transport).

## Дополнение 30.10.2026 — независимый Agent 3

В текущем состоянии после отдельной чистой сборки Web основной `index-*.js` был измерен в **281 943 B raw / 86 041 B gzip** против нового локального baseline **335 753 B raw / 101 483 B gzip** непосредственно до guest-only splitting (−53 810 B raw). В `apps/web-vite/src/App.tsx` дополнительно отложены `AuthPanel`, `PublicLanding`, `EmailConfirmPage`, `PasswordRecovery`, `VkConsentWeb`, `ExcusesOptIn`; auth/session fences остались eagerly mounted. В `scripts/refactor/vite-preview-smoke.test.mjs` проверяются guest-only chunks и отсутствие eager HTML preload. Сборка Web + route smoke + 15 App mounted тестов подтвердились; Chromium 1280/390 проверил публичный контент и SPA переход `/login` → `/register` с локальным synthetic API. После смены import username-контракта на публичный `@gafus/types` повторная Web-сборка **exit 0**, финальный entry `index-3DCltMfn.js`: **281 931 B raw / 86 023 B gzip** (−12/−18 B относительно перед этим записанного entry). Ни эти замеры, ни Chromium synthetic не равны production LCP/INP. Источник команд, ограничений и контрольные результаты: [NIGHT_AGENT_3_2026-10-30](../architecture/NIGHT_AGENT_3_2026-10-30.md).

## Follow-ups / separate budgets

The global base CSS remains comparatively large (`index-*.css` ~461 kB raw / ~78 kB gzip); this change targeted JS, and CSS restructuring requires a separate visual regression cycle. Optional HLS (~508 kB raw) and Voximplant (~424 kB raw) are already separate asynchronously loaded chunks. Confirm LCP/INP and transfer bytes on actual devices and production-like CDN/network before making claims about real-world user latency.
