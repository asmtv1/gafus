/** All final Core SQL adapters must be composed by their owner, not silently
 * execute an unbound query or accept a second, inconsistent implementation.
 * Test the exact unchanged argument tuple through the delegated function. */
import { describe, expect, it, vi } from "vitest";

const cases = [
  { label: "OFFLINE_MUTATION_ROWS", load: () => import("../offline/offlineMutationRowsPort"), require: "requireOfflineMutationRowsPort", call: "withOfflineMutationTx" },
  { label: "PREVENTION_ROWS", load: () => import("../petPrevention/preventionRowsPort"), require: "requirePreventionRowsPort", call: "readOwnedPreventionPet" },
  { label: "VET_VISIT_ROWS", load: () => import("../pets/vetVisitRowsPort"), require: "requireVetVisitRowsPort", call: "ownPetForVet" },
  { label: "TRAINER_STEP_ROWS", load: () => import("../trainerStep/trainerStepRowsPort"), require: "requireTrainerStepRowsPort", call: "readTrainerVideoRows" },
] as const;

describe("Final Core SQL ports: strict no-default composition", () => {
  for (const entry of cases) {
    it(`${entry.label} fails closed and keeps explicit adapter identity`, async () => {
      vi.resetModules();
      const adapter = await entry.load() as unknown as Record<string, (...args: unknown[]) => unknown>;
      expect(() => adapter[entry.require](undefined)).toThrow(`${entry.label}_PORT_UNBOUND`);

      const result = Object.freeze({ committed: true, operation: entry.label });
      const delegate = vi.fn(async () => result);
      const port = { [entry.call]: delegate };
      const first = adapter[entry.require](port) as typeof port;
      const second = adapter[entry.require]({ [entry.call]: vi.fn(async () => null) }) as typeof port;
      expect(first).toBe(port);
      expect(await first[entry.call]("original-actor", "original-resource")).toBe(result);
      expect(delegate).toHaveBeenCalledExactlyOnceWith("original-actor", "original-resource");
      expect(await second[entry.call]("other-actor")).toBeNull();
      expect(delegate).toHaveBeenCalledTimes(1);
    });
  }
});
