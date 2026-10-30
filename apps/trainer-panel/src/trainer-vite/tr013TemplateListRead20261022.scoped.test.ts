import { describe, it, expect, vi } from "vitest";
import { readPublicTemplates } from "./tr013TemplateListRead20261022";
const base = {
  enabled: true as const,
  role: "TRAINER" as const,
  actorId: "trainer-a",
  signal: new AbortController().signal,
  isCurrent: () => true,
};
const sample = {
  id: "tpl1",
  title: "Sit",
  description: "",
  durationSec: null,
  type: "REGULAR",
  imageUrls: [],
  pdfUrls: [],
  videoUrl: null,
  checklist: [],
  requiresVideoReport: false,
  requiresWrittenFeedback: false,
  hasTestQuestions: false,
  surveySlug: null,
  tags: [],
  isPublic: true,
  usageCount: 0,
  category: null,
  author: { id: "trainer-a", username: "a" },
  createdAt: "2026-10-22T00:00:00.000Z",
};
const ok = () => ({
  status: 200,
  headers: { "cache-control": "private, no-store" },
  body: { success: true, data: [sample] },
});
describe("TR013 source/mock list only", () => {
  it("default disabled; no call possible", async () => {
    await expect(readPublicTemplates({ enabled: false })).rejects.toThrow("TR013_NOT_APPROVED");
  });
  it("valid public-only DTO and category URL", async () => {
    const transport = vi.fn().mockResolvedValue(ok());
    const r = await readPublicTemplates({ ...base, categoryId: "cat 1", transport });
    expect(r).toHaveLength(1);
    expect(transport.mock.calls[0][0]).toContain("categoryId=cat%201");
  });
  it("foreign/private DTO denied", async () => {
    await expect(
      readPublicTemplates({
        ...base,
        transport: async () => ({
          ...ok(),
          body: { success: true, data: [{ ...sample, isPublic: false }] },
        }),
      }),
    ).rejects.toThrow();
  });
  it("missing cache proof denied", async () => {
    await expect(
      readPublicTemplates({
        ...base,
        transport: async () => ({ ...ok(), headers: { "cache-control": "public" } }),
      }),
    ).rejects.toThrow("UNSAFE_TEMPLATE_CACHE");
  });
  it("401/403/404/500 distinguished", async () => {
    for (const status of [401, 403, 404, 500])
      await expect(
        readPublicTemplates({ ...base, transport: async () => ({ ...ok(), status }) }),
      ).rejects.toThrow(`HTTP_${status}`);
  });
  it("retired session denies result", async () => {
    let live = true;
    await expect(
      readPublicTemplates({
        ...base,
        isCurrent: () => live,
        transport: async () => {
          live = false;
          return ok();
        },
      }),
    ).rejects.toThrow("SESSION_RETIRED");
  });
  it("wire checklist projection retains unknown JSON and public literal", async () => {
    const raw = { ...sample, checklist: { groups: [{ name: "Tasks", entries: [true, 3, null] }] } };
    const accepted = { ...ok(), body: { success: true, data: [raw] } };
    const data = await readPublicTemplates({ ...base, transport: async () => accepted });
    expect(data).toHaveLength(1);
    expect(data[0]!.checklist).toEqual(raw.checklist);
    expect(data[0]!.isPublic).toBe(true);
    expect(Object.keys(data[0]!).sort()).toEqual(Object.keys(raw).sort());
    const omitted = Object.fromEntries(
      Object.entries(sample).filter(([key]) => key !== "checklist"),
    );
    const parsed = await readPublicTemplates({
      ...base,
      transport: async () => ({ ...ok(), body: { success: true, data: [omitted] } }),
    });
    expect(Object.prototype.hasOwnProperty.call(parsed[0], "checklist")).toBe(true);
    expect(parsed[0]!.checklist).toBeUndefined();
  });
  it("reject missing actor identity", async () => {
    await expect(
      readPublicTemplates({ ...base, actorId: "", transport: async () => ok() }),
    ).rejects.toThrow("TR013_UNAPPROVED_CONTRACT");
  });
});
