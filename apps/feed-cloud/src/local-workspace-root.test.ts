import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { localFeedWorkspaceRoot } from "./local-workspace-root.js";

describe("local media temp scope is relative to this checkout", () => {
  it("resolves the checked-out workspace for both package and root executions", () => {
    const root = localFeedWorkspaceRoot();
    expect(root).toMatch(/\/[^/]+$/);
    expect(process.cwd() === root || process.cwd().startsWith(root + sep)).toBe(true);
    expect(localFeedWorkspaceRoot(root)).toBe(root);
  });
  it("rejects arbitrary directories rather than using a machine-specific fallback", () => {
    const directory = mkdtempSync(join(tmpdir(), "gafus-other-repo-"));
    try {
      expect(() => localFeedWorkspaceRoot(directory)).toThrow("GAFUS_LOCAL_WORKSPACE_ROOT_NOT_FOUND");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
