// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import {
  routeForPath,
  trainingReviewsPath,
  trainingReviewsTypeFromPath,
  trainingRouteFromPath,
  trainingDayPath,
  trainingCoursePath,
} from "../../shared/router/location";
import type { TrainingDaysOverview, TrainingDaySummary } from "./trainingDaysApi";
import type { TrainingDayDetail } from "./trainingDayApi";
import type { DailyToday, DailyDay } from "../daily-course/dailyCourseApi";
import type { ReviewsSourceLoader } from "./CourseReviewsPanel";
const course = (hasAccess = true) => ({
  id: "course_01",
  name: "Самоконтроль",
  type: "IMPULSE_CONTROL",
  shortDesc: "Контролируем возбуждение",
  duration: "14 дней",
  isPaid: false,
  isPrivate: false,
  hasAccess,
  isFavorite: false,
  userStatus: "IN_PROGRESS",
  trainingLevel: "BEGINNER",
});
const reviews = (count = 7) => ({
  courseName: "Самоконтроль",
  reviews: Array.from({ length: count }, (_, i) => ({
    id: "r_" + i,
    rating: (i % 5) + 1,
    comment: "Текст отзыва " + i,
    createdAt: "2026-10-20T12:00:00Z",
    user: {
      id: i === 0 ? "A" : "B",
      username: i === 0 ? "owner" : "reviewer",
      profile: { avatarUrl: "PRIVATE_AVATAR" },
    },
  })),
  userStatus: { hasCompleted: true, userReview: count ? { id: "r_0", user: { id: "A" } } : null },
});
beforeAll(async()=>{await Promise.all([
  import("./CourseReviewsOptIn"),
  import("./TrainingIndexOptInHarness"),
  import("../courses/CourseOverview"),
  import("../../brand/PublicLanding"),
]);});
const wait = async () => {
  for(let i=0;i<5;i++) {
    await act(async()=>{await new Promise(done=>setTimeout(done,80));});
  }
};
let cache: QueryClient;
let root: Root;
let node: HTMLDivElement;
let fetcher: ReturnType<typeof vi.fn>;
let loader: ReturnType<typeof vi.fn<ReviewsSourceLoader>>;
let entitlement = true;
const overview = (): TrainingDaysOverview => ({
  courseId: null,
  courseDescription: null,
  courseEquipment: null,
  courseTrainingLevel: null,
  requiresPersonalization: false,
  days: [],
});
const loadDays = async (_type: string) => overview();
const loadDay = async (_type: string, _day: TrainingDaySummary) => ({}) as TrainingDayDetail;
const loadToday = async () => ({}) as DailyToday;
const loadDaily = async (_today: DailyToday) => ({}) as DailyDay;
async function mount(
  path = "/trainings/IMPULSE_CONTROL/reviews",
  options: {
    enabled?: boolean;
    withLoader?: boolean;
    withTrainingLoaders?: boolean;
  } = {},
) {
  window.history.replaceState(null, "", path);
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <App
          showTrainingFlowOptIn={options.enabled ?? true}
          trainingDaysLoader={options.withTrainingLoaders === false ? undefined : loadDays}
          trainingDayLoader={options.withTrainingLoaders === false ? undefined : loadDay}
          dailyTodayLoader={loadToday}
          dailyDayLoader={loadDaily}
          trainingReviewsLoader={options.withLoader === false ? undefined : loader}
        />
      </QueryClientProvider>,
    ),
  );
  await wait();
}
async function clickButton(label: string) {
  const button = [...node.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.trim() === label,
  );
  expect(button, label).toBeTruthy();
  await act(async () => button?.click());
  await wait();
}
function setActor(actor: { id: string; username: string; role: string } | null) {
  cache.setQueryData(CURRENT_USER_QUERY_KEY, actor);
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  setActor({ id: "A", username: "owner", role: "USER" });
  entitlement = true;
  fetcher = vi.fn(async (url: string, opt: RequestInit) => {
    if (opt?.method !== "GET") throw Error("WRITE_FORBIDDEN");
    if (url === "/api/v1/courses")
      return new Response(JSON.stringify({ success: true, data: [course(entitlement)] }), {
        status: 200,
      });
    if (url === "/api/v1/user/profile")
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "A",
            username: "owner",
            email: "PRIVATE_EMAIL",
            profile: { fullName: "Владелец", city: "Самара", about: "Курс" },
          },
        }),
        { status: 200 },
      );
    throw Error("UNEXPECTED_API_" + url);
  });
  vi.stubGlobal("fetch", fetcher);
  loader = vi.fn(async () => reviews());
  node = document.createElement("div");
  document.body.appendChild(node);
  root = createRoot(node);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  node.remove();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
