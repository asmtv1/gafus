import { describe, expect, it, vi } from "vitest";
import { getVisibleSteps, getTrainerStepMediaState } from "./trainerStepService";
import type { TrainerStepRowsPort } from "./trainerStepRowsPort";

/** The service must not rely on global registrar order in production. */
describe("trainer steps explicit SQL dependency composition", () => {
  it("keeps two independent app instances scoped to their own reader", async () => {
    const make = (id: string) => {
      const readVisibleTrainerSteps = vi.fn().mockResolvedValue([{ id }]);
      const readTrainerStepMediaRow = vi.fn().mockResolvedValue({ id });
      return {
        port: { readVisibleTrainerSteps, readTrainerStepMediaRow } as unknown as TrainerStepRowsPort,
        readVisibleTrainerSteps, readTrainerStepMediaRow,
      };
    };
    const a = make("a"), b = make("b");
    expect(await getVisibleSteps("owner", false, {}, a.port)).toEqual([{ id: "a" }]);
    expect(await getVisibleSteps("owner", false, {}, b.port)).toEqual([{ id: "b" }]);
    expect(await getTrainerStepMediaState("own-step", a.port)).toEqual({ id: "a" });
    expect(a.readVisibleTrainerSteps).toHaveBeenCalledWith({ authorId: "owner", isDailyCourse: false });
    expect(b.readVisibleTrainerSteps).toHaveBeenCalledTimes(1);
    expect(a.readTrainerStepMediaRow).toHaveBeenCalledWith("own-step");
  });
});
