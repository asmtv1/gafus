import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const trainingScreen = readFileSync(
  new URL("../../../../app/(main)/training/[courseType]/[dayId].tsx", import.meta.url),
  "utf8",
);
const petsScreen = readFileSync(
  new URL("../../../../app/(main)/(tabs)/pets.tsx", import.meta.url),
  "utf8",
);
const preventionLifecycle = readFileSync(
  new URL("../../../features/pets/usePreventionOfflineSave.ts", import.meta.url),
  "utf8",
);
const preventionNativeWriter = readFileSync(
  new URL("./newOnlyV2PreventionWriterNative.ts", import.meta.url),
  "utf8",
);

describe("Phase1 owner-scoped pending refresh callsite guard", () => {
  it("ordinary practice result is suppressed after screen focus cancellation and unconfirmed local write", () => {
    const handler = trainingScreen
      .split("const handleCompleteStep = useCallback(")[1]
      ?.split("const handleSaveDiaryForStep")[0];
    expect(handler).toBeDefined();
    expect(trainingScreen).toContain("++practiceScreenGeneration.current");
    expect(handler).toMatch(/requestGeneration\s*!==\s*practiceScreenGeneration\.current/);
    expect(handler).toContain("useAuthStore.getState().user !== verifiedProfile");
    expect(handler).toContain("after.authEpoch !== initialBinding.authEpoch");
    expect(handler).toContain("Результат локального сохранения не подтверждён");
  });
  it("ordinary practice refresh occurs only after durable mutation success", () => {
    const handler = trainingScreen
      .split("const handleCompleteStep = useCallback(")[1]
      ?.split("const handleSaveDiaryForStep")[0];
    expect(handler).toBeDefined();
    const awaitedMutation = handler!.indexOf("await completePracticeMutation.mutateAsync(params)");
    const checkedResult = handler!.indexOf("if (!result.success)");
    const offlineGuard = handler!.indexOf(
      '"code" in result && result.code === "OFFLINE_QUEUED"',
      checkedResult,
    );
    const refresh = handler!.indexOf("void refreshPendingPractice()");
    expect(awaitedMutation).toBeGreaterThan(-1);
    expect(checkedResult).toBeGreaterThan(awaitedMutation);
    expect(offlineGuard).toBeGreaterThan(checkedResult);
    expect(refresh).toBeGreaterThan(offlineGuard);
    expect(handler).toContain("refreshPendingPractice,");
  });
  it("prevention focus refresh depends on authenticated profile revision, not only stable user ID", () => {
    const section = petsScreen
      .split("function PetPreventionSection(")[1]
      ?.split("function PetsTabScreen(")[0];
    expect(section).toBeDefined();
    expect(section).toContain("const verifiedProfile = useAuthStore((state) => state.user)");
    expect(section).toContain("[activate, deactivate, refreshPending, verifiedProfile]");
  });
  it("prevention screen accepts success only after awaited v2 write and owner-scoped receipt read", () => {
    expect(petsScreen).toContain("import { usePreventionOfflineSave }");
    const hookUse = petsScreen.indexOf("usePreventionOfflineSave(pet.id, principalId)");
    const saveCall = petsScreen.indexOf("void saveOffline(payload,", hookUse);
    const successCallback = petsScreen.indexOf("onSaved: () => {", saveCall);
    const successNotice = petsScreen.indexOf('"Сохранено на устройстве"', successCallback);
    expect(hookUse).toBeGreaterThan(-1);
    expect(saveCall).toBeGreaterThan(hookUse);
    expect(successCallback).toBeGreaterThan(saveCall);
    expect(successNotice).toBeGreaterThan(successCallback);

    expect(preventionNativeWriter).toContain(
      "return enqueueNewOnlyPrevention(newOnlyV2NativeQueues",
    );
    const durable = preventionLifecycle.indexOf("const receipt = await deps.enqueue(petId, data)");
    const currentSession = preventionLifecycle.indexOf(
      "if (!isCurrent(ticket, principalId, epoch)) return",
      durable,
    );
    const reread = preventionLifecycle.indexOf(
      "await readOwnPendingPrevention(deps.queue, petId, principalId)",
      durable,
    );
    const receiptMatch = preventionLifecycle.indexOf(
      "rows.some((entry) => entry.eventId === receipt.eventId)",
      reread,
    );
    const setPending = preventionLifecycle.indexOf(
      "setPendingState({ owner: principalId, epoch, petId, rows })",
      receiptMatch,
    );
    const notifySaved = preventionLifecycle.indexOf("callbacks.onSaved()", setPending);
    expect(durable).toBeGreaterThan(-1);
    expect(currentSession).toBeGreaterThan(durable);
    expect(reread).toBeGreaterThan(currentSession);
    expect(receiptMatch).toBeGreaterThan(reread);
    expect(setPending).toBeGreaterThan(receiptMatch);
    expect(notifySaved).toBeGreaterThan(setPending);
  });
});