describe("WEB-URL-050 opt-in-only actual legacy Web reviews", () => {
  it("recognizes exact direct bookmark but never confuses reviews for day", () => {
    expect(trainingReviewsPath("IMPULSE_CONTROL")).toBe("/trainings/IMPULSE_CONTROL/reviews");
    expect(routeForPath("/trainings/IMPULSE_CONTROL/reviews")).toBe(
      "/trainings/IMPULSE_CONTROL/reviews",
    );
    expect(trainingReviewsTypeFromPath("/trainings/IMPULSE_CONTROL/reviews")).toBe(
      "IMPULSE_CONTROL",
    );
    expect(trainingRouteFromPath("/trainings/IMPULSE_CONTROL/reviews")).toBeNull();
    for (const path of [
      "/trainings/IMPULSE_CONTROL/reviews/extra",
      "/trainings/%2Fadmin/reviews",
      "/trainings/IMPULSE_CONTROL/reviews%2Fmore",
      "/trainings/reviews/reviews",
    ])
      expect(trainingReviewsTypeFromPath(path)).toBeNull();
    expect(() => trainingReviewsPath("../bad")).toThrow();
    expect(() => trainingDayPath("IMPULSE_CONTROL", "reviews")).toThrow();
    expect(() => trainingCoursePath("reviews")).toThrow();
  });
  it("existing reviews route remains owner-gated even when unrelated training flag is OFF", async () => {
    await mount(undefined, { enabled: false });
    expect(node.textContent).toContain("Отзывы к курсу");
    expect(loader).toHaveBeenCalledExactlyOnceWith("IMPULSE_CONTROL");
    expect(node.querySelectorAll(".course-review-card")).toHaveLength(5);
    expect(reviewPosts()).toHaveLength(0);
  });
  it("missing injected reviews loader uses current Hono GET, never triggers POST", async () => {
    await mount(undefined, { withLoader: false });
    expect(loader).not.toHaveBeenCalled();
    expect(fetcher.mock.calls.some(([url, options]) =>
      String(url) === "/api/v1/courses/reviews?courseType=IMPULSE_CONTROL" &&
        options?.method === "GET",
    )).toBe(true);
    expect(reviewPosts()).toHaveLength(0);
  });
  it("owner-authorized GET displays rating, date, comments and client-side pages", async () => {
    await mount();
    expect(loader).toHaveBeenCalledExactlyOnceWith("IMPULSE_CONTROL");
    expect(node.querySelectorAll(".course-review-card")).toHaveLength(5);
    expect(node.textContent).toContain("Отзывы к курсу");
    expect(node.textContent).toContain("Текст отзыва 0");
    expect(node.textContent).not.toContain("Текст отзыва 6");
    expect(node.textContent).toContain("Страница 1 из 2");
    expect(node.textContent).toContain("Ваш отзыв");
    expect(node.innerHTML).not.toContain("PRIVATE_AVATAR");
    await clickButton("Далее");
    expect(node.querySelectorAll(".course-review-card")).toHaveLength(2);
    expect(node.textContent).toContain("Текст отзыва 6");
    expect(node.textContent).not.toContain("Текст отзыва 0");
    const paginationBack = node.querySelector<HTMLButtonElement>(
      ".course-review-pagination button",
    );
    expect(paginationBack?.textContent?.trim()).toBe("Назад");
    await act(async () => paginationBack?.click());
    await wait();
    expect(node.textContent).toContain("Страница 1 из 2");
    expect(loader).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("reviews"))).toHaveLength(0);
  });
  it("incomplete course cannot author a review", async () => {
    loader.mockResolvedValueOnce({
      ...reviews(0), userStatus: { hasCompleted: false, userReview: null },
    });
    await mount();
    expect(node.textContent).toContain("Пока нет отзывов");
    expect(node.querySelector(".training-next-reviews-empty")).not.toBeNull();
    expect(node.textContent).not.toContain("Показаны от новых к старым");
    expect(node.textContent).not.toContain("← К тренировке");
    expect(node.querySelectorAll(".course-review-pagination button")).toHaveLength(0);
    expect(node.textContent).not.toContain("Отправить отзыв");
  });
  it("unauthenticated reviews deep link redirects to presentation without private GET", async () => {
    setActor(null);
    await mount();
    expect(window.location.pathname).toBe("/");
    expect(node.textContent).toContain("Начать заниматься");
    expect(loader).not.toHaveBeenCalled();
    expect(fetcher.mock.calls.filter(([url]) => String(url) === "/api/v1/courses")).toHaveLength(0);
  });
  it("server course access denied refuses reviews load", async () => {
    entitlement = false;
    await mount();
    expect(node.textContent).toContain("Курс недоступен");
    expect(loader).not.toHaveBeenCalled();
  });
  it("503 retries manually, does not leak internal server errors", async () => {
    loader.mockRejectedValueOnce(new Error("PRIVATE_SERVER_ERROR"));
    await mount();
    expect(node.textContent).toContain("Не удалось загрузить отзывы");
    expect(node.innerHTML).not.toContain("PRIVATE_SERVER_ERROR");
    await clickButton("Повторить");
    expect(node.querySelectorAll(".course-review-card")).toHaveLength(5);
    expect(loader).toHaveBeenCalledTimes(2);
  });
  it.each([401, 403])("HTTP %i displays safe message, no retry", async (status) => {
    const { ApiError } = await import("../../shared/api/client");
    loader.mockRejectedValueOnce(new ApiError(status, "PRIVATE_FORBIDDEN_SERVER"));
    await mount();
    expect(node.textContent).toContain(status === 401 ? "Сессия завершена" : "Нет доступа");
    expect(node.innerHTML).not.toContain("PRIVATE_FORBIDDEN_SERVER");
    expect([...node.querySelectorAll("button")].some((b) => b.textContent === "Повторить")).toBe(
      false,
    );
  });
  it("malformed 200 never displays sensitive review payload", async () => {
    loader.mockResolvedValueOnce({
      ...reviews(),
      reviews: [
        {
          id: "bad",
          rating: 500,
          comment: "PRIVATE_SENSITIVE_REVIEW",
          createdAt: "bad date",
          user: { id: "A", username: "owner" },
        },
      ],
    });
    await mount();
    expect(node.textContent).toContain("Не удалось загрузить отзывы");
    expect(node.innerHTML).not.toContain("PRIVATE_SENSITIVE_REVIEW");
  });
  it("principal switch while A request pending fences old reviews (A → B → A)", async () => {
    let resolve!: (payload: ReturnType<typeof reviews>) => void;
    loader.mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        }),
    );
    await mount();
    await act(async () => setActor({ id: "B", username: "new", role: "USER" }));
    await wait();
    expect(node.textContent).toContain("Личные данные скрыты");
    await act(async () => resolve(reviews()));
    await wait();
    expect(node.textContent).not.toContain("Текст отзыва 0");
    await act(async () => setActor({ id: "A", username: "owner", role: "USER" }));
    await wait();
    expect(node.textContent).not.toContain("Текст отзыва 0");
    expect(loader).toHaveBeenCalledTimes(1);
  });
  it("course overview links only when approved opt-in loader and access", async () => {
    await mount("/courses/course_01");
    expect(node.querySelector('a[href="/trainings/IMPULSE_CONTROL/reviews"]')).toBeTruthy();
    entitlement = false;
    cache.removeQueries({ queryKey: ["courses", "catalog", "A"] });
    await mount("/courses/course_01");
    expect(node.querySelector('a[href="/trainings/IMPULSE_CONTROL/reviews"]')).toBeNull();
  });
});


