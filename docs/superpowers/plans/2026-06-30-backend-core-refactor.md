# Backend Core Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move remaining domain and infrastructure orchestration out of `apps/api` routes into focused `packages/core` services while preserving the current Hono API contract.

**Architecture:** Keep Hono as the HTTP adapter: parse params/body/headers, call core services, map typed results/errors to HTTP. Move payment URL/metadata orchestration, auth session token orchestration, and mobile HLS video playback logic into `packages/core`, where they can be unit tested without Hono. Avoid broad rewrites: each task changes one domain and leaves existing route tests passing.

**Tech Stack:** TypeScript, Hono, Zod, Vitest, Prisma, pnpm workspaces, `@gafus/core`, `@gafus/auth`, `@gafus/cdn-upload`, `@gafus/video-access`.

---

## Scope And Order

Refactor in this order:

1. Payments: lowest risk, small API surface, direct Prisma in `apps/api` can be removed quickly.
2. Video/HLS: highest technical value, currently large route-level infrastructure logic.
3. Auth sessions: larger behavioral surface; do after smaller refactors establish the pattern.
4. Upload constraints: optional cleanup, do last because current API placement is acceptable.

Do not change endpoint URLs, response shapes, status codes, or auth/rate-limit middleware in the same refactor. If a route response changes because a test reveals inconsistent existing behavior, split that into a separate bugfix.

## File Structure

### Payments

- Create: `packages/core/src/services/payments/mobilePaymentApiService.ts`
  - Owns mobile payment creation orchestration: env/config validation, article/course lookup, return URL generation, iOS payment restriction, delegation to existing payment service.
- Create: `packages/core/src/services/payments/mobilePaymentApiService.test.ts`
  - Unit tests for article payment, course payment, iOS restriction, missing config, Apple metadata.
- Modify: `packages/core/src/services/payments/index.ts`
  - Export the new service functions and result types.
- Modify: `apps/api/src/routes/v1/payments.ts`
  - Remove direct Prisma usage and local return URL/config orchestration.
- Modify: `apps/api/src/routes/v1/payments.route.test.ts`
  - Update mocks from low-level services to new API-level core service where appropriate.

### Video/HLS

- Create: `packages/core/src/services/video/mobileHlsService.ts`
  - Owns mobile video playback URL resolution, HLS manifest rewriting, segment path validation, segment download preparation.
- Create: `packages/core/src/services/video/mobileHlsService.test.ts`
  - Unit tests for external URLs, CDN URL extraction failures, signed URL generation, manifest rewrite, segment validation.
- Modify: `packages/core/src/services/video/index.ts`
  - Export the new service functions and result types.
- Modify: `apps/api/src/routes/v1/training.ts`
  - Remove route-level HLS helpers, CDN downloads, token verification, and manifest rewriting.
- Modify: `apps/api/src/routes/v1/training.route.test.ts`
- Modify: `apps/api/src/routes/v1/training.validation.test.ts`
  - Keep route tests focused on HTTP mapping and service invocation.

### Auth Sessions

- Create: `packages/core/src/services/auth/apiSessionService.ts`
  - Owns access/refresh token issuing, refresh rotation, token hash calculation, token reuse handling, session metadata.
- Create: `packages/core/src/services/auth/apiSessionService.test.ts`
  - Unit tests for login token issue, registration token issue, refresh rotation, reuse detection, logout hash revoke.
- Create: `packages/core/src/services/auth/apiVkAuthService.ts`
  - Owns VK platform client resolution, redirect URI generation, VK login token/session flow, VK consent completion.
- Create: `packages/core/src/services/auth/apiVkAuthService.test.ts`
  - Unit tests for iOS/Android/default client IDs, new user consent flow, existing user session issue, consent completion.
- Modify: `packages/core/src/services/auth/index.ts`
  - Export new service functions and result types.
- Modify: `apps/api/src/routes/v1/auth.ts`
  - Remove crypto/token orchestration and VK platform wiring from routes.
- Modify: `apps/api/src/routes/v1/auth.route.test.ts`
  - Expand beyond smoke tests where auth route behavior changes.

### Upload Constraints

- Create: `packages/core/src/services/common/fileConstraints.ts`
  - Central constants and pure validation helpers for image/document uploads.
- Create: `packages/core/src/services/common/fileConstraints.test.ts`
  - Unit tests for accepted/rejected avatar, pet photo, and pet document files.
- Modify: `packages/core/src/services/common/index.ts`
  - Export file constraints.
- Modify: `apps/api/src/routes/v1/pets.ts`
  - Replace local constants/checks with common helpers.
- Modify: `apps/api/src/routes/v1/user.ts`
  - Replace local constants/checks with common helpers.

## Result Pattern

Use explicit result unions for new core orchestration services. Do not throw for expected business outcomes.

```ts
type CoreResult<TData, TCode extends string> =
  | { success: true; data: TData }
  | { success: false; code: TCode; error: string };
```

Route files map `code` to HTTP status. Core services do not import Hono.

---

## Task 1: Payments Core Orchestration

**Files:**
- Create: `packages/core/src/services/payments/mobilePaymentApiService.ts`
- Create: `packages/core/src/services/payments/mobilePaymentApiService.test.ts`
- Modify: `packages/core/src/services/payments/index.ts`
- Modify: `apps/api/src/routes/v1/payments.ts`
- Modify: `apps/api/src/routes/v1/payments.route.test.ts`

- [ ] **Step 1: Add failing tests for payment orchestration**

Create `packages/core/src/services/payments/mobilePaymentApiService.test.ts` with tests covering:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMobilePayment,
  getAppleCoursePurchaseMetadata,
  resolveWebBaseUrl,
} from "./mobilePaymentApiService";

const prismaArticleFindUnique = vi.fn();
const prismaCourseFindUnique = vi.fn();
const getCourseByIdOrTypeMock = vi.fn();
const createPaymentMock = vi.fn();
const createArticlePaymentMock = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    article: { findUnique: prismaArticleFindUnique },
    course: { findUnique: prismaCourseFindUnique },
  },
}));

vi.mock("../course", () => ({
  getCourseByIdOrType: getCourseByIdOrTypeMock,
}));

vi.mock("./paymentService", () => ({
  createPayment: createPaymentMock,
  createArticlePayment: createArticlePaymentMock,
}));

