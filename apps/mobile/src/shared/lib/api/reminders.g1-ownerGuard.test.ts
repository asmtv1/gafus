import { beforeEach, describe, expect, it, vi } from "vitest";
const transport = vi.hoisted(() => vi.fn());
vi.mock("./client", () => ({ apiClient: (...args: unknown[]) => transport(...args) }));
import { remindersApi } from "./reminders";
beforeEach(() => {
  transport.mockReset().mockResolvedValue({ success: true });
});
const guard = () => true;
describe("actual remindersApi existing Hono routes with optional owner/epoch guard", () => {
  it("GET forwards guard and preserves current unauth-agnostic legacy contract", async () => {
    await remindersApi.getAll(guard);
    expect(transport).toHaveBeenCalledWith("/api/v1/reminders", { requestGuard: guard });
    transport.mockClear();
    await remindersApi.getAll();
    expect(transport).toHaveBeenCalledExactlyOnceWith("/api/v1/reminders", {});
  });
  it("POST forwards exact standard create fields and guard; no extra idempotency field invented", async () => {
    const payload = {
      name: "Тренировка",
      reminderTime: "08:15",
      reminderDays: "1,3",
      timezone: "Europe/Moscow",
    };
    await remindersApi.create(payload, guard);
    expect(transport).toHaveBeenCalledExactlyOnceWith("/api/v1/reminders", {
      method: "POST",
      body: payload,
      skipAuthRefreshReplay: true,
      requestGuard: guard,
    });
  });
  it("PUT toggles only enabled, never accidentally overwrites name/time/day fields", async () => {
    await remindersApi.update("saved-id", { enabled: false }, guard);
    expect(transport).toHaveBeenCalledExactlyOnceWith("/api/v1/reminders/saved-id", {
      method: "PUT",
      body: { enabled: false },
      skipAuthRefreshReplay: true,
      requestGuard: guard,
    });
  });
  it("PUT edits exact existing Hono recurrence/name/time/IANA timezone fields without extra DTO",async()=>{
    const changes={name:"Вечерняя прогулка",reminderTime:"20:45",
      reminderDays:"2,4,6",timezone:"Asia/Tokyo"};
    await remindersApi.update("edit-1",changes,guard);
    expect(transport).toHaveBeenCalledExactlyOnceWith("/api/v1/reminders/edit-1",{
      method:"PUT",body:changes,requestGuard:guard,skipAuthRefreshReplay:true,
    });
  });
  it("DELETE is existing owner-scoped route, guarded before and after auth refresh", async () => {
    await remindersApi.remove("saved-id", guard);
    expect(transport).toHaveBeenCalledExactlyOnceWith("/api/v1/reminders/saved-id", {
      method: "DELETE",
      skipAuthRefreshReplay: true,
      requestGuard: guard,
    });
  });
});
