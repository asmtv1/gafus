import { describe, expect, it } from "vitest";
import {
  acquireStepDayMutation, stepDayMutationKey, stepDayIsWriting,
} from "./trainingStepMutationLease";

describe("actor/day browser write singleflight", () => {
  it("prevents background timer completion racing expanded reset/pause", () => {
    const key=stepDayMutationKey("A","course","day");
    const release=acquireStepDayMutation(key);
    expect(release).not.toBeNull();
    expect(stepDayIsWriting(key)).toBe(true);
    expect(acquireStepDayMutation(key)).toBeNull();
    release?.();release?.();
    expect(stepDayIsWriting(key)).toBe(false);
    const again=acquireStepDayMutation(key);
    expect(again).not.toBeNull();
    again?.();
    const secondKey=stepDayMutationKey("B","course","day");
    const other=acquireStepDayMutation(secondKey);
    expect(other).not.toBeNull();
    other?.();
  });
  it("different users and days have independent leases", () => {
    const a=stepDayMutationKey("A","c","d");
    const b=stepDayMutationKey("B","c","d");
    const c=stepDayMutationKey("A","c","other");
    expect(a).not.toBe(b);expect(a).not.toBe(c);
  });
});