describe("mobile payment api service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEB_APP_URL = "https://gafus.ru";
    process.env.NEXT_PUBLIC_WEB_APP_URL = "";
    process.env.YOOKASSA_SHOP_ID = "shop";
    process.env.YOOKASSA_SECRET_KEY = "secret";
  });

  it("rejects non-https web app urls", () => {
    expect(resolveWebBaseUrl({ WEB_APP_URL: "http://localhost:3000" })).toEqual({
      success: false,
      code: "CONFIG_WEB_APP_URL",
      error: "Платежи недоступны",
    });
  });

  it("creates an article payment with article return url", async () => {
    prismaArticleFindUnique.mockResolvedValueOnce({ slug: "paid-article" });
    createArticlePaymentMock.mockResolvedValueOnce({
      success: true,
      paymentId: "pay_1",
      confirmationUrl: "https://yookassa/confirm",
    });

    await expect(
      createMobilePayment({
        userId: "user-1",
        articleId: "article-1",
        courseId: undefined,
        courseType: undefined,
        clientPlatform: undefined,
        ipAddress: "1.1.1.1",
        userAgent: "test-agent",
      }),
    ).resolves.toEqual({
      success: true,
      data: {
        paymentId: "pay_1",
        confirmationUrl: "https://yookassa/confirm",
      },
    });

    expect(createArticlePaymentMock).toHaveBeenCalledWith({
      userId: "user-1",
      articleId: "article-1",
      shopId: "shop",
      secretKey: "secret",
      returnUrl: "https://gafus.ru/articles/paid-article?paid=1&from=app",
    });
  });

  it("rejects course YooKassa payment on iOS", async () => {
    getCourseByIdOrTypeMock.mockResolvedValueOnce({ id: "course-1", type: "basic" });

    await expect(
      createMobilePayment({
        userId: "user-1",
        courseId: "course-1",
        courseType: undefined,
        articleId: undefined,
        clientPlatform: "ios",
        ipAddress: null,
        userAgent: null,
      }),
    ).resolves.toEqual({
      success: false,
      code: "APPLE_IAP_REQUIRED",
      error: "Оплата курса в приложении iOS только через App Store",
    });
  });

  it("returns Apple course metadata without direct API Prisma access", async () => {
    getCourseByIdOrTypeMock.mockResolvedValueOnce({ id: "course-1", type: "basic" });
    prismaCourseFindUnique.mockResolvedValueOnce({
      appleIapProductId: "gafus.course.basic",
      isPaid: true,
    });

    await expect(
      getAppleCoursePurchaseMetadata({ courseId: "course-1", courseType: undefined }),
    ).resolves.toEqual({
      success: true,
      data: {
        courseId: "course-1",
        appleIapProductId: "gafus.course.basic",
        isPaid: true,
      },
    });
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
pnpm --filter @gafus/core test -- packages/core/src/services/payments/mobilePaymentApiService.test.ts
```

Expected: FAIL because `mobilePaymentApiService.ts` does not exist.

- [ ] **Step 3: Implement `mobilePaymentApiService.ts`**

Create `packages/core/src/services/payments/mobilePaymentApiService.ts`:

```ts
import { prisma } from "@gafus/prisma";

import { getCourseByIdOrType } from "../course";
import { createArticlePayment, createPayment } from "./paymentService";

export type MobilePaymentErrorCode =
  | "CONFIG_WEB_APP_URL"
  | "CONFIG_YOOKASSA"
  | "NOT_FOUND"
  | "APPLE_IAP_REQUIRED"
  | "PAYMENT_ERROR";

export type MobilePaymentResult =
  | { success: true; data: { paymentId: string; confirmationUrl: string } }
  | { success: false; code: MobilePaymentErrorCode; error: string };

export type AppleCoursePurchaseMetadataResult =
  | {
      success: true;
      data: { courseId: string; appleIapProductId: string | null; isPaid: boolean };
    }
  | { success: false; code: "NOT_FOUND"; error: string };

export function resolveWebBaseUrl(
  env: Pick<NodeJS.ProcessEnv, "WEB_APP_URL" | "NEXT_PUBLIC_WEB_APP_URL"> = process.env,
):
  | { success: true; baseUrl: string }
  | { success: false; code: "CONFIG_WEB_APP_URL"; error: string } {
  const rawBaseUrl = env.WEB_APP_URL ?? env.NEXT_PUBLIC_WEB_APP_URL ?? "https://gafus.ru";

  try {
    const parsed = new URL(rawBaseUrl);
    if (parsed.protocol !== "https:") {
      return { success: false, code: "CONFIG_WEB_APP_URL", error: "Платежи недоступны" };
    }
    return { success: true, baseUrl: parsed.toString().replace(/\/$/, "") };
  } catch {
    return { success: false, code: "CONFIG_WEB_APP_URL", error: "Платежи недоступны" };
  }
}

function resolveYookassaCredentials(
  env: Pick<NodeJS.ProcessEnv, "YOOKASSA_SHOP_ID" | "YOOKASSA_SECRET_KEY"> = process.env,
):
  | { success: true; shopId: string; secretKey: string }
  | { success: false; code: "CONFIG_YOOKASSA"; error: string } {
  if (!env.YOOKASSA_SHOP_ID || !env.YOOKASSA_SECRET_KEY) {
    return { success: false, code: "CONFIG_YOOKASSA", error: "Платежи недоступны" };
  }
  return { success: true, shopId: env.YOOKASSA_SHOP_ID, secretKey: env.YOOKASSA_SECRET_KEY };
}

export async function createMobilePayment(input: {
  userId: string;
  courseId?: string;
  courseType?: string;
  articleId?: string;
  clientPlatform?: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<MobilePaymentResult> {
  const webBaseUrl = resolveWebBaseUrl();
  if (!webBaseUrl.success) return webBaseUrl;

  const credentials = resolveYookassaCredentials();
  if (!credentials.success) return credentials;

  if (input.articleId) {
    const article = await prisma.article.findUnique({
      where: { id: input.articleId },
      select: { slug: true },
    });
    if (!article) {
      return { success: false, code: "NOT_FOUND", error: "Статья не найдена" };
    }

    const result = await createArticlePayment({
      userId: input.userId,
      articleId: input.articleId,
      shopId: credentials.shopId,
      secretKey: credentials.secretKey,
      returnUrl: `${webBaseUrl.baseUrl}/articles/${encodeURIComponent(article.slug)}?paid=1&from=app`,
    });

    if (!result.success) {
      return { success: false, code: "PAYMENT_ERROR", error: result.error };
    }
    return {
      success: true,
      data: { paymentId: result.paymentId, confirmationUrl: result.confirmationUrl },
    };
  }

  const course = await getCourseByIdOrType(input.courseId, input.courseType);
  if (!course) {
    return { success: false, code: "NOT_FOUND", error: "Курс не найден" };
  }

  if (input.clientPlatform?.toLowerCase() === "ios") {
    return {
      success: false,
      code: "APPLE_IAP_REQUIRED",
      error: "Оплата курса в приложении iOS только через App Store",
    };
  }

  const result = await createPayment({
    userId: input.userId,
    courseId: course.id,
    shopId: credentials.shopId,
    secretKey: credentials.secretKey,
    returnUrl: `${webBaseUrl.baseUrl}/trainings/${encodeURIComponent(course.type)}?paid=1&from=app`,
    acceptanceContext: {
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      source: "mobile",
    },
  });

  if (!result.success) {
    return { success: false, code: "PAYMENT_ERROR", error: result.error };
  }
  return {
    success: true,
    data: { paymentId: result.paymentId, confirmationUrl: result.confirmationUrl },
  };
}

export async function getAppleCoursePurchaseMetadata(input: {
  courseId?: string;
  courseType?: string;
}): Promise<AppleCoursePurchaseMetadataResult> {
  const courseRef = await getCourseByIdOrType(input.courseId, input.courseType);
  if (!courseRef) {
    return { success: false, code: "NOT_FOUND", error: "Курс не найден" };
  }

  const row = await prisma.course.findUnique({
    where: { id: courseRef.id },
    select: { appleIapProductId: true, isPaid: true },
  });
  if (!row) {
    return { success: false, code: "NOT_FOUND", error: "Курс не найден" };
  }

  return {
    success: true,
    data: {
      courseId: courseRef.id,
      appleIapProductId: row.appleIapProductId,
      isPaid: row.isPaid,
    },
  };
}
```

- [ ] **Step 4: Export the payment orchestration service**

Modify `packages/core/src/services/payments/index.ts`:

```ts
export {
  createPayment,
  createArticlePayment,
  getUserIdByYookassaPaymentId,
  confirmPaymentFromWebhook,
  cancelPaymentFromWebhook,
  refundPaymentFromWebhook,
  type CreatePaymentParams,
  type CreatePaymentResult,
  type CreateArticlePaymentParams,
} from "./paymentService";
export {
  verifyAppleCoursePurchase,
  type VerifyAppleCoursePurchaseParams,
  type VerifyAppleCoursePurchaseResult,
} from "./appleIapCourseService";
export {
  createMobilePayment,
  getAppleCoursePurchaseMetadata,
  resolveWebBaseUrl,
  type AppleCoursePurchaseMetadataResult,
  type MobilePaymentErrorCode,
  type MobilePaymentResult,
} from "./mobilePaymentApiService";
```

- [ ] **Step 5: Make the core tests pass**

Run:

```bash
pnpm --filter @gafus/core test -- packages/core/src/services/payments/mobilePaymentApiService.test.ts
```

Expected: PASS.

- [ ] **Step 6: Refactor `apps/api/src/routes/v1/payments.ts`**

Replace imports:

```ts
import {
  createMobilePayment,
  getAppleCoursePurchaseMetadata,
  verifyAppleCoursePurchase,
} from "@gafus/core/services/payments";
import { createWebLogger } from "@gafus/logger";
```

Remove:

```ts
import { getCourseByIdOrType } from "@gafus/core/services/course";
import { prisma } from "@gafus/prisma";
```

Remove local `resolveWebBaseUrl`.

Add route status mapper:

```ts
function statusForMobilePaymentCode(
  code: "CONFIG_WEB_APP_URL" | "CONFIG_YOOKASSA" | "NOT_FOUND" | "APPLE_IAP_REQUIRED" | "PAYMENT_ERROR",
): 400 | 403 | 404 | 500 {
  switch (code) {
    case "CONFIG_WEB_APP_URL":
    case "CONFIG_YOOKASSA":
      return 500;
    case "NOT_FOUND":
      return 404;
    case "APPLE_IAP_REQUIRED":
      return 403;
    case "PAYMENT_ERROR":
    default:
      return 400;
  }
}
```

In `POST /create`, replace the body with:

```ts
const user = c.get("user");
const { courseId, courseType, articleId } = c.req.valid("json");
const result = await createMobilePayment({
  userId: user.id,
  courseId,
  courseType,
  articleId,
  clientPlatform: c.req.header("x-client-platform")?.toLowerCase(),
  ipAddress: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  userAgent: c.req.header("user-agent") ?? null,
});

if (!result.success) {
  return c.json(
    { success: false, error: result.error, code: result.code },
    statusForMobilePaymentCode(result.code),
  );
}

return c.json({ success: true, data: result.data });
```

In `GET /apple/course-metadata`, replace direct lookup with:

```ts
const { courseId, courseType } = c.req.valid("query");
const result = await getAppleCoursePurchaseMetadata({ courseId, courseType });
if (!result.success) {
  return c.json({ success: false, error: result.error, code: result.code }, 404);
}

c.header("Cache-Control", "private, no-store");
return c.json({ success: true, data: result.data });
```

- [ ] **Step 7: Update API route tests**

In `apps/api/src/routes/v1/payments.route.test.ts`, mock `createMobilePayment` and `getAppleCoursePurchaseMetadata` from `@gafus/core/services/payments`. Keep existing tests for request validation and response mapping. Add or preserve assertions:

```ts
expect(createMobilePaymentMock).toHaveBeenCalledWith({
  userId: "user-1",
  courseId: "course-1",
  courseType: undefined,
  articleId: undefined,
  clientPlatform: undefined,
  ipAddress: null,
  userAgent: null,
});
```

- [ ] **Step 8: Verify payments**

Run:

```bash
pnpm --filter @gafus/core test -- packages/core/src/services/payments/mobilePaymentApiService.test.ts
pnpm --filter @gafus/api test -- apps/api/src/routes/v1/payments.route.test.ts
pnpm --filter @gafus/core typecheck
pnpm --filter @gafus/api typecheck
```

Expected: all PASS.

- [ ] **Step 9: Commit payments refactor**

```bash
git add packages/core/src/services/payments apps/api/src/routes/v1/payments.ts apps/api/src/routes/v1/payments.route.test.ts
git commit -m "refactor(api): move mobile payment orchestration to core"
```

---

## Task 2: Video/HLS Core Service

**Files:**
- Create: `packages/core/src/services/video/mobileHlsService.ts`
- Create: `packages/core/src/services/video/mobileHlsService.test.ts`
- Modify: `packages/core/src/services/video/index.ts`
- Modify: `apps/api/src/routes/v1/training.ts`
- Modify: `apps/api/src/routes/v1/training.route.test.ts`
- Modify: `apps/api/src/routes/v1/training.validation.test.ts`

- [ ] **Step 1: Add pure HLS tests**

Create `packages/core/src/services/video/mobileHlsService.test.ts` with pure tests first:

```ts
import { describe, expect, it } from "vitest";

import {
  rewriteHlsManifestWithSegmentProxy,
  validateHlsSegmentPath,
} from "./mobileHlsService";

describe("mobile HLS service pure helpers", () => {
  it("accepts only local HLS segment filenames", () => {
    expect(validateHlsSegmentPath("segment-001.ts")).toBe("segment-001.ts");
    expect(validateHlsSegmentPath("init.mp4")).toBe("init.mp4");
    expect(validateHlsSegmentPath("../secret.ts")).toBeNull();
    expect(validateHlsSegmentPath("folder/segment.ts")).toBeNull();
    expect(validateHlsSegmentPath("https://evil.test/segment.ts")).toBeNull();
    expect(validateHlsSegmentPath("segment.exe")).toBeNull();
  });

  it("rewrites HLS segment lines and URI attributes to the API segment proxy", () => {
    const manifest = [
      "#EXTM3U",
      '#EXT-X-MAP:URI="init.mp4"',
      "#EXTINF:4.000,",
      "segment-001.ts",
      "#EXT-X-ENDLIST",
    ].join("\n");

    expect(
      rewriteHlsManifestWithSegmentProxy({
        manifestContent: manifest,
        segmentBaseUrl: "https://api.gafus.ru/api/v1/training/video/video-1/segment",
        token: "signed-token",
      }),
    ).toBe(
      [
        "#EXTM3U",
        '#EXT-X-MAP:URI="https://api.gafus.ru/api/v1/training/video/video-1/segment?path=init.mp4&token=signed-token"',
        "#EXTINF:4.000,",
        "https://api.gafus.ru/api/v1/training/video/video-1/segment?path=segment-001.ts&token=signed-token",
        "#EXT-X-ENDLIST",
      ].join("\n"),
    );
  });
});
```

- [ ] **Step 2: Run pure HLS tests and confirm failure**

```bash
pnpm --filter @gafus/core test -- packages/core/src/services/video/mobileHlsService.test.ts
```

Expected: FAIL because `mobileHlsService.ts` does not exist.

- [ ] **Step 3: Implement pure helpers**

Create `packages/core/src/services/video/mobileHlsService.ts` with:

```ts
const HLS_SEGMENT_FILE_PATTERN = /^[a-zA-Z0-9._-]+\.(ts|m4s|mp4|m3u8|vtt|aac)$/;

export function validateHlsSegmentPath(segmentPath: string): string | null {
  const normalized = segmentPath.trim();
  if (!normalized) return null;
  if (
    normalized.includes("..") ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    normalized.includes("://")
  ) {
    return null;
  }
  if (!HLS_SEGMENT_FILE_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
}

export function rewriteHlsManifestWithSegmentProxy(input: {
  manifestContent: string;
  segmentBaseUrl: string;
  token: string;
}): string {
  return input.manifestContent
    .split("\n")
    .map((line) => {
      const uriMatch = line.match(/URI="([^"]+)"/);
      if (uriMatch) {
        const segmentPath = uriMatch[1].trim();
        const segmentUrl = `${input.segmentBaseUrl}?path=${encodeURIComponent(segmentPath)}&token=${input.token}`;
        return line.replace(uriMatch[0], `URI="${segmentUrl}"`);
      }
      if (line.trim() && !line.startsWith("#")) {
        const segmentPath = line.trim();
        return `${input.segmentBaseUrl}?path=${encodeURIComponent(segmentPath)}&token=${input.token}`;
      }
      return line;
    })
    .join("\n");
}
```

- [ ] **Step 4: Add service-level tests for playback URL, manifest, and segment**

Extend `mobileHlsService.test.ts`:

```ts
const requirePremiumOrRewardedAccessForVideoUrlMock = vi.fn();
const getVideoManifestInfoMock = vi.fn();
const checkVideoAccessMock = vi.fn();
const downloadFileFromCDNMock = vi.fn();
const generateTokenMock = vi.fn();
const verifyTokenMock = vi.fn();

vi.mock("../rewardedCredits", () => ({
  requirePremiumOrRewardedAccessForVideoUrl: requirePremiumOrRewardedAccessForVideoUrlMock,
}));

vi.mock("./videoAccessService", () => ({
  checkVideoAccess: checkVideoAccessMock,
  getVideoManifestInfo: getVideoManifestInfoMock,
}));

vi.mock("@gafus/cdn-upload", () => ({
  downloadFileFromCDN: downloadFileFromCDNMock,
  extractVideoIdFromCdnUrl: (url: string) => (url.includes("video-1") ? "video-1" : null),
}));

vi.mock("@gafus/video-access", () => ({
  getVideoAccessService: () => ({
    generateToken: generateTokenMock,
    verifyToken: verifyTokenMock,
  }),
}));

it("returns external video urls unchanged after access check", async () => {
  await expect(
    resolveTrainingVideoPlaybackUrl({
      userId: "user-1",
      platform: "ANDROID",
      videoUrl: "https://youtube.com/watch?v=1",
      apiUrl: "https://api.gafus.ru",
      hasVideoAccessSecret: true,
      isProduction: false,
    }),
  ).resolves.toEqual({
    success: true,
    data: { url: "https://youtube.com/watch?v=1" },
  });
});

it("creates a signed HLS URL for CDN videos", async () => {
  getVideoManifestInfoMock.mockResolvedValueOnce({
    transcodingStatus: "COMPLETED",
    hlsManifestPath: "videos/video-1/master.m3u8",
  });
  checkVideoAccessMock.mockResolvedValueOnce(true);
  generateTokenMock.mockReturnValueOnce("signed-token");

  await expect(
    resolveTrainingVideoPlaybackUrl({
      userId: "user-1",
      platform: "ANDROID",
      videoUrl: "https://gafus-media.storage.yandexcloud.net/video-1/source.mp4",
      apiUrl: "https://api.gafus.ru",
      hasVideoAccessSecret: true,
      isProduction: false,
    }),
  ).resolves.toEqual({
    success: true,
    data: {
      url: "https://api.gafus.ru/api/v1/training/video/video-1/manifest.m3u8?token=signed-token",
    },
  });
});

it("builds a signed manifest response", async () => {
  verifyTokenMock.mockReturnValueOnce({ userId: "user-1", videoId: "video-1" });
  getVideoManifestInfoMock.mockResolvedValueOnce({
    transcodingStatus: "COMPLETED",
    hlsManifestPath: "videos/video-1/master.m3u8",
  });
  checkVideoAccessMock.mockResolvedValueOnce(true);
  downloadFileFromCDNMock.mockResolvedValueOnce(Buffer.from("#EXTM3U\nsegment-001.ts"));

  const result = await buildSignedHlsManifest({
    videoId: "video-1",
    token: "signed-token",
    apiUrl: "https://api.gafus.ru",
  });

  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.manifest).toContain("/api/v1/training/video/video-1/segment");
    expect(result.data.contentType).toBe("application/vnd.apple.mpegurl");
  }
});
```

- [ ] **Step 5: Implement service functions and result codes**

Extend `mobileHlsService.ts` with:

```ts
import { downloadFileFromCDN, extractVideoIdFromCdnUrl } from "@gafus/cdn-upload";
import { getVideoAccessService } from "@gafus/video-access";

import { requirePremiumOrRewardedAccessForVideoUrl } from "../rewardedCredits";
import { checkVideoAccess, getVideoManifestInfo } from "./videoAccessService";

type HlsErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_URL"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "SERVICE_NOT_CONFIGURED"
  | "TOKEN_GENERATION_ERROR"
  | "TOKEN_REQUIRED"
  | "INVALID_TOKEN"
  | "INVALID_SEGMENT_PATH"
  | "DATABASE_ERROR"
  | "VIDEO_PROCESSING";

type HlsResult<T> = { success: true; data: T } | { success: false; code: HlsErrorCode; error: string };

const EXTERNAL_VIDEO_PATTERNS = [
  /youtube\.com/,
  /youtu\.be/,
  /rutube\.ru/,
  /vimeo\.com/,
  /vk\.com\/video/,
  /vkvideo\.ru/,
];

function isCdnVideoUrl(videoUrl: string): boolean {
  return (
    videoUrl.includes("gafus-media.storage.yandexcloud.net") ||
    videoUrl.includes("storage.yandexcloud.net/gafus-media")
  );
}

export async function resolveTrainingVideoPlaybackUrl(input: {
  userId: string;
  platform: "ANDROID" | "IOS";
  videoUrl: string;
  apiUrl: string;
  hasVideoAccessSecret: boolean;
  isProduction: boolean;
}): Promise<HlsResult<{ url: string }>> {
  await requirePremiumOrRewardedAccessForVideoUrl({
    userId: input.userId,
    platform: input.platform,
    videoUrl: input.videoUrl,
  });

  if (EXTERNAL_VIDEO_PATTERNS.some((pattern) => pattern.test(input.videoUrl))) {
    return { success: true, data: { url: input.videoUrl } };
  }

  if (!isCdnVideoUrl(input.videoUrl)) {
    return { success: true, data: { url: input.videoUrl } };
  }

  const videoId = extractVideoIdFromCdnUrl(input.videoUrl);
  if (!videoId) {
    return { success: false, code: "INVALID_URL", error: "Некорректный URL видео" };
  }

  let video: Awaited<ReturnType<typeof getVideoManifestInfo>>;
  try {
    video = await getVideoManifestInfo(videoId);
  } catch {
    return { success: false, code: "DATABASE_ERROR", error: "Ошибка поиска видео в базе данных" };
  }

  if (!video || video.transcodingStatus !== "COMPLETED" || !video.hlsManifestPath) {
    return {
      success: false,
      code: "NOT_FOUND",
      error: "Видео не найдено или ещё обрабатывается",
    };
  }

  const hasAccess = await checkVideoAccess({ userId: input.userId, videoId });
  if (!hasAccess) {
    return {
      success: false,
      code: "FORBIDDEN",
      error: "Недостаточно прав для просмотра видео",
    };
  }

  if (!input.hasVideoAccessSecret) {
    return {
      success: false,
      code: "SERVICE_NOT_CONFIGURED",
      error: input.isProduction
        ? "VIDEO_ACCESS_SECRET не установлен в переменных окружения (обязательно в production)"
        : "VIDEO_ACCESS_SECRET не установлен в переменных окружения",
    };
  }

  try {
    const token = getVideoAccessService().generateToken({ videoId, userId: input.userId, ttlMinutes: 120 });
    return {
      success: true,
      data: { url: `${input.apiUrl}/api/v1/training/video/${videoId}/manifest.m3u8?token=${token}` },
    };
  } catch (error) {
    return {
      success: false,
      code: "TOKEN_GENERATION_ERROR",
      error: error instanceof Error ? error.message : "Ошибка генерации signed URL",
    };
  }
}
```

Also implement:

```ts
export async function buildSignedHlsManifest(input: {
  videoId: string;
  token: string | undefined;
  apiUrl: string;
}): Promise<HlsResult<{ manifest: string; contentType: "application/vnd.apple.mpegurl" }>> {
  if (!input.token) {
    return { success: false, code: "TOKEN_REQUIRED", error: "Токен не предоставлен" };
  }

  const tokenData = getVideoAccessService().verifyToken(input.token);
  if (!tokenData) {
    return { success: false, code: "INVALID_TOKEN", error: "Недействительный токен" };
  }
  if (tokenData.videoId !== input.videoId) {
    return { success: false, code: "FORBIDDEN", error: "Недостаточно прав доступа" };
  }

  const video = await getVideoManifestInfo(input.videoId);
  if (!video) return { success: false, code: "NOT_FOUND", error: "Видео не найдено" };
  if (video.transcodingStatus !== "COMPLETED") {
    return { success: false, code: "VIDEO_PROCESSING", error: "Видео ещё обрабатывается" };
  }
  if (!video.hlsManifestPath) {
    return { success: false, code: "NOT_FOUND", error: "HLS манифест не найден" };
  }

  const hasAccess = await checkVideoAccess({ userId: tokenData.userId, videoId: input.videoId });
  if (!hasAccess) {
    return { success: false, code: "FORBIDDEN", error: "Недостаточно прав для просмотра видео" };
  }

  const manifestContent = (await downloadFileFromCDN(video.hlsManifestPath)).toString("utf-8");
  return {
    success: true,
    data: {
      contentType: "application/vnd.apple.mpegurl",
      manifest: rewriteHlsManifestWithSegmentProxy({
        manifestContent,
        segmentBaseUrl: `${input.apiUrl}/api/v1/training/video/${input.videoId}/segment`,
        token: input.token,
      }),
    },
  };
}

export async function prepareHlsSegmentDownload(input: {
  videoId: string;
  token: string | undefined;
  segmentPath: string | undefined;
}): Promise<HlsResult<{ buffer: Buffer; contentType: string }>> {
  if (!input.token) return { success: false, code: "TOKEN_REQUIRED", error: "Токен не предоставлен" };
  if (!input.segmentPath) {
    return { success: false, code: "VALIDATION_ERROR", error: "Путь к сегменту не предоставлен" };
  }

  const safeSegmentPath = validateHlsSegmentPath(input.segmentPath);
  if (!safeSegmentPath) {
    return { success: false, code: "INVALID_SEGMENT_PATH", error: "Недопустимый путь к сегменту" };
  }

  const tokenData = getVideoAccessService().verifyToken(input.token);
  if (!tokenData) return { success: false, code: "INVALID_TOKEN", error: "Недействительный токен" };
  if (tokenData.videoId !== input.videoId) {
    return { success: false, code: "FORBIDDEN", error: "Недостаточно прав доступа" };
  }

  const video = await getVideoManifestInfo(input.videoId);
  if (!video || video.transcodingStatus !== "COMPLETED" || !video.hlsManifestPath) {
    return { success: false, code: "NOT_FOUND", error: "Видео не найдено или не готово" };
  }

  const hasAccess = await checkVideoAccess({ userId: tokenData.userId, videoId: input.videoId });
  if (!hasAccess) {
    return { success: false, code: "FORBIDDEN", error: "Недостаточно прав для просмотра видео" };
  }

  const baseDir = video.hlsManifestPath.split("/").slice(0, -1).join("/");
  const buffer = await downloadFileFromCDN(`${baseDir}/${safeSegmentPath}`);
  const contentType = safeSegmentPath.endsWith(".ts")
    ? "video/mp2t"
    : safeSegmentPath.endsWith(".m3u8")
      ? "application/vnd.apple.mpegurl"
      : "application/octet-stream";

  return { success: true, data: { buffer, contentType } };
}
```

- [ ] **Step 6: Export video service functions**

Modify `packages/core/src/services/video/index.ts`:

```ts
export * from "./videoProgressService";
export * from "./videoAccessService";
export * from "./mobileHlsService";
```

- [ ] **Step 7: Run core video tests**

```bash
pnpm --filter @gafus/core test -- packages/core/src/services/video/mobileHlsService.test.ts
```

Expected: PASS.

- [ ] **Step 8: Refactor `apps/api/src/routes/v1/training.ts`**

Replace these imports:

```ts
import { checkVideoAccess, getVideoManifestInfo } from "@gafus/core/services/video";
import { downloadFileFromCDN, extractVideoIdFromCdnUrl } from "@gafus/cdn-upload";
import { getVideoAccessService } from "@gafus/video-access";
```

With:

```ts
import {
  buildSignedHlsManifest,
  prepareHlsSegmentDownload,
  resolveTrainingVideoPlaybackUrl,
} from "@gafus/core/services/video";
```

Remove local `HLS_SEGMENT_FILE_PATTERN`, `validateHlsSegmentPath`, and route-level manifest rewriting.

Add mapper:

```ts
function statusForHlsCode(code: string): 400 | 401 | 403 | 404 | 425 | 500 {
  switch (code) {
    case "TOKEN_REQUIRED":
      return 401;
    case "INVALID_TOKEN":
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "VIDEO_PROCESSING":
      return 425;
    case "SERVICE_NOT_CONFIGURED":
    case "TOKEN_GENERATION_ERROR":
    case "DATABASE_ERROR":
      return 500;
    case "VALIDATION_ERROR":
    case "INVALID_URL":
    case "INVALID_SEGMENT_PATH":
    default:
      return 400;
  }
}
```

In `POST /video/url`, call:

```ts
const result = await resolveTrainingVideoPlaybackUrl({
  userId: user.id,
  platform: getRewardedPlatform(c),
  videoUrl,
  apiUrl: process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "https://api.gafus.ru",
  hasVideoAccessSecret: Boolean(process.env.VIDEO_ACCESS_SECRET),
  isProduction: process.env.NODE_ENV === "production",
});

if (!result.success) {
  return c.json(
    { success: false, error: result.error, code: result.code },
    statusForHlsCode(result.code),
  );
}
return c.json({ success: true, data: result.data });
```

In `handleVideoManifest`, call:

```ts
const result = await buildSignedHlsManifest({
  videoId: c.req.param("videoId"),
  token: c.req.query("token"),
  apiUrl: process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "https://api.gafus.ru",
});

if (!result.success) {
  return c.json(
    { success: false, error: result.error, code: result.code },
    statusForHlsCode(result.code),
  );
}

c.header("Content-Type", result.data.contentType);
c.header("Cache-Control", "no-cache, no-store, must-revalidate");
c.header("Pragma", "no-cache");
c.header("Expires", "0");
return c.text(result.data.manifest, 200);
```

In `GET /video/:videoId/segment`, call:

```ts
const result = await prepareHlsSegmentDownload({
  videoId: c.req.param("videoId"),
  token: c.req.query("token"),
  segmentPath: c.req.query("path"),
});

if (!result.success) {
  return c.json(
    { success: false, error: result.error, code: result.code },
    statusForHlsCode(result.code),
  );
}

c.header("Content-Type", result.data.contentType);
c.header("Cache-Control", "private, max-age=300");
return c.body(result.data.buffer);
```

- [ ] **Step 9: Update training route tests**

In `apps/api/src/routes/v1/training.route.test.ts` and `apps/api/src/routes/v1/training.validation.test.ts`, mock the new functions from `@gafus/core/services/video`:

```ts
vi.mock("@gafus/core/services/video", () => ({
  buildSignedHlsManifest: vi.fn(),
  prepareHlsSegmentDownload: vi.fn(),
  resolveTrainingVideoPlaybackUrl: vi.fn(),
  checkVideoAccess: vi.fn(),
  getVideoManifestInfo: vi.fn(),
}));
```

Keep tests for:

- route returns 400 on invalid request body before service call;
- route maps `FORBIDDEN` to 403;
- route maps successful manifest to `application/vnd.apple.mpegurl`;
- route maps invalid segment path service result to 400.

- [ ] **Step 10: Verify video refactor**

```bash
pnpm --filter @gafus/core test -- packages/core/src/services/video/mobileHlsService.test.ts
pnpm --filter @gafus/api test -- apps/api/src/routes/v1/training.route.test.ts apps/api/src/routes/v1/training.validation.test.ts
pnpm --filter @gafus/core typecheck
pnpm --filter @gafus/api typecheck
```

Expected: all PASS.

- [ ] **Step 11: Commit video refactor**

```bash
git add packages/core/src/services/video apps/api/src/routes/v1/training.ts apps/api/src/routes/v1/training.route.test.ts apps/api/src/routes/v1/training.validation.test.ts
git commit -m "refactor(api): move mobile HLS playback logic to core"
```

---

## Task 3: Auth Session Orchestration

**Files:**
- Create: `packages/core/src/services/auth/apiSessionService.ts`
- Create: `packages/core/src/services/auth/apiSessionService.test.ts`
- Create: `packages/core/src/services/auth/apiVkAuthService.ts`
- Create: `packages/core/src/services/auth/apiVkAuthService.test.ts`
- Modify: `packages/core/src/services/auth/index.ts`
- Modify: `apps/api/src/routes/v1/auth.ts`
- Modify: `apps/api/src/routes/v1/auth.route.test.ts`

- [ ] **Step 1: Add tests for token/session issuing**

Create `packages/core/src/services/auth/apiSessionService.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { issueApiSession, refreshApiSession, revokeApiRefreshToken } from "./apiSessionService";

const generateAccessTokenMock = vi.fn();
const generateRefreshTokenMock = vi.fn();
const createRefreshSessionMock = vi.fn();
const validateRefreshTokenMock = vi.fn();
const rotateRefreshTokenMock = vi.fn();
const revokeRefreshTokenMock = vi.fn();
const revokeAllUserTokensMock = vi.fn();
const verifyRefreshTokenMock = vi.fn();

vi.mock("@gafus/auth/jwt", () => ({
  generateAccessToken: generateAccessTokenMock,
  generateRefreshToken: generateRefreshTokenMock,
  verifyRefreshToken: verifyRefreshTokenMock,
}));

vi.mock("./authService", () => ({
  createRefreshSession: createRefreshSessionMock,
  validateRefreshToken: validateRefreshTokenMock,
  rotateRefreshToken: rotateRefreshTokenMock,
  revokeRefreshToken: revokeRefreshTokenMock,
  revokeAllUserTokens: revokeAllUserTokensMock,
}));

describe("api session service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateAccessTokenMock.mockResolvedValue("access-token");
    generateRefreshTokenMock.mockResolvedValue("refresh-token");
  });

  it("issues access and refresh tokens and stores hashed refresh session", async () => {
    const result = await issueApiSession({
      user: { id: "user-1", username: "alice", role: "USER" },
      metadata: { deviceId: "device-1", userAgent: "agent", ipAddress: "1.1.1.1" },
      now: new Date("2026-06-30T00:00:00.000Z"),
      tokenId: "token-1",
    });

    expect(result).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    expect(createRefreshSessionMock).toHaveBeenCalledWith(
      "user-1",
      "token-1",
      "c9fb4eb0bda3529818a2f25f87184b9a0ac8e47393f71861f2069be86911d9b8",
      {
        deviceId: "device-1",
        userAgent: "agent",
        ipAddress: "1.1.1.1",
        expiresAt: new Date("2026-07-30T00:00:00.000Z"),
      },
    );
  });

  it("revokes all user tokens when refresh reuse is detected", async () => {
    verifyRefreshTokenMock.mockResolvedValueOnce({ userId: "user-1" });
    validateRefreshTokenMock.mockResolvedValueOnce({
      valid: false,
      reason: "token_reuse",
      userId: "user-1",
    });

    await expect(
      refreshApiSession({
        refreshToken: "old-refresh",
        metadata: {},
        now: new Date("2026-06-30T00:00:00.000Z"),
        tokenId: "token-2",
      }),
    ).resolves.toEqual({
      success: false,
      code: "TOKEN_REUSE_DETECTED",
      error: "Сессия скомпрометирована. Войдите заново.",
      userId: "user-1",
    });
    expect(revokeAllUserTokensMock).toHaveBeenCalledWith("user-1");
  });

  it("hashes refresh token before logout revoke", async () => {
    await revokeApiRefreshToken("refresh-token");
    expect(revokeRefreshTokenMock).toHaveBeenCalledWith(
      "c9fb4eb0bda3529818a2f25f87184b9a0ac8e47393f71861f2069be86911d9b8",
    );
  });
});
```

- [ ] **Step 2: Implement API session service**

Create `packages/core/src/services/auth/apiSessionService.ts`:

```ts
import crypto from "crypto";

