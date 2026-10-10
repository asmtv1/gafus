import { Hono } from "hono";
import { handlePetVetVisitRequest } from "@gafus/core/services/pets";

export const petVetVisitRoutes = new Hono();
petVetVisitRoutes.all("/:petId/vet-visits", (c) =>
  handlePetVetVisitRequest(c.req.raw, c.req.param("petId"), c.get("user").id, []),
);
petVetVisitRoutes.all("/:petId/vet-visits/*", (c) => {
  const suffix = new URL(c.req.url).pathname.split("/vet-visits/")[1] ?? "";
  return handlePetVetVisitRequest(
    c.req.raw,
    c.req.param("petId"),
    c.get("user").id,
    suffix.split("/").filter(Boolean),
  );
});
