/** Existing direct and public barrel paths must resolve to exactly one read implementation. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getAppSubscriptionAccess as viaCore, getCynologistEntitlements as viaCoreRights } from "../accessService";
import { getAppSubscriptionAccess as viaServer, getCynologistEntitlements as viaServerRights } from "@gafus/subscription-read-server";

describe("Core appSubscription compatibility forwarding", () => {
  it("reexports exactly the new server implementation, including legacy relative import", () => {
    expect(viaCore).toBe(viaServer);
    expect(viaCoreRights).toBe(viaServerRights);
  });
  it("preserves the established public barrel and two Core export paths", () => {
    const index = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
    const packageJson = JSON.parse(readFileSync(new URL("../../../../package.json", import.meta.url), "utf8")) as {
      exports: Record<string, unknown>;
    };
    expect(index).toContain('export * from "./accessService"');
    expect(packageJson.exports).toHaveProperty("./services/appSubscription");
    expect(packageJson.exports).toHaveProperty("./services/appSubscription/plans");
  });
});