// COURSE-REVIEW-CREATE-USER-JOURNEY: registered Hono contract, synthetic transport only.
const reviewPosts = () => fetcher.mock.calls.filter(([url, init]) =>
  url === "/api/v1/courses/reviews" && init?.method === "POST",
);
async function chooseRating(rating: number) {
  await clickButton(String(rating));
}
async function enterReviewComment(text: string) {
  const area = node.querySelector<HTMLTextAreaElement>(".course-review-create-form textarea");
  expect(area).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(area, text);
    area?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function sendReviewTwice() {
  const form = node.querySelector<HTMLFormElement>(".course-review-create-form");
  expect(form).not.toBeNull();
  await act(async () => {
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}
function deferredReviewReply() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}
const reviewAck = (status = 200) => new Response(JSON.stringify({ success: status === 200 }),
  { status },
);
const newOwnReview = () => ({ ...reviews(0),
  reviews: [{ id: "review_created", rating: 5, comment: "Полезный курс",
    createdAt: "2026-10-24T10:00:00.000Z", user: { id: "A", username: "owner" } }],
  userStatus: { hasCompleted: true, userReview: { id: "review_created", user: { id: "A" } } },
});

describe("COURSE-REVIEW-CREATE-USER-JOURNEY authorized completed learner", () => {
  it("completed learner can submit one same-turn POST and sees only verified own review after GET", async () => {
    let persisted = false;
    const pending = deferredReviewReply();
    loader.mockImplementation(async () => persisted ? newOwnReview() : reviews(0));
    const baseline = fetcher.getMockImplementation() as
      | ((url: string, options: RequestInit) => Promise<Response>)
      | undefined;
    fetcher.mockImplementation(async (url: string, opt: RequestInit) => {
      if (url === "/api/v1/courses/reviews" && opt?.method === "POST") {
        return pending.promise;
      }
      if (!baseline) throw Error("MISSING_BASELINE");
      return baseline(url, opt);
    });
    await mount();
    expect(node.textContent).toContain("Оставить отзыв");
    await chooseRating(5);
    await enterReviewComment("Полезный курс");
    await sendReviewTwice();
    expect(reviewPosts()).toHaveLength(1);
    const posted = reviewPosts()[0];
    expect(posted[0]).toBe("/api/v1/courses/reviews");
    expect(JSON.parse(String(posted[1]?.body))).toEqual({
      courseType: "IMPULSE_CONTROL", rating: 5, comment: "Полезный курс",
    });
    expect(posted[1]).toMatchObject({ method: "POST", credentials: "include", cache: "no-store",
      headers: { "X-Gafus-Auth-Transport": "cookie", "Content-Type": "application/json" },
    });
    expect(node.textContent).not.toContain("Ваш отзыв");
    await act(async () => { persisted = true; pending.resolve(reviewAck()); });
    await wait();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(node.textContent).toContain("Ваш отзыв");
    expect(node.textContent).toContain("Полезный курс");
    expect(node.querySelector(".course-review-create-form")).toBeNull();
  });

  it("unconfirmed 500 never replays POST; manual GET can discover committed review", async () => {
    let persisted = false;
    loader.mockImplementation(async () => persisted ? newOwnReview() : reviews(0));
    const baseline = fetcher.getMockImplementation() as
      | ((url: string, options: RequestInit) => Promise<Response>)
      | undefined;
    fetcher.mockImplementation(async (url: string, opt: RequestInit) => {
      if (url === "/api/v1/courses/reviews" && opt?.method === "POST") {
        persisted = true;
        return reviewAck(500);
      }
      if (!baseline) throw Error("MISSING_BASELINE");
      return baseline(url, opt);
    });
    await mount();
    await chooseRating(4);
    await sendReviewTwice();
    await wait();
    expect(reviewPosts()).toHaveLength(1);
    expect(node.textContent).toContain("Не удалось подтвердить отзыв");
    expect(node.querySelector(".course-review-create-form")).not.toBeNull();
    await clickButton("Проверить отзыв");
    expect(reviewPosts()).toHaveLength(1);
    expect(node.textContent).toContain("Ваш отзыв");
    expect(node.querySelector(".course-review-create-form")).toBeNull();
  });

  it("200 ACK without an own review on GET remains unconfirmed; only manual GET permits retry", async () => {
    loader.mockResolvedValue(reviews(0));
    const baseline = fetcher.getMockImplementation() as
      | ((url: string, options: RequestInit) => Promise<Response>)
      | undefined;
    fetcher.mockImplementation(async (url: string, opt: RequestInit) => {
      if (url === "/api/v1/courses/reviews" && opt?.method === "POST") return reviewAck();
      if (!baseline) throw Error("MISSING_BASELINE");
      return baseline(url, opt);
    });
    await mount();
    await chooseRating(3);
    await sendReviewTwice();
    await wait();
    expect(reviewPosts()).toHaveLength(1);
    expect(node.textContent).toContain("Не удалось подтвердить отзыв");
    expect(node.textContent).not.toContain("Ваш отзыв");
    await wait();
    expect(reviewPosts()).toHaveLength(1);
    await clickButton("Проверить отзыв");
    expect(reviewPosts()).toHaveLength(1);
    expect(node.querySelector(".course-review-create-form")).not.toBeNull();
    await clickButton("Отправить отзыв");
    expect(reviewPosts()).toHaveLength(2);
    expect(node.textContent).not.toContain("Ваш отзыв");
  });

  it("server status, completion and own-review ownership determine whether form exists", async () => {
    loader.mockResolvedValueOnce(reviews());
    await mount();
    expect(node.querySelector(".course-review-create-form")).toBeNull();
    expect(node.textContent).toContain("Ваш отзыв");
    expect(reviewPosts()).toHaveLength(0);
  });
});


// COURSE-REVIEW-OWN-EDIT-DELETE: existing Hono routes, synthetic fetch only.
const ownReviewWrites = (method: "PATCH" | "DELETE") => fetcher.mock.calls.filter(
  ([url, opt]) => url === "/api/v1/courses/reviews" && opt?.method === method,
);
const editedReviews = () => {
  const original = reviews();
  original.reviews[0] = { ...original.reviews[0], rating: 4, comment: "Обновлённый отзыв" };
  return original;
};
const editForm = () => node.querySelector<HTMLFormElement>(".course-review-edit-form");
async function submitEditTwice() {
  const form = editForm();
  expect(form).not.toBeNull();
  await act(async () => {
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}
async function changeEditText(text: string) {
  const area = editForm()?.querySelector("textarea");
  expect(area).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(area, text);
    area?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("COURSE-REVIEW-OWN-EDIT-DELETE current owner's edit and delete lifecycle", () => {
  it("edits only own review with one same-turn PATCH, then verifies rating/comment by GET", async () => {
    const pending = deferredReviewReply();
    let persisted = false;
    loader.mockImplementation(async () => persisted ? editedReviews() : reviews());
    const baseline = fetcher.getMockImplementation() as
      | ((url: string, options: RequestInit) => Promise<Response>) | undefined;
    fetcher.mockImplementation(async (url: string, options: RequestInit) => {
      if (url === "/api/v1/courses/reviews" && options?.method === "PATCH") return pending.promise;
      if (!baseline) throw Error("MISSING_BASELINE");
      return baseline(url, options);
    });
    await mount();
    await clickButton("Редактировать отзыв");
    await clickButton("4");
    await changeEditText("Обновлённый отзыв");
    await submitEditTwice();
    expect(ownReviewWrites("PATCH")).toHaveLength(1);
    expect(JSON.parse(String(ownReviewWrites("PATCH")[0][1]?.body))).toEqual({
      reviewId: "r_0", rating: 4, comment: "Обновлённый отзыв",
    });
    expect(ownReviewWrites("PATCH")[0][1]).toMatchObject({
      method: "PATCH", credentials: "include", cache: "no-store",
      headers: { "X-Gafus-Auth-Transport": "cookie" },
    });
    expect(node.querySelector(".course-review-card")?.textContent)
      .not.toContain("Обновлённый отзыв");
    await act(async () => { persisted = true; pending.resolve(reviewAck()); });
    await wait();
    expect(ownReviewWrites("PATCH")).toHaveLength(1);
    expect(node.querySelector(".course-review-edit-form")).toBeNull();
    expect(node.textContent).toContain("Обновлённый отзыв");
    expect(node.textContent).toContain("Ваш отзыв");
  });

  it("confirmed destructive delete requires confirm, single DELETE and verified absent own review GET", async () => {
    const pending = deferredReviewReply();
    let deleted = false;
    loader.mockImplementation(async () => deleted ? reviews(0) : reviews());
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const baseline = fetcher.getMockImplementation() as
      | ((url: string, options: RequestInit) => Promise<Response>) | undefined;
    fetcher.mockImplementation(async (url: string, options: RequestInit) => {
      if (url === "/api/v1/courses/reviews" && options?.method === "DELETE") return pending.promise;
      if (!baseline) throw Error("MISSING_BASELINE");
      return baseline(url, options);
    });
    await mount();
    const button = [...node.querySelectorAll<HTMLButtonElement>("button")].find(
      value => value.textContent === "Удалить отзыв",
    );
    expect(button).toBeTruthy();
    await act(async () => { button?.click(); button?.click(); await Promise.resolve(); });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(ownReviewWrites("DELETE")).toHaveLength(1);
    expect(JSON.parse(String(ownReviewWrites("DELETE")[0][1]?.body))).toEqual({
      reviewId: "r_0",
    });
    await act(async () => { deleted = true; pending.resolve(reviewAck()); });
    await wait();
    expect(node.textContent).not.toContain("Ваш отзыв");
    expect(node.textContent).toContain("Оставить отзыв");
    expect(ownReviewWrites("DELETE")).toHaveLength(1);
  });

  it("unknown edit ACK preserves draft, no automatic PATCH retry, manual GET finds committed edit", async () => {
    let persisted = false;
    loader.mockImplementation(async () => persisted ? editedReviews() : reviews());
    const baseline = fetcher.getMockImplementation() as
      | ((url: string, options: RequestInit) => Promise<Response>) | undefined;
    fetcher.mockImplementation(async (url: string, options: RequestInit) => {
      if (url === "/api/v1/courses/reviews" && options?.method === "PATCH") {
        persisted = true;
        return reviewAck(500);
      }
      if (!baseline) throw Error("MISSING_BASELINE");
      return baseline(url, options);
    });
    await mount();
    await clickButton("Редактировать отзыв");
    await clickButton("4");
    await changeEditText("Обновлённый отзыв");
    await submitEditTwice();
    await wait();
    expect(ownReviewWrites("PATCH")).toHaveLength(1);
    expect(node.textContent).toContain("Не удалось подтвердить изменение отзыва");
    expect(editForm()?.querySelector("textarea")?.value).toBe("Обновлённый отзыв");
    await wait();
    expect(ownReviewWrites("PATCH")).toHaveLength(1);
    await clickButton("Проверить изменения отзыва");
    expect(ownReviewWrites("PATCH")).toHaveLength(1);
    expect(node.textContent).toContain("Обновлённый отзыв");
    expect(editForm()).toBeNull();
  });

  it("ambiguous DELETE may have committed; only manual GET can confirm absence", async () => {
    let deleted = false;
    loader.mockImplementation(async () => deleted ? reviews(0) : reviews());
    vi.stubGlobal("confirm", vi.fn(() => true));
    const baseline = fetcher.getMockImplementation() as
      | ((url: string, options: RequestInit) => Promise<Response>) | undefined;
    fetcher.mockImplementation(async (url: string, options: RequestInit) => {
      if (url === "/api/v1/courses/reviews" && options?.method === "DELETE") {
        deleted = true;
        return reviewAck(500);
      }
      if (!baseline) throw Error("MISSING_BASELINE");
      return baseline(url, options);
    });
    await mount();
    await clickButton("Удалить отзыв");
    expect(ownReviewWrites("DELETE")).toHaveLength(1);
    expect(node.textContent).toContain("Не удалось подтвердить удаление отзыва");
    await wait();
    expect(ownReviewWrites("DELETE")).toHaveLength(1);
    await clickButton("Проверить изменения отзыва");
    expect(ownReviewWrites("DELETE")).toHaveLength(1);
    expect(node.textContent).not.toContain("Ваш отзыв");
    expect(node.textContent).toContain("Оставить отзыв");
  });

  it("declined delete never dispatches and foreign actor has no own-edit controls", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    await mount();
    await clickButton("Удалить отзыв");
    expect(ownReviewWrites("DELETE")).toHaveLength(0);
    expect(node.textContent).toContain("Ваш отзыв");
    expect(node.textContent).toContain("Редактировать отзыв");
    await act(async () => setActor({ id: "B", username: "new", role: "USER" }));
    await wait();
    expect(node.textContent).not.toContain("Редактировать отзыв");
    expect(ownReviewWrites("DELETE")).toHaveLength(0);
  });
});
