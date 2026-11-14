/** Existing direct and public barrel paths must resolve to exactly one read implementation. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getAppSubscriptionAccess as viaCore, getCynologistEntitlements as viaCoreRights } from "../accessService";
import { getAppSubscriptionAccess as viaServer, getCynologistEntitlements as viaServerRights } from "@gafus/subscription-read-server";

describe("Core appSubscription injected read port", () => {
  it("has an explicit fail-closed port, not a server implementation reexport", () => {
    expect(viaCore).not.toBe(viaServer);
    expect(viaCoreRights).not.toBe(viaServerRights);
    const source = readFileSync(new URL("../accessService.ts", import.meta.url), "utf8");
    expect(source).not.toContain('from "@gafus/subscription-read-server"');
    expect(source).toContain("SUBSCRIPTION_ACCESS_PORT_UNBOUND");
    expect(source).toContain("registerSubscriptionAccessPort");
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
