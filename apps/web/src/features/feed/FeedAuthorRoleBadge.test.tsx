import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeedAuthorRoleBadge } from "./FeedAuthorRoleBadge";

describe("Moments Web post author badges", () => {
  it("renders distinct badges for administrator and trainer", () => {
    expect(renderToStaticMarkup(<FeedAuthorRoleBadge role="ADMIN" />)).toContain("Администратор");
    expect(renderToStaticMarkup(<FeedAuthorRoleBadge role="TRAINER" />)).toContain("Кинолог");
  });

  it("does not render badges for ordinary authors or older API responses", () => {
    expect(renderToStaticMarkup(<FeedAuthorRoleBadge role={null} />)).toBe("");
    expect(renderToStaticMarkup(<FeedAuthorRoleBadge />)).toBe("");
  });
});
