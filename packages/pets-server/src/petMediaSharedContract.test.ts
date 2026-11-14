import { describe, expect, it } from "vitest";
import * as server from "./petMediaDeletionOutbox.js";
import * as shared from "@gafus/pets-shared/pet-media-deletion-outbox";

describe("pets-server preserves existing compiled policy exports", () => {
  it("returns the identical owner/signed-locator parser and dedupe function", () => {
    expect(server.describePetMediaLocator).toBe(shared.describePetMediaLocator);
    expect(server.describeLegacyPetMediaDeletionPlan).toBe(
      shared.describeLegacyPetMediaDeletionPlan,
    );
    expect(server.petMediaDedupeKey).toBe(shared.petMediaDedupeKey);
    expect(server.runClaimedPetMediaDeletion).toBe(shared.runClaimedPetMediaDeletion);
  });
});
