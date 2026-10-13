import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FeedTopBar } from "./FeedTopBar";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@mui/icons-material", () => {
  const Icon = () => <span aria-hidden="true" />;
  return {
    AddRounded: Icon,
    ArticleOutlined: Icon,
    BookmarkBorderOutlined: Icon,
    NotificationsNoneOutlined: Icon,
    PersonOffOutlined: Icon,
  };
});
vi.mock("@/shared/components/ui", () => ({
  PrimaryButtonLink: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a data-shared="primary" href={href} {...props}>
      {children}
    </a>
  ),
  SecondaryButtonLink: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a data-shared="secondary" href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("FeedTopBar", () => {
  it("inherits GAFUS buttons for creating posts and opening notifications", () => {
    const html = renderToStaticMarkup(<FeedTopBar active="feed" />);
    expect(html).toContain('data-shared="primary"');
    expect(html).toContain('href="/feed/create"');
    expect(html).toContain("Новая публикация");
    expect(html).toContain('data-shared="secondary"');
    expect(html).toContain('href="/feed/notifications"');
    expect(html).toContain('aria-label="Уведомления"');
  });

  it("hides all header actions when feed access is disabled", () => {
    const html = renderToStaticMarkup(<FeedTopBar active="feed" showActions={false} />);
    expect(html).not.toContain('data-shared="primary"');
    expect(html).not.toContain('data-shared="secondary"');
    expect(html).not.toContain('href="/feed/create"');
    expect(html).toContain("Моменты");
  });
});
