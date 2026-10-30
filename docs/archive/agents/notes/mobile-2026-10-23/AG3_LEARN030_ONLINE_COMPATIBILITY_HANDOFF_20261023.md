# AG3-LEARN030 — original Native online-progress backward-compatibility handoff
2026-10-23 · GAFUS Refactor · branch `vite` · **source-only, no new tests or live execution**

## Verdict and scope

**No confirmed AUTHORIZE_NOW broken request format** in the four existing online actions **start, pause, resume, complete**. The Mobile `trainingApi` request fields and paths match the currently registered Hono request validators and handlers. **No Mobile adapter, schema/endpoint change or compatibility fix is justified by this comparison.**

Exact checked sources: `apps/mobile/src/shared/lib/api/training.ts` (types lines 90–112; operations 157–233), already-approved online call sites in `apps/mobile/app/(main)/training/[courseType]/[dayId].tsx` (approx. lines 355–363, 393–400, 435–440, 520–529 and 617–625), Hono `apps/api/src/routes/v1/training.ts` (common errors/access 170–245, schemas+handlers 322–489 and 559–660), `apps/api/src/app.ts` (311–313). The separate `useVerifiedOnlineCompletion.ts` is an ephemeral UI confirmation keyed by profile identity, epoch, scope and step index; **not a durable offline receipt or network proof**.

Source evidence was read only: no handler invoked; no tests, SQL, builds, native device or browser used. This checkpoint does not inspect nativeCAS, auth/client implementation, offlineStartV2, offlineTransitions, queues/replay/dequeue, persisted storage, payment/subscription providers, notifications, media or closed protocol.

## Existing online course/day prerequisites (context only)

1. Mobile `trainingApi.getDays(courseType)` -> `GET /api/v1/training/days?type=...`. Hono accepts optional query `type:string`; success envelope `{"success":true,"data":...}`.
2. Mobile `trainingApi.getDay(courseType,dayOnCourseId,createIfMissing=true)` -> `GET /api/v1/training/day?courseType=...&dayOnCourseId=...&createIfMissing=true|false`. Server expects nonempty `courseType`, CUID `dayOnCourseId` and boolean query string. **Default difference when omitted:** Mobile explicitly sends `true` by default; the server transforms omitted `createIfMissing` to `false`. Do not omit this Mobile parameter in a Web rewrite and assume equivalent semantics.
3. AG1 existing `AG1_TRAINING_ONLINE_READ_REAL_PG_20261023.md` confirms real PostgreSQL/Core READ for signed GET days/day and selected access cohorts using `createIfMissing=false`. It explicitly **does not** prove the four progress POST writes, paid active-subscription write, actual original Native binary or browser. Do not promote AG1 READ evidence into POST acceptance.
4. Online day screen uses `useStartStep`, `usePauseStep`, `useResumeStep` and `useCompleteTheoryStep`/`useCompletePracticeStep` and sends the fields below. Those hooks' private/offline implementations are NOT audited here. POST uses **courseId**, whereas day GET uses **courseType**.

## Existing registered POST contract matrix (must preserve for old Native builds)

All methods in `training.ts` use the existing `apiClient<void>`, HTTP POST, JSON body and option `suppressSubscriptionPaywall:true`. Registered base route is `/api/v1/training` with auth middleware. Maintain the existing bearer-compatible JSON route; transport header generation itself was not re-inspected.

| Action / Mobile method | Exact POST suffix | Existing Mobile body | Hono schema / Core operation | Compatibility note |
|---|---|---|---|---|
| Start / `startStep(StartStepParams)` | `/step/start` | `courseId`, `dayOnCourseId`, `stepIndex`, `status:"IN_PROGRESS"`, `durationSec` | Same three IDs, required integer `durationSec>=0`, **optional** literal `status:"IN_PROGRESS"`; Core `type:"start", remainingSec:durationSec` | Mobile currently includes `status`; do not reject it, require new fields or rename `durationSec`. |
| Pause / `pauseStep(PauseStepParams)` | `/step/pause` | Three IDs, `timeLeftSec` | Same three IDs, required integer `timeLeftSec>=0`; Core `type:"pause", remainingSec:timeLeftSec` | **Wire field is timeLeftSec**, not Core internal `remainingSec`. No required `PAUSED` status body field. |
| Resume / `resumeStep(StepActionParams)` | `/step/resume` | Three IDs only | Same three IDs, Core `type:"resume"` | Do not introduce mandatory time/status/client revision/idempotency field for old builds. |
| Complete theory / `completeTheoryStep` | `/step/complete/theory` | Three IDs plus optional `stepTitle` / `stepOrder` | Same three IDs, optional string title and integer order >=0; validates theory before Core `type:"complete"` | Do not collapse into a new completion route or require optional metadata. |
| Complete practice / `completePracticeStep` | `/step/complete/practice` | Same as theory | Same optional title/order schema; Core `type:"complete"` | Keep separate practice route and existing conditional validation. |

