import { describe, expect, it } from "vitest";

import { declOfNum } from "./pluralize";

describe("declOfNum", () => {
  const titles: [string, string, string] = ["год", "года", "лет"];

  it("returns titles[0] for 1, 21, 31, 41, 101", () => {
    expect(declOfNum(1, titles)).toBe("год");
    expect(declOfNum(21, titles)).toBe("год");
    expect(declOfNum(31, titles)).toBe("год");
    expect(declOfNum(41, titles)).toBe("год");
    expect(declOfNum(101, titles)).toBe("год");
  });

  it("returns titles[1] for 2, 3, 4, 22, 23, 24", () => {
    expect(declOfNum(2, titles)).toBe("года");
    expect(declOfNum(3, titles)).toBe("года");
    expect(declOfNum(4, titles)).toBe("года");
    expect(declOfNum(22, titles)).toBe("года");
    expect(declOfNum(23, titles)).toBe("года");
    expect(declOfNum(24, titles)).toBe("года");
  });

  it("returns titles[2] for 0, 5, 11, 12, 15, 20, 100, 111", () => {
    expect(declOfNum(0, titles)).toBe("лет");
    expect(declOfNum(5, titles)).toBe("лет");
    expect(declOfNum(11, titles)).toBe("лет");
    expect(declOfNum(12, titles)).toBe("лет");
    expect(declOfNum(15, titles)).toBe("лет");
    expect(declOfNum(20, titles)).toBe("лет");
    expect(declOfNum(100, titles)).toBe("лет");
    expect(declOfNum(111, titles)).toBe("лет");
  });
});
