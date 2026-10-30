/** Source-only owner-scoped Hono GET; mount only after AG4 review. */
import { Hono } from "hono";
import { getOwnVetVisitDetail, VetVisitDetailNotFoundError } from
  "../../../../../packages/core/src/services/pets/g1VetVisitDetailRead.review.js";

export const vetVisitDetailReviewRoutes = new Hono();
const ID = /^[a-zA-Z0-9_-]{1,128}$/;
vetVisitDetailReviewRoutes.get("/:petId/vet-visits/:visitId", async (c) => {
  c.header("Cache-Control", "private, no-store, max-age=0");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");
  const actor = c.get("user");
  if (!actor?.id) return c.json({ success: false, code: "UNAUTHORIZED" }, 401);
  const petId = c.req.param("petId"), visitId = c.req.param("visitId");
  if (!ID.test(petId) || !ID.test(visitId) || new URL(c.req.url).search) {
    return c.json({ success: false, code: "VET_VISIT_NOT_FOUND" }, 404);
  }
  try {
    const data = await getOwnVetVisitDetail(actor.id, petId, visitId);
    return c.json({ success: true, data }, 200);
  } catch (error) {
    if (error instanceof VetVisitDetailNotFoundError) {
      return c.json({ success: false, code: "VET_VISIT_NOT_FOUND" }, 404);
    }
    // Medical and attachment information never enters logs or errors.
    return c.json({ success: false, code: "VET_VISIT_READ_FAILED" }, 500);
  }
});
