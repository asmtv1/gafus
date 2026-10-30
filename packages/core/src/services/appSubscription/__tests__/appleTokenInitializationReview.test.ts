import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateMany, findUnique } = vi.hoisted(() => ({ updateMany: vi.fn(), findUnique: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  prisma: { user: { updateMany, findUnique } },
}));

import {
  AppleTokenOwnerUnavailableError,
  initializeAppleTokenForAuthenticatedOwner,
} from "../appleTokenInitializationReview";

const tokens = new Map<string, string>();

describe("G1 Apple token init review: SQL CAS and owner fencing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokens.clear();
    updateMany.mockImplementation(async ({ where, data }) => {
      if (where.appleAppAccountToken !== null) throw new Error("missing SQL NULL fence");
      if (!tokens.has(where.id)) {
        tokens.set(where.id, data.appleAppAccountToken);
        return { count: 1 };
      }
      return { count: 0 };
    });
    findUnique.mockImplementation(async ({ where }) =>
      where.id === "vanished-owner"
        ? null
        : { appleAppAccountToken: tokens.get(where.id) ?? null },
    );
  });

  it("initializes missing token once and returns persisted UUID", async () => {
    const result = await initializeAppleTokenForAuthenticatedOwner("owner-a");
    expect(result.appleAppAccountToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(tokens.get("owner-a")).toBe(result.appleAppAccountToken);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "owner-a", appleAppAccountToken: null },
      data: { appleAppAccountToken: expect.any(String) },
    });
  });

  it("repeats/retries and concurrent initialization resolve same persisted token", async () => {
    const [a, b, c] = await Promise.all(
      Array.from({ length: 3 }, () => initializeAppleTokenForAuthenticatedOwner("owner-a")),
    );
    const issuedTokens = [a.appleAppAccountToken, b.appleAppAccountToken, c.appleAppAccountToken];
    expect(new Set(issuedTokens).size).toBe(1);
    expect(tokens.get("owner-a")).toBe(a.appleAppAccountToken);
    const updatesBeforeRetry = updateMany.mock.calls.length;
    expect(await initializeAppleTokenForAuthenticatedOwner("owner-a")).toEqual(a);
    expect(updateMany.mock.calls).toHaveLength(updatesBeforeRetry);
  });

  it("parallel first initialization serializes NULL compare-and-set and all read committed winner", async () => {
    const workers = 12;
    let readCount = 0;
    let releaseReads: (() => void) | undefined;
    const allRead = new Promise<void>((resolve) => { releaseReads = resolve; });
    let successfulWrites = 0;
    findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (!tokens.has(where.id) && readCount < workers) {
        readCount += 1;
        if (readCount === workers) releaseReads?.();
        await allRead;
        // Simulate first 12 transactions observing NULL before the CAS update.
        return { appleAppAccountToken: null };
      }
      return { appleAppAccountToken: tokens.get(where.id) ?? null };
    });
    updateMany.mockImplementation(async ({ where, data }) => {
      expect(where).toEqual({ id: "parallel-owner", appleAppAccountToken: null });
      if (tokens.has(where.id)) return { count: 0 };
      tokens.set(where.id, data.appleAppAccountToken);
      successfulWrites += 1;
      return { count: 1 };
    });
    const all = await Promise.all(
      Array.from({ length: workers }, () => initializeAppleTokenForAuthenticatedOwner("parallel-owner")),
    );
    expect(readCount).toBe(workers);
    expect(successfulWrites).toBe(1);
    expect(updateMany).toHaveBeenCalledTimes(workers);
    expect(new Set(all.map((value) => value.appleAppAccountToken)).size).toBe(1);
    expect(all[0]?.appleAppAccountToken).toBe(tokens.get("parallel-owner"));
  });

  it("respects preexisting legacy Apple token without issuing a write", async () => {
    const original = "ab1f16db-83e8-4ffd-9041-c7fb7561462d";
    tokens.set("legacy-owner", original);
    expect(await initializeAppleTokenForAuthenticatedOwner("legacy-owner"))
      .toEqual({ appleAppAccountToken: original });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("preserves a concurrent winner installed between initial read and CAS", async () => {
    const original = "85ad8c39-8856-4d91-84c6-a01a080e8b13";
    updateMany.mockImplementationOnce(async ({ where }) => {
      tokens.set(where.id, original);
      return { count: 0 };
    });
    expect(await initializeAppleTokenForAuthenticatedOwner("losing-owner"))
      .toEqual({ appleAppAccountToken: original });
    expect(tokens.get("losing-owner")).toBe(original);
  });

  it("owner change cannot overwrite or inherit another account token", async () => {
    const original = await initializeAppleTokenForAuthenticatedOwner("owner-a");
    const changed = await initializeAppleTokenForAuthenticatedOwner("owner-b");
    expect(changed.appleAppAccountToken).not.toBe(original.appleAppAccountToken);
    expect((await initializeAppleTokenForAuthenticatedOwner("owner-a"))).toEqual(original);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "owner-b" }, select: { appleAppAccountToken: true },
    });
  });

  it("rejects absent/vanished owner without returning an unpersisted token", async () => {
    await expect(initializeAppleTokenForAuthenticatedOwner("")).rejects.toBeInstanceOf(
      AppleTokenOwnerUnavailableError,
    );
    await expect(initializeAppleTokenForAuthenticatedOwner("vanished-owner"))
      .rejects.toBeInstanceOf(AppleTokenOwnerUnavailableError);
  });
});
