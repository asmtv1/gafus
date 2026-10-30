import { describe, it, expect, vi, beforeEach } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: { user: { findUnique: m.user } } }));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ info: vi.fn(), error: vi.fn() }) }));
import { readAccountDeletionPreflight } from "./deleteUserAccount";
beforeEach(() => vi.resetAllMocks());
describe("account deletion preflight, isolated minimal owner projection", () => {
 it("reads only own ID, username and email, then returns boolean presence", async () => {
  m.user.mockResolvedValueOnce({id:"owner",username:"owner",email:" owner@example.test "});
  await expect(readAccountDeletionPreflight("owner")).resolves.toEqual({id:"owner",username:"owner",hasEmail:true});
  expect(m.user).toHaveBeenCalledExactlyOnceWith({where:{id:"owner"},select:{id:true,username:true,email:true}});
 });
 it("empty email is explicitly false without exposing any raw email", async () => {
  m.user.mockResolvedValueOnce({id:"owner",username:"owner",email:" "});
  const result=await readAccountDeletionPreflight("owner");
  expect(result).toEqual({id:"owner",username:"owner",hasEmail:false});
  expect(JSON.stringify(result)).not.toContain("email:");
 });
 it("absent owner and blank actor cannot unlock deletion", async () => {
  await expect(readAccountDeletionPreflight(" ")).resolves.toBeNull();
  expect(m.user).not.toHaveBeenCalled();
  m.user.mockResolvedValueOnce(null);
  await expect(readAccountDeletionPreflight("missing")).resolves.toBeNull();
 });
});