import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "@gafus/auth/jwt";

import {
  createRefreshSession,
  revokeAllUserTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  validateRefreshToken,
} from "./authService";

const REFRESH_EXPIRES_MS = 30 * 24 * 60 * 60 * 1000;

export type ApiAuthUser = {
  id: string;
  username: string;
  role: "USER" | "ADMIN" | "MODERATOR" | "TRAINER";
};

export type ApiSessionMetadata = {
  deviceId?: string;
  userAgent?: string;
  ipAddress?: string;
};

export function hashRefreshToken(refreshToken: string): string {
  return crypto.createHash("sha256").update(refreshToken).digest("hex");
}

export async function issueApiSession(input: {
  user: ApiAuthUser;
  metadata: ApiSessionMetadata;
  now?: Date;
  tokenId?: string;
}): Promise<{ accessToken: string; refreshToken: string }> {
  const now = input.now ?? new Date();
  const tokenId = input.tokenId ?? crypto.randomUUID();
  const accessToken = await generateAccessToken(input.user);
  const refreshToken = await generateRefreshToken(input.user.id, tokenId);

  await createRefreshSession(input.user.id, tokenId, hashRefreshToken(refreshToken), {
    ...input.metadata,
    expiresAt: new Date(now.getTime() + REFRESH_EXPIRES_MS),
  });

  return { accessToken, refreshToken };
}