Shared required identifiers: `courseId` nonempty **CUID or UUID** (Hono intentionally accepts both), `dayOnCourseId` CUID, `stepIndex` integer >=0. Numeric duration/time fields must be present for their respective operations; zero passes request validation. Optional `status`, `stepTitle`, `stepOrder` may be omitted; explicit JSON `null` is **not accepted** by current non-nullable Zod fields. Do not replace omission by `null` or silently narrow UUID to CUID.

**Normal POST success:** HTTP 200 with JSON **`{"success":true}`**; no mandatory `data`, `step` or `UserTraining` body. Mobile return types are `Promise<ApiResponse<void>>`, and online UI branches check `result.success`. Do not make a Web-specific rich response shape mandatory for old Native; additive Web-only information cannot break these existing action replies.

**Read/null distinction:** Mobile `TrainingDay.userStatus` and `completedAt` can be null; `UserStep.remainingSec` and `completedAt` can be null; step statuses include `NOT_STARTED`, `IN_PROGRESS`, `PAUSED`, `COMPLETED`, `RESET`. These are declared READ/state fields, **not** optional POST bodies for pause/resume. No new exact runtime GET DTO audit was performed in this POST checkpoint.

## Error/status envelope — existing registered behavior

| Condition | Current registered response | Web/Native compatibility invariant |
|---|---|---|
| No authenticated Bearer | HTTP **401**, test for start asserts at least `{success:false,error:"Токен не предоставлен"}` | Keep acceptance of existing Mobile bearer JSON; no cookie-only replacement. |
| Access requires subscription/credits | HTTP **402**, `{success:false,error:<localized>,code:"SUBSCRIPTION_OR_CREDITS_REQUIRED"}` | Remains a refusal even with `suppressSubscriptionPaywall:true` (that flag is a client UI option, **not** an entitlement override). |
| Course access denied / course-day mismatch | HTTP **403**, `{success:false,error:"Нет доступа к курсу",code:"FORBIDDEN"}` | Keep server-side authorization keyed by authenticated actor and IDs. |
| Recognized day/step missing | HTTP **404**, `{success:false,error:"День не найден" or "Шаг не найден",code:"NOT_FOUND"}` | Do not turn missing resources into a successful step. |
| Core error with `INVALID_STATE` prefix | HTTP **409**, `{success:false,error:"Состояние шага уже изменилось. Обновите страницу.",code:"INVALID_STATE"}` | Preserve conflict (not a synthetic HTTP 400 or 200) for concurrent/duplicate mobile actions. |
| Theory validator rejects completion | HTTP **400** or **404** when validator code is `NOT_FOUND`; `{success:false,error:validation.error,code:validation.code}` | Do not apply a new identical theory rule to practice, or hide validation refusals. |
| Invalid JSON request | Rejected by current `zValidator("json", schema)` before handler side-effects, normally HTTP 400 | Exact default validation error-body shape was NOT frozen in this comparison. |
| Unexpected handler exception | HTTP **500** `{success:false,error:"Внутренняя ошибка сервера"}` with no required code | Client must handle an error when `code` is absent, and server must not leak exception details. |

Start/pause/resume/practice handlers currently treat course-status synchronization as best-effort, while theory completion awaits synchronization and may return 500 if it fails. This is a **source-observed handler distinction**, not approval to execute or change notifications/side-effect policy.

## Concrete compatibility differences and AG1 / AG2 action

