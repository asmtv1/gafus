import { describe, expect, it } from "vitest";

import * as age from "./index";

describe("utils/age barrel", () => {
  it("реэкспортирует getAge и getAgeWithMonths", () => {
    expect(typeof age.getAge).toBe("function");
    expect(typeof age.getAgeWithMonths).toBe("function");
  });
});
