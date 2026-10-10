import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PublicProfile } from "@gafus/types";
import PublicPets from "./PublicPets";
import ProfileClient from "@/app/(main)/profile/ProfileClient";

vi.mock("@/features/profile", () => ({
  Bio: () => null, PrivateProfileSection: () => null,
  SettingsActions: () => null, StudentNotes: () => null,
}));
vi.mock("@/features/gallery", () => ({ GalleryPreview: () => null }));
vi.mock("@/features/feed/ProfileFeedPreview", () => ({ ProfileFeedPreview: () => null }));
vi.mock("@gafus/core/utils", async () => ({
  ...(await import("../../../../../../../packages/core/src/utils/pet")),
}));

const publicData: PublicProfile = {
  username: "student", role: "USER", profile: null, diplomas: [],
  pets: [{ id: "pet-1", name: "Лада", type: "DOG", breed: "Метис", birthDate: new Date("2020-01-15"), photoUrl: null }],
};

describe("public pets placement", () => {
  it("omits the entire section when the public list is empty", () => {
    expect(renderToStaticMarkup(<PublicPets pets={[]} />)).toBe("");
  });
  it("shows a summary to visitors without owner controls", () => {
    const html = renderToStaticMarkup(<ProfileClient publicData={publicData} isOwner={false} username="student" userData={null} />);
    expect(html).toContain("Лада");
    expect(html).toContain("Метис");
    expect(html).not.toContain("Показывать в профиле");
    expect(html).not.toContain("Изменить данные");
  });
  it("keeps the owner's profile tab free of pets even if public data contains them", () => {
    const html = renderToStaticMarkup(<ProfileClient publicData={publicData} isOwner username="student" userData={null} />);
    expect(html).not.toContain("Лада");
    expect(html).not.toContain("Питомцы");
  });
});
