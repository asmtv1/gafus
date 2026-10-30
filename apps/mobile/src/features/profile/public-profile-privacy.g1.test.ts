import { describe, expect, it } from "vitest";
import type { PublicProfile } from "@/shared/lib/api/user";
import { projectPublicProfile, publicContactLinks } from "./public-profile-privacy";
const seed = (): PublicProfile => ({
  username: "alice",
  role: "USER",
  profile: {
    fullName: "Алиса",
    city: "Самара",
    birthDate: null,
    about: "Привет",
    telegram: "alice123",
    instagram: "alice.123",
    website: "https://example.com/path",
    avatarUrl: "https://cdn.example/avatar.jpg",
  },
  pets: [
    { id: "pub", name: "Публичный", type: "DOG", breed: "Корги", birthDate: null, photoUrl: null },
  ],
});
describe("AG3-PROFILE031 runtime public privacy projection & external links", () => {
  it("does not pass unknown user PII/account state to child views", () => {
    const raw = {
      ...seed(),
      email: "secret@mail.example",
      phone: "+799900000",
      passwordHash: "hash",
      balance: 999,
    };
    const result = projectPublicProfile(raw as PublicProfile);
    expect(JSON.stringify(result)).not.toMatch(/secret@mail|799900000|passwordHash|balance/);
    expect(result?.profile?.fullName).toBe("Алиса");
  });
  it("private pet false removed and visible pet projections strip vet/document/measurements", () => {
    const data = seed();
    data.pets = [
      {
        ...data.pets![0],
        showInProfile: false,
        medicalRecords: [{ diagnosis: "secret" }],
      } as unknown as NonNullable<PublicProfile["pets"]>[number],
      {
        ...data.pets![0],
        id: "safe",
        notes: "secret pet notes",
        heightCm: 55,
        documents: ["secret-doc"],
      } as unknown as NonNullable<PublicProfile["pets"]>[number],
    ];
    const result = projectPublicProfile(data);
    expect(result?.pets).toEqual([
      {
        id: "safe",
        name: "Публичный",
        type: "DOG",
        breed: "Корги",
        birthDate: null,
        photoUrl: null,
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/diagnosis|notes|documents|heightCm/);
  });
  it("private course listing remains displayable but cannot contain extra customer fields", () => {
    const data = seed();
    data.role = "TRAINER";
    data.courses = [
      {
        id: "course-1",
        name: "Собака",
        type: "BASIC",
        logoImg: "",
        shortDesc: "Курс",
        duration: "10",
        isPrivate: true,
        isPaid: false,
        avgRating: null,
        updatedAt: "2026-01-01",
        trainingLevel: "BEGINNER",
        secretKey: "private",
      } as unknown as NonNullable<PublicProfile["courses"]>[number],
    ];
    const result = projectPublicProfile(data);
    expect(result?.courses?.[0]?.isPrivate).toBe(true);
    expect(JSON.stringify(result)).not.toContain("secretKey");
  });
  it("malicious website scheme, credentials and malformed handles never create clickable URL", () => {
    const raw = seed().profile!;
    expect(
      publicContactLinks({
        ...raw,
        website: "javascript:alert(1)",
        telegram: "../steal",
        instagram: "bad/abc",
      }),
    ).toEqual({ telegram: null, instagram: null, website: null });
    expect(
      publicContactLinks({ ...raw, website: "https://login:pw@host.example" }).website,
    ).toBeNull();
  });
  it("valid links use only controlled https targets without leaking raw arbitrary URLs", () => {
    const links = publicContactLinks(seed().profile);
    expect(links.telegram?.url).toBe("https://t.me/alice123");
    expect(links.instagram?.url).toBe("https://instagram.com/alice.123");
    expect(links.website?.url).toBe("https://example.com/path");
  });
  it("malformed payload cannot be displayed as another public profile", () => {
    expect(projectPublicProfile({ username: "", role: "USER" } as PublicProfile)).toBeNull();
    expect(
      projectPublicProfile({ username: "alice", role: null } as unknown as PublicProfile),
    ).toBeNull();
  });
});