export async function refreshApiSession(input: {
  refreshToken: string;
  metadata: ApiSessionMetadata;
  now?: Date;
  tokenId?: string;
}): Promise<
  | { success: true; data: { accessToken: string; refreshToken: string } }
  | {
      success: false;
      code: "INVALID_REFRESH_TOKEN" | "REFRESH_TOKEN_REVOKED" | "TOKEN_REUSE_DETECTED";
      error: string;
      userId?: string;
    }
> {
  const payload = await verifyRefreshToken(input.refreshToken);
  if (!payload) {
    return { success: false, code: "INVALID_REFRESH_TOKEN", error: "Недействительный refresh token" };
  }

  const oldTokenHash = hashRefreshToken(input.refreshToken);
  const result = await validateRefreshToken(oldTokenHash);
  if (!result.valid) {
    if (result.reason === "token_reuse" && result.userId) {
      await revokeAllUserTokens(result.userId);
      return {
        success: false,
        code: "TOKEN_REUSE_DETECTED",
        error: "Сессия скомпрометирована. Войдите заново.",
        userId: result.userId,
      };
    }
    return { success: false, code: "REFRESH_TOKEN_REVOKED", error: "Токен отозван или истёк" };
  }

  const now = input.now ?? new Date();
  const newTokenId = input.tokenId ?? crypto.randomUUID();
  const user = {
    id: result.user.id,
    username: result.user.username,
    role: result.user.role as ApiAuthUser["role"],
  };
  const accessToken = await generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id, newTokenId);

  await rotateRefreshToken(oldTokenHash, user.id, hashRefreshToken(refreshToken), newTokenId, {
    ...input.metadata,
    expiresAt: new Date(now.getTime() + REFRESH_EXPIRES_MS),
  });

  return { success: true, data: { accessToken, refreshToken } };
}

