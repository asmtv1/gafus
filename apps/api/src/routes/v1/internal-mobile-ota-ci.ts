import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod/v3";
import { getNativeOtaDescriptorForCi } from "@gafus/mobile-ota-server/queries";
import {
  ciSignedReleaseSchema, MobileOtaCiError, registerVerifiedOtaCiResult,
} from "@gafus/mobile-ota-server/ci-registration";

export const internalMobileOtaCiRoutes = new Hono();
internalMobileOtaCiRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
});
internalMobileOtaCiRoutes.use("*", async (c, next) => {
  const token = process.env.MOBILE_OTA_CI_CALLBACK_TOKEN;
  const cdnOrigin = (process.env.MOBILE_OTA_ASSET_ORIGIN ?? process.env.MOBILE_OTA_CDN_ORIGIN);
  if (!token || token.length < 32 || !cdnOrigin)
    return c.json({ success: false, code: "OTA_CI_CALLBACK_DISABLED" }, 404);
  const bearer = c.req.header("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!bearer || bearer.length > 512) return c.json({ success: false, code: "UNAUTHORIZED" }, 401);
  const expected = Buffer.from(token);
  const supplied = Buffer.from(bearer);
  if (expected.length !== supplied.length || !timingSafeEqual(expected,supplied))
    return c.json({ success: false, code: "UNAUTHORIZED" }, 401);
  await next();
});

// The signing certificate is public, but the verified native build descriptor
// is only exposed to the protected CI actor, never to device requests.
internalMobileOtaCiRoutes.get("/native-releases/:id", async (c) => {
  const id = z.string().uuid().safeParse(c.req.param("id"));
  if (!id.success) return c.json({ success: false, code: "INVALID_NATIVE_ID" }, 400);
  try {
    const row = await getNativeOtaDescriptorForCi(id.data);
    if (!row || !row.verified || !row.certificatePem)
      return c.json({ success: false, code: "VERIFIED_NATIVE_RELEASE_NOT_FOUND" }, 404);
    return c.json({ success: true, data: row });
  } catch {
    return c.json({ success: false, code: "OTA_REGISTRY_UNAVAILABLE" }, 503);
  }
});

internalMobileOtaCiRoutes.post("/ci-complete", async (c) => {
  const cdnOrigin = (process.env.MOBILE_OTA_ASSET_ORIGIN ?? process.env.MOBILE_OTA_CDN_ORIGIN)!;
  const parsed = ciSignedReleaseSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ success: false, code: "INVALID_CI_RESULT" }, 400);
  try {
    const result = await registerVerifiedOtaCiResult(parsed.data, cdnOrigin);
    return c.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof MobileOtaCiError)
      return c.json({ success: false, code: error.code }, 409);
    return c.json({ success: false, code: "OTA_CI_RESULT_UNAVAILABLE" }, 503);
  }
});
