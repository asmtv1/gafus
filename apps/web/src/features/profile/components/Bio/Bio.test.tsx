import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PublicProfile } from "@gafus/types";
import Bio from "./Bio";

vi.mock("../ProfileIcon", () => ({ ProfileIcon: () => <span aria-hidden="true" /> }));
vi.mock("../EditableAvatar", () => ({ default: () => <span /> }));
vi.mock("../ProfileAvatar", () => ({ default: () => <span /> }));
vi.mock("../TrainerCoursesSection", () => ({ default: () => <div data-testid="courses" /> }));
vi.mock("../SocialIcons", () => ({
  InstagramIcon: () => <span />,
  TelegramIcon: () => <span />,
  WebsiteIcon: () => <span />,
}));
vi.mock("@mui/icons-material/OpenInNewRounded", () => ({ default: () => <span /> }));
vi.mock("@mui/icons-material/LocationOnOutlined", () => ({ default: () => <span /> }));
vi.mock("@/shared/components/ui", () => ({
  primaryButtonClassName: "",
  SecondaryButtonLink: ({
    children,
    href,
    title,
    prefetch: _prefetch,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => (
    <a href={href} title={title} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@shared/components/analytics/ProfileAnalyticsLink", () => ({
  ProfileAnalyticsLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const profile: PublicProfile = {
  username: "dogtrainer",
  role: "TRAINER",
  profile: {
    fullName: "Лана Петренко",
    city: "Самара",
    birthDate: new Date("1998-03-20"),
    about: "Обучаю мягкими методами.\nПомогаю владельцам и питомцам.",
    instagram: "very_long_dogtrainer_profile_name_example",
    telegram: "trainer_lana",
    website: "https://www.example.com/about/coach?source=profile",
    avatarUrl: null,
  },
  diplomas: [],
  pets: [],
};
describe("Professional profile bio layout", () => {
  it("keeps biography and links in their own sections with full accessible link destinations", () => {
    const html = renderToStaticMarkup(
      <Bio publicData={profile} isOwner={false} username={profile.username} />,
    );
    expect(html).toContain("Лана Петренко");
    expect(html).toContain("Обучаю мягкими методами.");
    expect(html).toContain("Помогаю владельцам и питомцам.");
    expect(html).toContain('aria-label="Контакты специалиста"');
    expect(html).toContain("Instagram");
    expect(html).toContain("Телеграм");
    expect(html).toContain("example.com");
    expect(html).toContain('href="https://www.example.com/about/coach?source=profile"');
    expect(html).toContain("Самара");
    expect(html).toContain("Кинолог");
  });

  it("does not render empty social actions", () => {
    const empty: PublicProfile = {
      ...profile,
      role: "USER",
      profile: {
        ...profile.profile!,
        instagram: null,
        telegram: null,
        website: null,
      },
    };
    const html = renderToStaticMarkup(
      <Bio publicData={empty} isOwner={false} username="visitor" />,
    );
    expect(html).not.toContain('aria-label="Контакты специалиста"');
    expect(html).toContain("Обучаю мягкими методами.");
  });
});
