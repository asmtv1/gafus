import { describe, it, expect, vi } from "vitest";
import {
  readVisibleSteps,
  TR013_VISIBLE_STEPS_PROPOSED_PATH,
} from "./tr013VisibleStepsRead20261022";
const step = (authorId = "trainer-a", daily = false) => ({
  id: "s1",
  title: "sit",
  description: "",
  durationSec: null,
  estimatedDurationSec: null,
  type: "REGULAR",
  videoUrl: null,
  imageUrls: [],
  pdfUrls: [],
  checklist: [],
  surveySlug: null,
  isDailyCourse: daily,
  authorId,
  createdAt: "2026-10-22T00:00:00.000Z",
  updatedAt: "2026-10-22T00:00:00.000Z",
  author: { username: "trainer", profile: { fullName: null } },
  stepLinks: [],
});
const ok = (data: unknown = []) => ({
  status: 200,
  headers: { "cache-control": "private, no-store" },
  body: { success: true, data },
});
const base = {
  enabled: true as const,
  actor: { id: "trainer-a", role: "TRAINER" as const },
  signal: new AbortController().signal,
  isCurrent: () => true,
};
describe("TR013 visible steps proposed mock-only GET", () => {
  it("disabled means zero HTTP by construction", async () => {
    await expect(readVisibleSteps({ enabled: false })).rejects.toThrow("TR013_DISABLED");
  });
  it("default false exact route/query and public shape", async () => {
    const transport = vi.fn().mockResolvedValue(ok([step()]));
    expect(await readVisibleSteps({ ...base, transport })).toHaveLength(1);
    expect(transport.mock.calls[0][0]).toMatchObject({
      method: "GET",
      path: `${TR013_VISIBLE_STEPS_PROPOSED_PATH}?isDailyCourse=false`,
    });
  });
  it("daily true and ADMIN/MODERATOR mixed-author read remain current legacy mock policy", async () => {
    for (const role of ["ADMIN", "MODERATOR"] as const) {
      const data = await readVisibleSteps({
        ...base,
        actor: { id: "staff", role },
        isDailyCourse: true,
        transport: async () => ok([step("trainer-b", true)]),
      });
      expect(data).toHaveLength(1);
    }
  });
  it("TRAINER rejects foreign rows even if response incorrectly includes them", async () => {
    await expect(
      readVisibleSteps({ ...base, transport: async () => ok([step("trainer-b")]) }),
    ).rejects.toThrow("TR013_FOREIGN_OWNER");
  });
  it("USER/PARTNER/GUEST refused without transport", async () => {
    for (const role of ["USER", "PARTNER", "GUEST"] as const) {
      const transport = vi.fn();
      await expect(
        readVisibleSteps({ ...base, actor: { id: "u", role }, transport }),
      ).rejects.toThrow("TR013_ROLE_DENIED");
      expect(transport).not.toHaveBeenCalled();
    }
  });
  it("never translate 401/403/404/500 into empty", async () => {
    for (const status of [401, 403, 404, 500])
      await expect(
        readVisibleSteps({ ...base, transport: async () => ({ ...ok(), status }) }),
      ).rejects.toThrow(`TR013_HTTP_${status}`);
  });
  it("bad private cache and malformed DTO/ISO date fail closed", async () => {
    await expect(
      readVisibleSteps({
        ...base,
        transport: async () => ({ ...ok(), headers: { "cache-control": "public" } }),
      }),
    ).rejects.toThrow("TR013_UNSAFE_CACHE");
    await expect(
      readVisibleSteps({
        ...base,
        transport: async () => ok([{ ...step(), createdAt: "not-date" }]),
      }),
    ).rejects.toThrow();
  });
  it("wrong daily flag fails; no fallback", async () => {
    await expect(
      readVisibleSteps({ ...base, transport: async () => ok([step("trainer-a", true)]) }),
    ).rejects.toThrow("TR013_WRONG_DAILY_SCOPE");
  });
  it("retired authEpoch disallows late data", async () => {
    let current = true;
    await expect(
      readVisibleSteps({
        ...base,
        isCurrent: () => current,
        transport: async () => {
          current = false;
          return ok();
        },
      }),
    ).rejects.toThrow("TR013_SESSION_RETIRED");
  });
  it("wire checklist projection preserves arbitrary nested JSON and required key", async () => {
    const raw = { ...step(), checklist: { questions: [{ key: "choice", values: ["A", null] }] } };
    const data = await readVisibleSteps({ ...base, transport: async () => ok([raw]) });
    expect(data).toHaveLength(1);
    expect(data[0]!.checklist).toEqual(raw.checklist);
    expect(Object.keys(data[0]!).sort()).toEqual(Object.keys(raw).sort());
    const omitted = Object.fromEntries(
      Object.entries(step()).filter(([key]) => key !== "checklist"),
    );
    const parsed = await readVisibleSteps({ ...base, transport: async () => ok([omitted]) });
    expect(Object.prototype.hasOwnProperty.call(parsed[0], "checklist")).toBe(true);
    expect(parsed[0]!.checklist).toBeUndefined();
  });
  it("empty legitimate 200 is empty", async () => {
    expect(await readVisibleSteps({ ...base, transport: async () => ok() })).toEqual([]);
  });
});