export async function revokeApiRefreshToken(refreshToken: string): Promise<void> {
  await revokeRefreshToken(hashRefreshToken(refreshToken));
}
```

- [ ] **Step 3: Run session tests**

```bash
pnpm --filter @gafus/core test -- packages/core/src/services/auth/apiSessionService.test.ts
```

Expected: PASS.

- [ ] **Step 4: Add VK API auth tests**

Create `packages/core/src/services/auth/apiVkAuthService.test.ts` with tests for client resolution and session issue:

```ts
import { describe, expect, it, vi } from "vitest";

import { resolveVkApiClientConfig } from "./apiVkAuthService";

describe("api VK auth service", () => {
  it("resolves iOS client config with fallback", () => {
    expect(
      resolveVkApiClientConfig("ios", {
        VK_CLIENT_ID_IOS: "ios-client",
        VK_CLIENT_ID_ANDROID: "android-client",
        VK_CLIENT_ID: "default-client",
      }),
    ).toEqual({
      clientId: "ios-client",
      redirectUri: "vkios-client://vk.ru/blank.html",
      registrationChannel: "IOS",
    });
  });

  it("resolves Android client config with fallback", () => {
    expect(
      resolveVkApiClientConfig("android", {
        VK_CLIENT_ID_ANDROID: "android-client",
        VK_CLIENT_ID: "default-client",
      }),
    ).toEqual({
      clientId: "android-client",
      redirectUri: "vkandroid-client://vk.ru/blank.html",
      registrationChannel: "ANDROID",
    });
  });

  it("resolves unknown platform to default client and channel", () => {
    expect(resolveVkApiClientConfig(undefined, { VK_CLIENT_ID: "default-client" })).toEqual({
      clientId: "default-client",
      redirectUri: "vkdefault-client://vk.ru/blank.html",
      registrationChannel: "UNKNOWN",
    });
  });
});
```

- [ ] **Step 5: Implement VK API auth service**

Create `packages/core/src/services/auth/apiVkAuthService.ts`:

```ts
import crypto from "crypto";

