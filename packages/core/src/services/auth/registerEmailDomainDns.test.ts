import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({ mx: vi.fn(), a: vi.fn(), aaaa: vi.fn(), cancel: vi.fn() }));
vi.mock("node:dns/promises", () => ({
  Resolver: class {
    resolveMx = dns.mx;
    resolve4 = dns.a;
    resolve6 = dns.aaaa;
    cancel = dns.cancel;
  },
}));
let check: typeof import("./registerEmailDomainDns").canRegisterEmailDomain;
const failure = (code: string) => Object.assign(new Error(code), { code });

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));
  dns.mx.mockResolvedValue([{ priority: 10, exchange: "mail.example.com" }]);
  dns.a.mockRejectedValue(failure("ENODATA"));
  dns.aaaa.mockRejectedValue(failure("ENODATA"));
  check = (await import("./registerEmailDomainDns")).canRegisterEmailDomain;
});
afterEach(() => vi.useRealTimers());

describe("registration email domain DNS", () => {
  it("accepts MX without address queries", async () => {
    expect(await check("example.com")).toBe(true);
    expect(dns.mx).toHaveBeenCalledWith("example.com");
    expect(dns.a).not.toHaveBeenCalled();
    expect(dns.aaaa).not.toHaveBeenCalled();
    expect(dns.cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["a", "aaaa"] as const)("accepts implicit MX via %s when MX is absent", async (type) => {
    dns.mx.mockRejectedValue(failure("ENODATA"));
    dns[type].mockResolvedValue([type === "a" ? "192.0.2.1" : "2001:db8::1"]);
    expect(await check("example.com")).toBe(true);
    expect(dns.a).toHaveBeenCalledOnce();
    expect(dns.aaaa).toHaveBeenCalledOnce();
  });
  it("falls back on an empty MX response and rejects absent addresses", async () => {
    dns.mx.mockResolvedValue([]);
    expect(await check("example.com")).toBe(false);
    expect(dns.a).toHaveBeenCalledWith("example.com");
    expect(dns.aaaa).toHaveBeenCalledWith("example.com");
  });
  it.each(["a", "aaaa"] as const)("accepts a successful %s fallback despite a temporary failure in the other family", async (type) => {
    dns.mx.mockResolvedValue([]);
    dns.a.mockRejectedValue(failure("ESERVFAIL"));
    dns.aaaa.mockRejectedValue(failure("ESERVFAIL"));
    dns[type].mockResolvedValue([type === "a" ? "192.0.2.1" : "2001:db8::1"]);
    expect(await check("example.com")).toBe(true);
  });
  it("rejects NXDOMAIN without fallback", async () => {
    dns.mx.mockRejectedValue(failure("ENOTFOUND"));
    expect(await check("example.com")).toBe(false);
    expect(dns.a).not.toHaveBeenCalled();
  });
  it.each([".", ""])("rejects Null MX exchange %j without fallback", async (exchange) => {
    dns.mx.mockResolvedValue([{ priority: 0, exchange }]);
    expect(await check("example.com")).toBe(false);
    expect(dns.a).not.toHaveBeenCalled();
  });
  it.each(["ESERVFAIL", "ETIMEOUT", "EREFUSED", "ECONNREFUSED"])("allows temporary %s and does not cache it", async (code) => {
    dns.mx.mockRejectedValueOnce(failure(code));
    expect(await check("example.com")).toBe(true);
    expect(dns.a).not.toHaveBeenCalled();
    dns.mx.mockRejectedValueOnce(failure("ENOTFOUND"));
    expect(await check("example.com")).toBe(false);
    expect(dns.mx).toHaveBeenCalledTimes(2);
  });
  it("allows temporary address failure when neither address query succeeds", async () => {
    dns.mx.mockResolvedValue([]);
    dns.a.mockRejectedValue(failure("ESERVFAIL"));
    expect(await check("example.com")).toBe(true);
    dns.a.mockRejectedValue(failure("ENODATA"));
    expect(await check("example.com")).toBe(false);
  });
  it.each(["mx", "fallback"])("allows and cancels a hanging %s query after 1500ms without caching", async (phase) => {
    if (phase === "mx") dns.mx.mockImplementationOnce(() => new Promise(() => {}));
    else {
      dns.mx.mockResolvedValueOnce([]);
      dns.a.mockImplementationOnce(() => new Promise(() => {}));
    }
    let finished = false;
    const pending = check("example.com").then((result) => { finished = true; return result; });
    await vi.advanceTimersByTimeAsync(1499);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe(true);
    expect(dns.cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    dns.mx.mockRejectedValueOnce(failure("ENOTFOUND"));
    expect(await check("example.com")).toBe(false);
    expect(dns.mx).toHaveBeenCalledTimes(2);
  });
  it.each([true, false])("caches definitive verdict %s for exactly 24h", async (accepted) => {
    if (!accepted) dns.mx.mockRejectedValue(failure("ENOTFOUND"));
    expect(await check("EXAMPLE.com")).toBe(accepted);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 - 1);
    expect(await check("example.com")).toBe(accepted);
    expect(dns.mx).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    expect(await check("example.com")).toBe(accepted);
    expect(dns.mx).toHaveBeenCalledTimes(2);
  });
  it("normalizes IDN domains for DNS and cache", async () => {
    expect(await check("почта.рф")).toBe(true);
    expect(await check("xn--80a1acny.xn--p1ai")).toBe(true);
    expect(dns.mx).toHaveBeenCalledOnce();
    expect(dns.mx).toHaveBeenCalledWith("xn--80a1acny.xn--p1ai");
  });
  it("bounds cache at 1000 entries and evicts the oldest", async () => {
    for (let i = 0; i <= 1000; i++) await check(`domain${i}.test`);
    await check("domain1.test");
    expect(dns.mx).toHaveBeenCalledTimes(1001);
    await check("domain0.test");
    expect(dns.mx).toHaveBeenCalledTimes(1002);
  });
});
