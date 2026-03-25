import { describe, expect, it } from "vitest";

import * as errors from "./index";

describe("errors barrel", () => {
  it("реэкспортирует классы и handlePrismaError", () => {
    expect(typeof errors.ServiceError).toBe("function");
    expect(typeof errors.NotFoundError).toBe("function");
    expect(typeof errors.handlePrismaError).toBe("function");
    expect(typeof errors.getErrorMessage).toBe("function");
  });
});