import { consumeVkIdOneTimeUser, storeVkIdOneTimeUser } from "@gafus/auth";
import { RegistrationChannel } from "@gafus/prisma";

import { createConsentLogs, linkConsentLogsToUser } from "../consent";
import { exchangeVkCodeAndGetUser, exchangeVkCodeForProfile, getAuthUserById, linkVkToUser } from "./authService";
import { issueApiSession, type ApiSessionMetadata } from "./apiSessionService";

export function resolveVkApiClientConfig(
  platform: "ios" | "android" | undefined,
  env: Pick<NodeJS.ProcessEnv, "VK_CLIENT_ID_IOS" | "VK_CLIENT_ID_ANDROID" | "VK_CLIENT_ID"> = process.env,
): { clientId: string; redirectUri: string; registrationChannel: RegistrationChannel } {
  const clientId =
    platform === "ios"
      ? (env.VK_CLIENT_ID_IOS ?? env.VK_CLIENT_ID ?? "")
      : platform === "android"
        ? (env.VK_CLIENT_ID_ANDROID ?? env.VK_CLIENT_ID ?? "")
        : (env.VK_CLIENT_ID ?? "");

  const registrationChannel =
    platform === "ios"
      ? RegistrationChannel.IOS
      : platform === "android"
        ? RegistrationChannel.ANDROID
        : RegistrationChannel.UNKNOWN;

  return { clientId, redirectUri: `vk${clientId}://vk.ru/blank.html`, registrationChannel };
}

