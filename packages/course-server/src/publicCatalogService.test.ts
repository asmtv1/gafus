import {describe,it,expect,beforeEach,vi} from "vitest";
const mockCourseFindMany=vi.hoisted(()=>vi.fn());
const mockUserCourseFindMany=vi.hoisted(()=>vi.fn());
const mockFavoriteCourseFindMany=vi.hoisted(()=>vi.fn());
vi.mock("@gafus/prisma",()=>({prisma:{
 course:{findMany:mockCourseFindMany},
 userCourse:{findMany:mockUserCourseFindMany},
 favoriteCourse:{findMany:mockFavoriteCourseFindMany}
}}));
import {getPublicCoursesCatalog} from "./publicCatalogService.js";
describe("getPublicCoursesCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("делает ровно один public-only select и сохраняет free/paid порядок и поля", async () => {
    mockCourseFindMany.mockResolvedValue([
      {
        id: "paid",
        name: "Paid",
        type: "paid-type",
        shortDesc: "Paid course",
        logoImg: "https://storage.yandexcloud.net/gafus-media/uploads/course/paid.webp",
        duration: "10",
        isPaid: true,
        trainingLevel: "ADVANCED",
      },
      {
        id: "free",
        name: "Free",
        type: "free-type",
        shortDesc: "Free course",
        logoImg: "https://storage.yandexcloud.net/gafus-media/uploads/course/free.webp?sig=private",
        duration: "5",
        isPaid: false,
        trainingLevel: "BEGINNER",
      },
    ]);

    const result = await getPublicCoursesCatalog();

    expect(mockCourseFindMany).toHaveBeenCalledExactlyOnceWith({
      where: { isPrivate: false },
      select: {
        id: true,
        name: true,
        type: true,
        shortDesc: true,
        logoImg: true,
        duration: true,
        isPaid: true,
        trainingLevel: true,
      },
    });
    expect(result).toEqual([
      {
        id: "paid",
        name: "Paid",
        type: "paid-type",
        shortDesc: "Paid course",
        logoImg: "https://storage.yandexcloud.net/gafus-media/uploads/course/paid.webp",
        duration: "10",
        isPaid: true,
        isPrivate: false,
        hasAccess: false,
        isFavorite: false,
        userStatus: "NOT_STARTED",
        trainingLevel: "ADVANCED",
      },
      {
        id: "free",
        name: "Free",
        type: "free-type",
        shortDesc: "Free course",
        duration: "5",
        isPaid: false,
        isPrivate: false,
        hasAccess: true,
        isFavorite: false,
        userStatus: "NOT_STARTED",
        trainingLevel: "BEGINNER",
      },
    ]);
    expect(mockUserCourseFindMany).not.toHaveBeenCalled();
    expect(mockFavoriteCourseFindMany).not.toHaveBeenCalled();
  });
});
