import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CaramelButton, CaramelButtonLink, PrimaryButton, PrimaryButtonLink,
  SecondaryButton, SecondaryButtonLink, PurpleButton, primaryButtonClassName,
} from "./Buttons";

describe("Next shared button parity", () => {
  it("defaults all actions to type=button; retains submit and native disabled attributes", () => {
    const olive = renderToStaticMarkup(<PrimaryButton disabled>Открыть</PrimaryButton>);
    expect(olive).toContain('type="button"');
    expect(olive).toContain('disabled=""');
    expect(olive).toContain(primaryButtonClassName);
    expect(renderToStaticMarkup(<SecondaryButton type="submit" variant="red">Удалить</SecondaryButton>))
      .toContain('type="submit"');
    expect(renderToStaticMarkup(<CaramelButton>Изменить</CaramelButton>))
      .toContain('type="button"');
    expect(renderToStaticMarkup(<PurpleButton>Редактировать вопрос</PurpleButton>))
      .toContain('data-gafus-shared-button="purple"');
  });

  it("exposes the original olive large/fullWidth and red/default variants", () => {
    const regular = renderToStaticMarkup(<PrimaryButton>OK</PrimaryButton>);
    const large = renderToStaticMarkup(<PrimaryButton fullWidth size="large">OK</PrimaryButton>);
    expect(large).not.toBe(regular);
    const muted = renderToStaticMarkup(<SecondaryButton>Отмена</SecondaryButton>);
    const red = renderToStaticMarkup(<SecondaryButton variant="red">Удалить</SecondaryButton>);
    expect(red).not.toBe(muted);
  });

  it("renders navigation as real anchors with class, href and labels", () => {
    for (const node of [
      <PrimaryButtonLink key="p" href="/courses" aria-label="Курсы">Курсы</PrimaryButtonLink>,
      <SecondaryButtonLink key="s" href="/pets" variant="red">Питомцы</SecondaryButtonLink>,
      <CaramelButtonLink key="c" href="/articles">Статьи</CaramelButtonLink>,
    ]) {
      const html = renderToStaticMarkup(node);
      expect(html).toMatch(/<a /);
      expect(html).toContain('href="/');
      expect(html).toContain("class=");
    }
  });
});
