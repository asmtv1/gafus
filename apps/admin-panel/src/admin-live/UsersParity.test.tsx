import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UsersPanel } from "./UserManagement";

const original = {
  id: "user-001", username: "dogowner", email: "dog@example.test", phone: null,
  role: "USER", registrationChannel: "WEB", createdAt: "2026-10-21T09:00:00Z",
  profile: { fullName: "Хозяин собаки", avatarUrl: null },
  savedRegistrationPromoCode: null, partnerProfile: null,
  _count: { pushSubscriptions: 2 },
};
const props = { actorRole: "ADMIN" as const, actorId: "admin-1", onSaved: vi.fn() };

describe("admin users Next table parity", () => {
  it("restores a separate user ID, role chip, localized channel, and default avatar", () => {
    const html = renderToStaticMarkup(createElement(UsersPanel, {
      ...props, source: { users: [original], freePartnerPromoCodes: [] },
    }));
    expect(html).toContain("<th>ID</th>");
    expect(html).toContain("<code>user-001</code>");
    expect(html).toContain("admin-user-avatar");
    expect(html).toContain("admin-user-role-user");
    expect(html).toContain("Хозяин собаки");
    expect(html).toContain("<td>Веб</td>");
    expect(html).toContain("1–1 из 1");
    expect(html).toContain('value="25" selected=""');
  });
  it("shows exactly the first 25 out of 26 users and paginates correctly", () => {
    const users = Array.from({ length: 26 }, (_, i) => ({
      ...original, id: `user-${String(i).padStart(3, "0")}`,
      username: `dogowner${i}`, createdAt: `2026-10-21T09:${String(i).padStart(2, "0")}:00Z`,
    }));
    const html = renderToStaticMarkup(createElement(UsersPanel, {
      ...props, source: { users, freePartnerPromoCodes: [] },
    }));
    expect((html.match(/admin-user-role-user/g) ?? [])).toHaveLength(25);
    expect(html).toContain("1–25 из 26");
    expect(html).toContain("Страница 1 из 2");
  });
  it("rejects malformed user list without rendering private row data", () => {
    const html = renderToStaticMarkup(createElement(UsersPanel, {
      ...props, source: { users: [{ id: 5, username: "bad" }], freePartnerPromoCodes: [] },
    }));
    expect(html).toContain("Некорректный ответ списка пользователей");
    expect(html).not.toContain("dog@example.test");
  });
});