1. Mobile start `status:"IN_PROGRESS"` is **required in its TypeScript type**, but **optional and currently ignored** by the server handler. **Accept the old field**; do not tighten JSON validation in a Web freeze.
2. Mobile completion can send optional `stepTitle` and `stepOrder` (including the screen's `stepOrder:stepIndex`); API accepts but does not use them in the progress update. **Do not reject or mandate either.**
3. Wire timer names are **`durationSec` on start** and **`timeLeftSec` on pause**, not `remainingSec`. Resume requires neither timer number nor status.
4. API accepts **courseId as CUID or UUID**, **dayOnCourseId as CUID**; Web implementation must not narrow the shared API to only one course ID format.
5. Do not confuse **courseType for GET day** with **courseId for POST progress**. Preserve explicit Mobile `createIfMissing=true` query semantics and existing read nullability.
6. Preserve POST `ApiResponse<void>` / `{success:true}`, and distinct 401/402/403/404/409/theory-validation/500 cases. Do not invent a mandatory output DTO or map invalid-state to success.
7. Existing Mobile step methods do not declare a new `requestGuard` parameter in `training.ts`; approved day UI has its own actor/epoch success checks. This comparison does **not** authorize new transport/auth/queue policy or assert those checks cover every possible old binary.

**AG1 owner:** freeze registered paths, validators, Bearer availability and response/error semantics while implementing Web online progress; existing AG1 real SQL GET proof remains **READ-only**.

**AG2 owner:** use the registered action paths and field names for Web, keeping older bearer Native clients functional alongside any separately authorized Web authentication/session mechanism.

**AG3 result:** **AUTHORIZE_NOW broken business/request format = NONE**. No speculative adapter, no endpoint, no new schema, no source edit. Exact POST parity is at **source-contract** level only.

## Finite next uncovered ORIGINAL LEARN030 online case (no device/system bypass)

Narrow inspection of names in existing `apps/api/src/routes/v1/training.route.test.ts` and `training.validation.test.ts` found start/auth, theory failure/invalid-state and some completion tests, **but no explicitly named success case for online pause→resume**. Existing `apps/mobile/src/shared/lib/api/training.test.ts` visibly tests diary GET, not captured start/pause/resume/complete POST request bodies. This is an **evidence gap, NOT a confirmed production defect**.

**Safe next testable result, once separately assigned:** AG3 (existing Mobile `training.test.ts`) captures exact `apiClient` arguments for pause/resume with `courseId,dayOnCourseId,stepIndex,timeLeftSec` and `suppressSubscriptionPaywall:true`. AG1 (existing API `training.route.test.ts` with existing mocked Core harness) proves the registered pause/resume handlers accept the payloads and return `{success:true}`, plus selected 409/402/403 denial. AG2 consumes the same frozen Web contract. No new test suites, route or queue. This would be **mocked request/handler contract proof**, not real Native device, real write PostgreSQL or actual transport integration.

For end-to-end original Native binary → live HTTP → write-capable DB → Web compatibility, **coordinator + AG1/AG4** must separately authorize native/system execution and isolated database write fixtures. Previous READ-only SQL fixtures provide no authority to perform that write. Do not bypass by modifying offlineCAS, auth internals, providers, queue or storage.

## Exclusions / proof boundary

No execution of tests, Hono handlers, SQL, network requests or builds. No writes outside this own evidence and own journal. No production, Main, commit, push or deploy. No provider/media/security/finance/Vet/nativeCAS/offline storage/protocol/replay/Phase2 work. No claim of original binary/runtime, Android/iOS UI, real HTTP/TLS/SQL write or G1/G2 integration release. Existing gates remain as recorded.

## Exact unchanged source SHA-256 pins

- **Mobile existing API:** `apps/mobile/src/shared/lib/api/training.ts` — `c8c3b71df7224d8ed8b39e7b469cc8fc055d343e5ea67fd582f3cf2e91bfc2e4`
- **Approved Mobile online day screen:** `apps/mobile/app/(main)/training/[courseType]/[dayId].tsx` — `7eebf740f55d71fe1eafaa569acb571b6ba154111fa97b9479d8c4805736c1e9`
- **Online completion UI receipt:** `apps/mobile/src/features/training/useVerifiedOnlineCompletion.ts` — `2ee6bc8922dffaa3565916f8362ab5312ca841fa0507fd5cf76ddd59cceb534f`
- **Registered Hono handlers:** `apps/api/src/routes/v1/training.ts` — `ec7718c4b353328ba3d1ea8ce98cfd91f7bff76e91a1a8513e9987191d64dc84`
- **Registered API base route:** `apps/api/src/app.ts` — `afbc65285b44f2b30cba7822982387d533b93d6e5cce3393b03880943e0b0679`
- **Existing Mobile contract test:** `apps/mobile/src/shared/lib/api/training.test.ts` — `7a98ec54275df0ae91b689d1419c3c2204c52d3f3795d57bdfc8441ab25c84e5`
- **Existing API handler tests:** `apps/api/src/routes/v1/training.route.test.ts` — `6cd14800772274f77cfc2c3bc1c3c7efe2e982686967f19f3e563c402891bbc6`
- **AG1 actual SQL GET-only evidence:** `docs/refactor/agents/evidence/AG1_TRAINING_ONLINE_READ_REAL_PG_20261023.md` — `41e33453d8a7f7a1831994d140b348fba2a592a55be81f5e36781d8c9cbe7bfa`
