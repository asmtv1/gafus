import { describe, expect, it } from "vitest";
import { changedProfileFields, exactProfileReadbackMatches } from "./profile-edit-changed-fields";
const original = () => ({
  fullName: "Анна",
  city: "Самара",
  about: "О себе",
  telegram: "anna123",
  instagram: null,
  website: null,
  birthDate: "1990-05-10T00:00:00.000Z",
});
describe("Mobile profile owner-safe partial payload and exact server readback", () => {
  it("unchanged ISO birth date and null contact fields never trigger whole-form PUT", () => {
    expect(
      changedProfileFields(original(), {
        ...original(),
        birthDate: "1990-05-10",
        instagram: "",
        website: "",
      }),
    ).toEqual({});
  });
  it("single changed city cannot overpost private profile fields", () => {
    expect(changedProfileFields(original(), { city: "Казань", birthDate: "1990-05-10" })).toEqual({
      city: "Казань",
    });
  });
  it("explicit empty about clears only about, null GET proves clearance", () => {
    expect(changedProfileFields(original(), { about: "" })).toEqual({ about: "" });
    expect(exactProfileReadbackMatches({ about: "" }, { ...original(), about: null })).toBe(true);
  });
  it("real server ISO DOB with time matches YYYY-MM-DD calendar day", () => {
    expect(
      exactProfileReadbackMatches(
        { birthDate: "1991-01-02" },
        { ...original(), birthDate: "1991-01-02T00:00:00.000Z" },
      ),
    ).toBe(true);
  });
  it("stale persisted field or unreadable profile never authorizes success", () => {
    expect(exactProfileReadbackMatches({ city: "Казань" }, original())).toBe(false);
    expect(exactProfileReadbackMatches({ city: "Казань" }, null)).toBe(false);
  });
});
