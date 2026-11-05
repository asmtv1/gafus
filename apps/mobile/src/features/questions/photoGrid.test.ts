import { describe, expect, it } from "vitest";
import { questionPhotoGridRows } from "./photoGrid";

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
