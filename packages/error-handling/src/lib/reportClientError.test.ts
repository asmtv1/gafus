import { afterEach, describe, expect, it, vi } from "vitest";
const diagnostics = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../browserTelemetry", () => ({ reportBrowserDiagnostic: diagnostics.send }));
import { reportClientError } from "./reportClientError";

afterEach(() => { vi.unstubAllGlobals(); diagnostics.send.mockReset(); });
describe("client error reporting boundary", () => {
  it("performs no telemetry during server rendering", () => {
    vi.stubGlobal("window", undefined);
    reportClientError(new Error("server-only"));
    expect(diagnostics.send).not.toHaveBeenCalled();
  });
  it("passes only the error and fixed reason/code, never caller private metadata", () => {
    vi.stubGlobal("window", {});
    const cause = new Error("synthetic");
    reportClientError(cause, {
      userId: "PRIVATE_USER", issueKey: "PRIVATE_KEY", severity: "warning",
      keys: { email: "private@example.invalid" },
    });
    expect(diagnostics.send).toHaveBeenCalledExactlyOnceWith(
      cause, "react_error", "WEB_REACT_RENDER",
    );
    expect(JSON.stringify(diagnostics.send.mock.calls)).not.toContain("PRIVATE_USER");
  });
});
