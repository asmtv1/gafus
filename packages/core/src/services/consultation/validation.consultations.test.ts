import { describe, expect, it } from "vitest";

import { getSlotsQuerySchema } from "./validation";

/** Сверка с testing.mdc: граничные случаи схемы консультаций. */
describe("getSlotsQuerySchema (consultations)", () => {
  it("принимает валидный интервал", () => {
    const r = getSlotsQuerySchema.safeParse({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-15T00:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });

  it("отклоняет from/to длиннее 64 символов (защита query)", () => {
    const long = "x".repeat(65);
    const r = getSlotsQuerySchema.safeParse({
      from: long,
      to: "2026-01-02T00:00:00.000Z",
    });
    expect(r.success).toBe(false);
  });
});
