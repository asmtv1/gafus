import { describe, expect, it } from "vitest";
import { questionAuthorProfileIdentifier } from "./profileLink";

describe("questionAuthorProfileIdentifier", () => {
  it("prefers username", () => {
    expect(questionAuthorProfileIdentifier({ id: "user-123", username: "marta" })).toBe("marta");
  });
  it("uses session username when the old API omits username for the current user", () => {
    expect(questionAuthorProfileIdentifier({ id: "user-123" }, { id: "user-123", username: "owner" })).toBe("owner");
  });
  it("uses stable id for an old API payload", () => {
    expect(questionAuthorProfileIdentifier({ id: "user-123" })).toBe("user-123");
    expect(questionAuthorProfileIdentifier({ id: "user-123", username: "" })).toBe("user-123");
  });
});
