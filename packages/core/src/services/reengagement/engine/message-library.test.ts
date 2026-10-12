import { describe, expect, it } from "vitest";

import {
  getVariantsByLevel,
  getVariantsByType,
  checkConditions,
  getAvailableVariants,
  selectRandomVariant,
  selectMessageVariant,
} from "./message-library";

const baseUserData = {
  userId: "u1",
  username: "test",
  completedCourses: [{ id: "c1", name: "Курс", rating: 5 }],
  totalSteps: 10,
};

describe("message-library", () => {
  describe("getVariantsByLevel", () => {
    it("возвращает варианты только для указанного уровня", () => {
      const level1 = getVariantsByLevel(1);
      expect(level1.length).toBeGreaterThan(0);
      expect(level1.every((v) => v.level === 1)).toBe(true);

      const level4 = getVariantsByLevel(4);
      expect(level4.every((v) => v.level === 4)).toBe(true);
    });
  });

  describe("getVariantsByType", () => {
    it("возвращает варианты только указанного типа", () => {
      const emotional = getVariantsByType("emotional");
      expect(emotional.every((v) => v.type === "emotional")).toBe(true);
    });
  });

  describe("checkConditions", () => {
    it("возвращает true когда условий нет", () => {
      const variant = {
        id: "v1",
        type: "emotional" as const,
        level: 1 as const,
        title: "T",
        body: "B",
        urlTemplate: "/",
      };
      expect(checkConditions(variant, baseUserData)).toBe(true);
    });

    it("возвращает false когда requiresDogName и dogName отсутствует", () => {
      const variant = {
        id: "v1",
        type: "emotional" as const,
        level: 1 as const,
        title: "T",
        body: "B",
        urlTemplate: "/",
        conditions: { requiresDogName: true },
      };
      expect(checkConditions(variant, { ...baseUserData, dogName: undefined })).toBe(false);
    });

    it("возвращает false когда requiresCompletedCourses и нет курсов", () => {
      const variant = {
        id: "v1",
        type: "educational" as const,
        level: 2 as const,
        title: "T",
        body: "B",
        urlTemplate: "/",
        conditions: { requiresCompletedCourses: true },
      };
      expect(
        checkConditions(variant, { ...baseUserData, completedCourses: [] }),
      ).toBe(false);
    });

    it("возвращает false когда minSteps не выполнен", () => {
      const variant = {
        id: "v1",
        type: "motivational" as const,
        level: 3 as const,
        title: "T",
        body: "B",
        urlTemplate: "/",
        conditions: { minSteps: 100 },
      };
      expect(checkConditions(variant, baseUserData)).toBe(false);
    });
  });

  describe("getAvailableVariants", () => {
    it("исключает уже отправленные варианты", () => {
      const variants = getAvailableVariants(1, baseUserData, ["emo_miss_1"]);
      expect(variants.some((v) => v.id === "emo_miss_1")).toBe(false);
    });
  });

  describe("selectRandomVariant", () => {
    it("возвращает null для пустого списка", () => {
      expect(selectRandomVariant([])).toBeNull();
    });

    it("возвращает один из вариантов", () => {
      const variants = getVariantsByLevel(1);
      const selected = selectRandomVariant(variants);
      expect(selected).not.toBeNull();
      expect(variants).toContainEqual(selected);
    });
  });

  describe("selectMessageVariant", () => {
    it("возвращает вариант с учётом sentVariantIds", () => {
      const variant = selectMessageVariant(1, baseUserData, []);
      expect(variant).not.toBeNull();
      expect(variant!.level).toBe(1);
    });

    it("возвращает null когда нет подходящих (уровень 99)", () => {
      const variant = selectMessageVariant(99, baseUserData, []);
      expect(variant).toBeNull();
    });
  });
});