export async function loginWithVkForApi(input: {
  code: string;
  codeVerifier: string;
  deviceId: string;
  state: string;
  platform?: "ios" | "android";
  metadata: ApiSessionMetadata;
}): Promise<
  | {
      success: true;
      data:
        | { needsConsent: true; vkConsentToken: string; user: { id: string; username: string; role: string } }
        | {
            needsConsent?: false;
            user: { id: string; username: string; role: string };
            accessToken: string;
            refreshToken: string;
            needsPhone: boolean;
          };
    }
> {
  const config = resolveVkApiClientConfig(input.platform);
  const result = await exchangeVkCodeAndGetUser({
    code: input.code,
    codeVerifier: input.codeVerifier,
    deviceId: input.deviceId,
    state: input.state,
    redirectUri: config.redirectUri,
    clientId: config.clientId,
    registrationChannel: config.registrationChannel,
  });

  if (result.isNewUser) {
    const vkConsentToken = await storeVkIdOneTimeUser(crypto.randomUUID(), {
      userId: result.user.id,
      username: result.user.username,
      role: result.user.role,
    });
    return {
      success: true,
      data: {
        needsConsent: true,
        vkConsentToken,
        user: { id: result.user.id, username: result.user.username, role: result.user.role },
      },
    };
  }

  const session = await issueApiSession({
    user: {
      id: result.user.id,
      username: result.user.username,
      role: result.user.role as "USER" | "ADMIN" | "MODERATOR" | "TRAINER",
    },
    metadata: input.metadata,
  });

  return {
    success: true,
    data: {
      user: { id: result.user.id, username: result.user.username, role: result.user.role },
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      needsPhone: result.needsPhone,
    },
  };
}
```

Add `completeVkConsentForApi` and `linkVkForApi` in the same file using the existing route logic:

- `completeVkConsentForApi` consumes `vkConsentToken`, creates consent logs, links them, fetches user, issues session.
- `linkVkForApi` resolves client config, exchanges VK code for profile, calls `linkVkToUser`.

- [ ] **Step 6: Export auth services**

Modify `packages/core/src/services/auth/index.ts`:

```ts
export * from "./authService";
export * from "./emailAccountFlows";
export * from "./registerUserWithCredentials";
export * from "./vkAuth";
export * from "./apiSessionService";
export * from "./apiVkAuthService";
```

- [ ] **Step 7: Refactor login/register/refresh/logout in `auth.ts`**

Remove direct imports of:

```ts
import crypto from "crypto";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "@gafus/auth/jwt";
```

Import:

```ts
import {
  issueApiSession,
  refreshApiSession,
  revokeApiRefreshToken,
} from "@gafus/core/services/auth";
```

In `POST /login`, after `validateCredentials`, replace token/session creation with:

```ts
const session = await issueApiSession({
  user: {
    id: user.id,
    username: user.username,
    role: user.role as "USER" | "ADMIN" | "MODERATOR" | "TRAINER",
  },
  metadata: {
    deviceId: c.req.header("x-device-id"),
    userAgent: c.req.header("user-agent"),
    ipAddress: c.req.header("x-forwarded-for")?.split(",")[0],
  },
});
```

Return `session.accessToken` and `session.refreshToken`.

In `POST /register`, after successful consent/user creation, replace token/session creation with `issueApiSession`.

In `POST /refresh`, replace the whole token validation/rotation block with:

```ts
const result = await refreshApiSession({
  refreshToken,
  metadata: {
    deviceId: c.req.header("x-device-id"),
    userAgent: c.req.header("user-agent"),
    ipAddress: c.req.header("x-forwarded-for")?.split(",")[0],
  },
});

if (!result.success) {
  if (result.code === "TOKEN_REUSE_DETECTED") {
    logger.warn("Refresh token reuse detected - possible token theft!", {
      userId: result.userId,
      ip: c.req.header("x-forwarded-for")?.split(",")[0],
    });
    return c.json(
      { success: false, error: result.error, code: result.code },
      401,
    );
  }
  return c.json({ success: false, error: result.error }, 401);
}

return c.json({ success: true, data: result.data });
```

In `POST /logout`, use:

```ts
await revokeApiRefreshToken(refreshToken);
```

- [ ] **Step 8: Refactor VK routes**

Import:

```ts
import {
  completeVkConsentForApi,
  linkVkForApi,
  loginWithVkForApi,
} from "@gafus/core/services/auth";
```

In `POST /vk`, call:

```ts
const result = await loginWithVkForApi({
  code,
  codeVerifier: code_verifier,
  deviceId: device_id,
  state,
  platform,
  metadata: {
    ipAddress: ip,
    userAgent: c.req.header("user-agent"),
  },
});
return c.json({ success: true, data: result.data });
```

In `POST /vk-consent`, call `completeVkConsentForApi` with `vkConsentToken`, `consentPayload`, metadata, and `defaultVersion: CONSENT_VERSION`.

In `POST /vk-link`, call `linkVkForApi` with the authenticated `user.id` and VK PKCE fields.

- [ ] **Step 9: Run auth route and core tests**

```bash
pnpm --filter @gafus/core test -- packages/core/src/services/auth/apiSessionService.test.ts packages/core/src/services/auth/apiVkAuthService.test.ts
pnpm --filter @gafus/api test -- apps/api/src/routes/v1/auth.route.test.ts
pnpm --filter @gafus/core typecheck
pnpm --filter @gafus/api typecheck
```

Expected: all PASS.

- [ ] **Step 10: Commit auth refactor**

```bash
git add packages/core/src/services/auth apps/api/src/routes/v1/auth.ts apps/api/src/routes/v1/auth.route.test.ts
git commit -m "refactor(api): move auth session orchestration to core"
```

---

## Task 4: Shared Upload Constraints

**Files:**
- Create: `packages/core/src/services/common/fileConstraints.ts`
- Create: `packages/core/src/services/common/fileConstraints.test.ts`
- Modify: `packages/core/src/services/common/index.ts`
- Modify: `apps/api/src/routes/v1/pets.ts`
- Modify: `apps/api/src/routes/v1/user.ts`

- [ ] **Step 1: Add tests for upload constraints**

Create `packages/core/src/services/common/fileConstraints.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  validateAvatarImageFile,
  validatePetPhotoFile,
  validatePetDocumentFile,
} from "./fileConstraints";

function fileLike(type: string, size: number): File {
  return { type, size } as File;
}

