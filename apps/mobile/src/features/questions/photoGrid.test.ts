import { describe, expect, it } from "vitest";
import { questionPhotoGridRows, questionSinglePhotoPreviewRatio,
  questionSinglePhotoPreviewHeight, questionPhotoRowLayout } from "./photoGrid";

describe("Questions single-photo preview aspect ratios", () => {
  it("grows vertically for portrait photos in both questions and answers", () => {
    expect(questionSinglePhotoPreviewRatio(720, 1280)).toBeCloseTo(9 / 16);
    expect(questionSinglePhotoPreviewRatio(1440, 1920)).toBeCloseTo(0.75);
    expect(questionSinglePhotoPreviewRatio(1080, 1080)).toBe(1);
  });
  it("uses the native landscape aspect ratio instead of a fixed 1.6 crop", () => {
    expect(questionSinglePhotoPreviewRatio(1920, 1080)).toBeCloseTo(16 / 9);
    expect(questionSinglePhotoPreviewRatio(2400, 400)).toBe(6);
  });
  it("falls back safely when dimensions are missing or invalid", () => {
    expect(questionSinglePhotoPreviewRatio(0, 1200)).toBe(1);
    expect(questionSinglePhotoPreviewRatio(NaN, 900)).toBe(1);
    expect(questionSinglePhotoPreviewRatio(1000, Infinity)).toBe(1);
  });
});

describe("Questions image layout without unnecessary letterboxing", () => {
  it("gives 9:16 photos their real height when space allows", () => {
    expect(questionSinglePhotoPreviewHeight(320,9/16)).toBeCloseTo(568.89,1);
    expect(questionSinglePhotoPreviewHeight(300,3/4)).toBe(400);
  });
  it("caps extremely tall and ultra-wide images without cropping pixels", () => {
    expect(questionSinglePhotoPreviewHeight(320,1/5)).toBe(640);
    expect(questionSinglePhotoPreviewHeight(320,8)).toBe(100);
    expect(questionSinglePhotoPreviewHeight(0,1)).toBe(240);
  });
  it("weights a portrait/landscape pair by intrinsic aspect ratios", () => {
    const row=questionPhotoRowLayout(360,[9/16,16/9]);
    expect(row.weights[0]).toBeCloseTo(0.65);
    expect(row.weights[1]).toBeCloseTo(16/9);
    expect(row.height).toBeGreaterThan(100);
    expect(row.height).toBeLessThan(280);
  });
  it("keeps portrait triples taller than square triples and caps very short rows", () => {
    const portraits=questionPhotoRowLayout(360,[9/16,9/16,9/16]);
    const squares=questionPhotoRowLayout(360,[1,1,1]);
    expect(portraits.height).toBeGreaterThan(squares.height);
    expect(questionPhotoRowLayout(360,[5,5,5]).height).toBe(80);
  });
});

describe("Questions responsive photo gallery", () => {
  it.each([
    [0, []],
    [1, [1]],
    [2, [2]],
    [3, [3]],
    [4, [2, 2]],
    [5, [3, 2]],
  ] as const)("lays out %i photos in rows %j without leaving a sparse third column", (count, sizes) => {
    const photos = Array.from({ length: count }, (_, i) => `photo-${i}`);
    const rows = questionPhotoGridRows(photos);
    expect(rows.map(row => row.length)).toEqual(sizes);
    expect(rows.flat()).toEqual(photos.map((photo, index) => ({ photo, index })));
  });
  it("preserves photo positions when the list updates", () => {
    const photos = ["a", "b", "c", "d", "e"];
    expect(questionPhotoGridRows(photos).flat().map(({ index }) => index)).toEqual([0,1,2,3,4]);
    expect(questionPhotoGridRows(photos.slice(0,4)).map(row => row.length)).toEqual([2,2]);
  });
});
