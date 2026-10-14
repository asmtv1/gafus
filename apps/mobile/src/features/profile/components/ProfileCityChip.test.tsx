import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: {
    OS: "ios",
    select: (options: { ios?: unknown; default?: unknown }) => options.ios ?? options.default,
  },
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({
    accessibilityLabel,
    children,
    style,
  }: {
    accessibilityLabel: string;
    children: React.ReactNode;
    style: { flexDirection: string; maxWidth: string; alignItems: string; flexWrap?: string };
  }) => (
    <div
      aria-label={accessibilityLabel}
      data-direction={style.flexDirection}
      data-align={style.alignItems}
      data-wrap={style.flexWrap}
      data-max-width={style.maxWidth}
    >
      {children}
    </div>
  ),
}));

vi.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: ({ name }: { name: string }) => <i data-icon={name} />,
}));

vi.mock("react-native-paper", () => ({
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { ProfileCityChip, ProfileMetaRow } from "./ProfileCityChip";

describe("ProfileCityChip", () => {
  it("keeps the leading icon and city name inside the same compact badge", () => {
    const markup = renderToStaticMarkup(<ProfileCityChip city="Самара" />);
    expect(markup).toContain('aria-label="Город: Самара"');
    expect(markup).toContain('data-direction="row"');
    expect(markup).toContain('data-align="center"');
    expect(markup).toContain('data-max-width="100%"');
    expect(markup).toMatch(
      /<div[^>]+><i data-icon="map-marker-outline"><\/i><span>Самара<\/span><\/div>/,
    );
  });

  it("keeps a full accessible city name even for a long value", () => {
    const markup = renderToStaticMarkup(<ProfileCityChip city="Александровск-Сахалинский" />);
    expect(markup).toContain('aria-label="Город: Александровск-Сахалинский"');
  });
});

describe("ProfileMetaRow", () => {
  it("places city and age as separate compact chips in one wrapping row", () => {
    const markup = renderToStaticMarkup(
      <ProfileMetaRow city="Самара" ageLabel="Возраст: 25 лет" />,
    );
    expect(markup).toContain('aria-label="Город: Самара"');
    expect(markup).toContain('aria-label="Возраст: 25 лет"');
    expect(markup).toContain('data-direction="row"');
    expect(markup).toContain('data-wrap="wrap"');
    expect(markup).toContain("<span>Возраст: 25 лет</span>");
    expect(markup.match(/data-icon="map-marker-outline"/g) ?? []).toHaveLength(1);
  });

  it("works with only one field and renders no unnecessary empty row", () => {
    const ageOnly = renderToStaticMarkup(<ProfileMetaRow ageLabel="Возраст: 3 года" />);
    expect(ageOnly).toContain("Возраст: 3 года");
    expect(ageOnly).not.toContain("map-marker-outline");
    expect(renderToStaticMarkup(<ProfileMetaRow />)).toBe("");
  });
});
