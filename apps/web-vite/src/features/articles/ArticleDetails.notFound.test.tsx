import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ArticleDetails } from "./ArticleDetails";

const queryState = vi.hoisted(() => ({ status: 404 }));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ setQueryData: vi.fn() }),
  useQuery: () => ({
    isPending: false,
    isError: true,
    isSuccess: false,
    error: { status: queryState.status },
    refetch: vi.fn(),
  }),
}));
vi.mock("./articleApi", () => ({ getMyArticle: vi.fn() }));
vi.mock("../../shared/router/location", () => ({
  RouteLink: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

describe("ArticleDetails direct-link error state", () => {
  it("shows a terminal not-found state for HTTP 404, without futile retry", () => {
    queryState.status = 404;
    const html = renderToStaticMarkup(<ArticleDetails userId="owner-A" slug="absent" />);
    expect(html).toContain("Статья не найдена.");
    expect(html).toContain('href="/articles"');
    expect(html).not.toContain("Повторить");
  });

  it("retains retry for a transient server error", () => {
    queryState.status = 503;
    const html = renderToStaticMarkup(<ArticleDetails userId="owner-A" slug="existing" />);
    expect(html).toContain("Не удалось открыть статью.");
    expect(html).toContain("Повторить");
    expect(html).not.toContain("Статья не найдена.");
  });
});