describe("file constraints", () => {
  it("validates avatar image files", () => {
    expect(validateAvatarImageFile(fileLike("image/jpeg", 1024))).toEqual({ success: true });
    expect(validateAvatarImageFile(fileLike("application/pdf", 1024))).toEqual({
      success: false,
      error: "Неподдерживаемый тип файла. Разрешены: JPEG, PNG, WebP, GIF",
    });
    expect(validateAvatarImageFile(fileLike("image/jpeg", 6 * 1024 * 1024))).toEqual({
      success: false,
      error: "Файл слишком большой. Максимум 5 МБ",
    });
  });

  it("validates pet photo files", () => {
    expect(validatePetPhotoFile(fileLike("image/webp", 1024))).toEqual({ success: true });
    expect(validatePetPhotoFile(fileLike("image/jpeg", 3 * 1024 * 1024))).toEqual({
      success: false,
      error: "Файл слишком большой. Максимум 2 МБ",
    });
  });

  it("validates pet document files", () => {
    expect(validatePetDocumentFile(fileLike("application/pdf", 1024))).toEqual({ success: true });
    expect(validatePetDocumentFile(fileLike("text/plain", 1024))).toEqual({
      success: false,
      code: "INVALID_DOCUMENT_TYPE",
      error: "Недопустимый тип документа. Разрешены PDF, JPEG и PNG",
    });
  });
});
```

- [ ] **Step 2: Implement file constraints**

Create `packages/core/src/services/common/fileConstraints.ts`:

```ts
import {
  PET_DOCUMENT_ALLOWED_MIME_TYPES,
  PET_DOCUMENT_MAX_SIZE_BYTES,
} from "@gafus/types";

export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_PET_PHOTO_SIZE_BYTES = 2 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

type FileValidationResult =
  | { success: true }
  | { success: false; error: string; code?: string };

export function validateAvatarImageFile(file: Pick<File, "type" | "size">): FileValidationResult {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    return { success: false, error: "Неподдерживаемый тип файла. Разрешены: JPEG, PNG, WebP, GIF" };
  }
  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    return { success: false, error: "Файл слишком большой. Максимум 5 МБ" };
  }
  return { success: true };
}

export function validatePetPhotoFile(file: Pick<File, "type" | "size">): FileValidationResult {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    return { success: false, error: "Неподдерживаемый тип файла. Разрешены: JPEG, PNG, WebP, GIF" };
  }
  if (file.size > MAX_PET_PHOTO_SIZE_BYTES) {
    return { success: false, error: "Файл слишком большой. Максимум 2 МБ" };
  }
  return { success: true };
}

export function validatePetDocumentFile(file: Pick<File, "type" | "size">): FileValidationResult {
  if (!PET_DOCUMENT_ALLOWED_MIME_TYPES.includes(file.type as (typeof PET_DOCUMENT_ALLOWED_MIME_TYPES)[number])) {
    return {
      success: false,
      code: "INVALID_DOCUMENT_TYPE",
      error: "Недопустимый тип документа. Разрешены PDF, JPEG и PNG",
    };
  }
  if (file.size > PET_DOCUMENT_MAX_SIZE_BYTES) {
    return {
      success: false,
      code: "DOCUMENT_TOO_LARGE",
      error: "Размер документа превышает 10 МБ",
    };
  }
  return { success: true };
}
```

- [ ] **Step 3: Export file constraints**

Modify `packages/core/src/services/common/index.ts`:

```ts
export * from "./file-validation";
export * from "./fileConstraints";
```

If `index.ts` currently has more exports, preserve them and add only `export * from "./fileConstraints";`.

- [ ] **Step 4: Refactor avatar and pet upload routes**

In `apps/api/src/routes/v1/user.ts`, remove local avatar constants and import:

```ts
import { validateAvatarImageFile } from "@gafus/core/services/common";
```

Replace avatar validation with:

```ts
const validation = validateAvatarImageFile(file as File);
if (!validation.success) {
  return c.json({ success: false, error: validation.error }, 400);
}
```

In `apps/api/src/routes/v1/pets.ts`, remove local photo constants and import:

```ts
import {
  validatePetDocumentFile,
  validatePetPhotoFile,
} from "@gafus/core/services/common";
```

Replace photo validation with:

```ts
const validation = validatePetPhotoFile(f);
if (!validation.success) {
  return c.json({ success: false, error: validation.error }, 400);
}
```

Replace document validation with:

```ts
const validation = validatePetDocumentFile(uploadedFile);
if (!validation.success) {
  return c.json(
    {
      success: false,
      error: validation.error,
      code: validation.code ?? "VALIDATION_ERROR",
    },
    400,
  );
}
```

- [ ] **Step 5: Verify upload constraint refactor**

```bash
pnpm --filter @gafus/core test -- packages/core/src/services/common/fileConstraints.test.ts
pnpm --filter @gafus/api test -- apps/api/src/routes/v1/pets.route.test.ts
pnpm --filter @gafus/core typecheck
pnpm --filter @gafus/api typecheck
```

Expected: all PASS.

- [ ] **Step 6: Commit upload constraints refactor**

```bash
git add packages/core/src/services/common apps/api/src/routes/v1/pets.ts apps/api/src/routes/v1/user.ts
git commit -m "refactor(api): share upload file constraints from core"
```

---

## Final Verification

- [ ] **Step 1: Run all focused tests**

```bash
pnpm --filter @gafus/core test -- \
  packages/core/src/services/payments/mobilePaymentApiService.test.ts \
  packages/core/src/services/video/mobileHlsService.test.ts \
  packages/core/src/services/auth/apiSessionService.test.ts \
  packages/core/src/services/auth/apiVkAuthService.test.ts \
  packages/core/src/services/common/fileConstraints.test.ts

pnpm --filter @gafus/api test -- \
  apps/api/src/routes/v1/payments.route.test.ts \
  apps/api/src/routes/v1/training.route.test.ts \
  apps/api/src/routes/v1/training.validation.test.ts \
  apps/api/src/routes/v1/auth.route.test.ts \
  apps/api/src/routes/v1/pets.route.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Run package typechecks**

```bash
pnpm --filter @gafus/core typecheck
pnpm --filter @gafus/api typecheck
```

Expected: both PASS.

- [ ] **Step 3: Confirm API has no direct Prisma in routes except health**

```bash
rg -n "from \"@gafus/prisma\"|prisma\\." apps/api/src/routes apps/api/src/middleware
```

Expected remaining acceptable hit:

```text
apps/api/src/routes/v1/health.ts
```

`apps/api/src/routes/v1/payments.ts` should not appear.

- [ ] **Step 4: Confirm training route no longer owns HLS internals**

```bash
rg -n "downloadFileFromCDN|extractVideoIdFromCdnUrl|getVideoAccessService|validateHlsSegmentPath|HLS_SEGMENT|manifestContent|modifiedManifest" apps/api/src/routes/v1/training.ts
```

Expected: no matches.

- [ ] **Step 5: Confirm auth route no longer owns refresh hash/rotation**

```bash
rg -n "createHash|generateAccessToken|generateRefreshToken|verifyRefreshToken|createRefreshSession|rotateRefreshToken|REFRESH_EXPIRES_MS" apps/api/src/routes/v1/auth.ts
```

Expected: no matches.

- [ ] **Step 6: Final commit if needed**

If the final verification required small fixes after previous commits:

```bash
git add packages/core apps/api
git commit -m "test: verify backend core refactor"
```

If no changes remain, do not create an empty commit.

## Rollback Notes

Each task is independently revertible because route contracts are preserved and new core services are introduced per domain. If Task 3 auth refactor causes unexpected behavior, revert only the auth commit and keep payments/video changes.

## Review Checklist

- `apps/api` route files should primarily do request parsing, auth context extraction, service invocation, and HTTP response mapping.
- `packages/core` service tests should cover business outcomes without constructing Hono apps.
- New core services must not import `hono`.
- Response bodies and status codes in existing route tests must remain unchanged unless a separate bugfix is intentionally made.
- Direct Prisma imports in API routes should be limited to health/readiness checks.
