import { describe, expect, expectTypeOf, it } from "vitest";
import type { ConsentType } from "@gafus/prisma";
import type { ConsentDocumentType, CreateConsentLogsParams } from "@gafus/types";
import type { CreateConsentLogsParams as LegacyServerParams } from "./types";

describe("registered consent protocol contract", () => {
  it("matches the Prisma enum without coupling shared types to Prisma", () => {
    expectTypeOf<ConsentDocumentType>().toEqualTypeOf<ConsentType>();
    expectTypeOf<CreateConsentLogsParams>().toEqualTypeOf<LegacyServerParams>();
    const documents: Record<ConsentDocumentType, string> = {
      PERSONAL_DATA: "personal", PRIVACY_POLICY: "policy", DATA_DISTRIBUTION: "distribution",
    };
    expect(Object.keys(documents).sort()).toEqual([
      "DATA_DISTRIBUTION", "PERSONAL_DATA", "PRIVACY_POLICY",
    ]);
  });
});
