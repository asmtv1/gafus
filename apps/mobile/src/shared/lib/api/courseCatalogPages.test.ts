import { describe, expect, it, vi } from "vitest";
import { collectCourseCatalog } from "./courseCatalogPages";

const card = (id: string, createdAt = "2026-11-26T00:00:00.000Z") => ({
  id, createdAt, updatedAt: createdAt, name: "Course", type: "base", description: "Searchable",
  shortDesc: "Short", duration: "1 day", logoImg: "/logo", authorUsername: "Author",
  trainingLevel: "BEGINNER", userStatus: "NOT_STARTED", isPaid: false, isPrivate: false,
  hasAccess: true, isFavorite: false, avgRating: null, startedAt: null, completedAt: null,
  reviewsCount: 2, startedUsersCount: 4,
});
const page = (items: ReturnType<typeof card>[], next: {id: string; createdAt: string} | null) => ({
  success: true, data: {items, next},
});
describe("compact owner-scoped course catalog", () => {
  it("follows cursor and retains card fields without fetching individual courses", async () => {
    const a = card("a"), b = card("b", "2026-11-25T00:00:00.000Z");
    const fetch = vi.fn().mockResolvedValueOnce(page([a], {id:a.id,createdAt:a.createdAt}))
      .mockResolvedValueOnce(page([b], null));
    await expect(collectCourseCatalog(fetch, () => true)).resolves.toEqual({success:true,data:[a,b]});
    expect(fetch.mock.calls).toEqual([["/api/v1/courses"], ["/api/v1/courses?afterId=a&before="+encodeURIComponent(a.createdAt)]]);
  });
  it("accepts the legacy array for a rolling deployment", async () => {
    const legacy = {...card("old"), reviews: [], userCourses: [], dayLinks: []};
    await expect(collectCourseCatalog(async () => ({success:true,data:[legacy]}), () => true))
      .resolves.toEqual({success:true,data:[legacy]});
  });
  it("refuses duplicate ids and mismatched cursor", async () => {
    const a = card("a");
    const fetch = vi.fn().mockResolvedValueOnce(page([a], {id:a.id,createdAt:a.createdAt}))
      .mockResolvedValueOnce(page([a], null));
    await expect(collectCourseCatalog(fetch, () => true)).resolves.toMatchObject({code:"INVALID_COURSE_CATALOG"});
    await expect(collectCourseCatalog(async () => page([a], {id:"other",createdAt:a.createdAt}), () => true))
      .resolves.toMatchObject({code:"INVALID_COURSE_CATALOG"});
  });
  it("discards partial data on an account switch during a request", async () => {
    let current = true;
    await expect(collectCourseCatalog(async () => {current = false; return page([card("a")], null);}, () => current))
      .resolves.toMatchObject({success:false,code:"G05_SESSION_CHANGED"});
  });
  it("refuses mixed legacy and compact responses", async () => {
    const a = card("a");
    const fetch = vi.fn().mockResolvedValueOnce(page([a], {id:a.id,createdAt:a.createdAt}))
      .mockResolvedValueOnce({success:true,data:[card("b")]});
    await expect(collectCourseCatalog(fetch, () => true)).resolves.toMatchObject({code:"INVALID_COURSE_CATALOG"});
  });
});
