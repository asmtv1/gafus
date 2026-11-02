import { describe, expect, it } from "vitest";
import { isPairedProductionChat2Origin } from "./chat2ProductionOrigin";

describe("production Chat2 routing isolation", () => {
  it("allows the exact production API pair", () => {
    expect(isPairedProductionChat2Origin("https://api.gafus.ru", "https://api.gafus.ru")).toBe(true);
  });
  it.each([
    ["https://api.gafus.ru", "http://127.0.0.1:3001"],
    ["https://api.gafus.ru", "https://refactor.example"],
    ["https://gafus.ru", "https://api.gafus.ru"],
    ["https://api.gafus.ru.evil.example", "https://api.gafus.ru"],
    ["https://api.gafus.ru/", "https://api.gafus.ru"],
  ])("blocks mixed or spoofed API destinations (%s, %s)", (chatOrigin, apiOrigin) => {
    expect(isPairedProductionChat2Origin(chatOrigin, apiOrigin)).toBe(false);
  });
});
