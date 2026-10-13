import { describe, expect, it } from "vitest";
import { questionListSchema } from "./schemas";

describe("question list author filtering", () => {
  it("accepts a public username and preserves the existing mine filter", () => {
    expect(questionListSchema.parse({ author: "asmtv1" }).author).toBe("asmtv1");
    expect(questionListSchema.parse({ mine: "true", author: "asmtv1" }).mine).toBe(true);
    expect(questionListSchema.parse({}).author).toBeUndefined();
  });

  it("rejects empty or oversized usernames", () => {
    expect(() => questionListSchema.parse({ author: "" })).toThrow();
    expect(() => questionListSchema.parse({ author: "x".repeat(101) })).toThrow();
  });
});
