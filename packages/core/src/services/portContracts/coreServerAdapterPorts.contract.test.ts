/** All final Core SQL adapters must be composed by their owner, not silently
 * execute an unbound query or accept a second, inconsistent implementation.
 * Test the exact unchanged argument tuple through the delegated function. */
import { describe, expect, it, vi } from "vitest";

const cases = [
  { label: "AUTH_ROWS", load: () => import("../auth/authRowsPort"), register: "registerAuthRowsPort", call: "readAuthUsernameChangeActor" },
  { label: "VK_AUTH_ROWS", load: () => import("../auth/vkAuthRowsPort"), register: "registerVkAuthRowsPort", call: "readVkUserEmail" },
  { label: "OFFLINE_MUTATION_ROWS", load: () => import("../offline/offlineMutationRowsPort"), register: "registerOfflineMutationRowsPort", call: "withOfflineMutationTx" },
  { label: "PREVENTION_ROWS", load: () => import("../petPrevention/preventionRowsPort"), register: "registerPreventionRowsPort", call: "readOwnedPreventionPet" },
  { label: "PET_ROWS", load: () => import("../pets/petRowsPort"), register: "registerPetRowsPort", call: "withPetSqlTx" },
  { label: "VET_VISIT_ROWS", load: () => import("../pets/vetVisitRowsPort"), register: "registerVetVisitRowsPort", call: "ownPetForVet" },
  { label: "REWARDED_AD_ROWS", load: () => import("../rewardedCredits/rewardedAdRowsPort"), register: "registerRewardedAdRowsPort", call: "countRewardedDayRows" },
  { label: "TRAINER_STEP_ROWS", load: () => import("../trainerStep/trainerStepRowsPort"), register: "registerTrainerStepRowsPort", call: "readTrainerVideoRows" },
] as const;

describe("Final Core SQL ports: strict no-default composition", () => {
  for (const entry of cases) {
    it(`${entry.label} fails closed, preserves arguments, and rejects a hot-rebind`, async () => {
      vi.resetModules();
      const adapter = await entry.load() as unknown as Record<string, (...args: unknown[]) => unknown>;
      expect(() => adapter[entry.call]("original-actor")).toThrow(`${entry.label}_PORT_UNBOUND`);

      const result = Object.freeze({ committed: true, operation: entry.label });
      const delegate = vi.fn(async () => result);
      const port = { [entry.call]: delegate };
      adapter[entry.register](port);
      expect(await adapter[entry.call]("original-actor", "original-resource")).toBe(result);
      expect(delegate).toHaveBeenCalledExactlyOnceWith("original-actor", "original-resource");
      expect(() => adapter[entry.register](port)).not.toThrow();
      expect(() => adapter[entry.register]({ ...port })).toThrow(`${entry.label}_PORT_ALREADY_BOUND`);
    });
  }
});
