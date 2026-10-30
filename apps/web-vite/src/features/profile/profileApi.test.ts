import { afterEach, describe, expect, it, vi } from "vitest";
import { getMyProfile, updateMyProfile, uploadMyAvatar } from "./profileApi";
import { publicImageUrl } from "./publicProfileApi";

afterEach(() => vi.unstubAllGlobals());

const profile = {
  id: "user1",
  username: "tester",
  phone: "+79123456789",
  email: "hidden@example.com",
  accessToken: "never-in-ui",
  profile: { fullName: "Иван", city: "Москва", about: "Люблю собак" },
};

describe("profile transport", () => {
  it("projects only the authenticated owner email and strips unrelated secrets", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: profile }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mock);
    const result = await getMyProfile();
    expect(result).toEqual({
      id: "user1", username: "tester", email: "hidden@example.com",
      profile: { fullName: "Иван", city: "Москва", about: "Люблю собак" },
    });
    expect(mock.mock.calls[0][0]).toBe("/api/v1/user/profile");
    expect(mock.mock.calls[0][1].credentials).toBe("include");
    expect(JSON.stringify(result)).toContain("hidden@example.com");
    expect(JSON.stringify(result)).not.toContain("+79123456789");
    expect(JSON.stringify(result)).not.toContain("never-in-ui");
  });

  it("never projects malformed or untrusted email strings into profile DOM", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success:true, data:{ ...profile,
        email:"UNSAFE\r\nset-cookie:invalid" } }),{status:200}),
    ));
    const owner = await getMyProfile();
    expect(owner).not.toHaveProperty("email");
    expect(owner).not.toHaveProperty("phone");
  });

  it("rejects partial or invalid user DTO", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        success: true, data: { id: "user1", username: "tester", profile: { fullName: [] } },
      }), { status: 200 }),
    ));
    await expect(getMyProfile()).rejects.toThrow("Некорректный профиль");
  });

  it("sends editable fields only, with same-origin browser cookies", async () => {
    const mocked = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { userId: "user1", fullName: "Новое имя" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", mocked);
    await updateMyProfile({ fullName: "Новое имя", city: "", about: "" });
    const [path, options] = mocked.mock.calls[0];
    expect(path).toBe("/api/v1/user/profile");
    expect(options.method).toBe("PUT");
    expect(options.credentials).toBe("include");
    expect(options.cache).toBe("no-store");
    expect(JSON.parse(options.body)).toEqual({
      fullName: "Новое имя", city: "", about: "",
    });
    expect(JSON.stringify(options)).not.toContain("Bearer");
  });

  it("does not treat a permission error as an empty profile", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: "Forbidden" }), { status: 403 }),
    ));
    await expect(getMyProfile()).rejects.toMatchObject({ status: 403 });
  });
});


describe("registered avatar multipart owner transport", () => {
  const oldPath = "https://storage.yandexcloud.net/gafus-media/uploads/users/A/avatar.png";
  const file = () => new File([new Uint8Array([137, 80, 78, 71])], "avatar.png",
    { type: "image/png" });
  it("uses only original POST /user/avatar, File FormData and cookie auth", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { avatarUrl: oldPath },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(uploadMyAvatar(file())).resolves.toBe(oldPath);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [path, options] = fetcher.mock.calls[0];
    expect(path).toBe("/api/v1/user/avatar");
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("include");
    expect(options.cache).toBe("no-store");
    expect(options.headers).not.toHaveProperty("Content-Type");
    expect(options.headers).not.toHaveProperty("Authorization");
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("file")).toBeInstanceOf(File);
    expect(options.body.get("file").name).toBe("avatar.png");
  });
  it("rejects unsupported or empty files before any upload", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(uploadMyAvatar(new File(["x"], "unsafe.svg", {
      type: "image/svg+xml",
    }))).rejects.toThrow("JPEG");
    await expect(uploadMyAvatar(new File([], "empty.png", {
      type: "image/png",
    }))).rejects.toThrow("5 МБ");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not accept a 201 or unrecognized URL as proof of avatar mutation", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true, data: { avatarUrl: oldPath },
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true, data: { avatarUrl: "javascript:alert(1)" },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(uploadMyAvatar(file())).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(uploadMyAvatar(file())).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});


describe("dev-only signed isolated avatar projection safety", () => {
  const signed = "http://127.0.0.1:9000/gafus-refactor-documents-test/" +
    "documents/uploads/users/user1/avatar/00000000-0000-4000-8000-000000000000.png" +
    "?X-Amz-Expires=600&X-Amz-Signature=synthetic-test";
  it("allows only the signed existing Documents/avatar shape at exact local origin", async () => {
    vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:5173" } });
    expect(publicImageUrl(signed)).toBe(signed);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { ...profile, profile: {
        ...profile.profile, avatarUrl: signed,
      } },
    }), { status: 200 })));
    const owner = await getMyProfile();
    expect(owner.profile.avatarUrl).toBe(signed);
  });
  it("rejects lookalike unsigned, other bucket, other localhost port and non-avatar paths", () => {
    vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:5173" } });
    expect(publicImageUrl(signed.replace("X-Amz-Signature", "fake"))).toBe(null);
    expect(publicImageUrl(signed.replace("-documents-", "-gallery-"))).toBe(null);
    expect(publicImageUrl(signed.replace(":9000/", ":9002/"))).toBe(null);
    expect(publicImageUrl(signed.replace("/avatar/", "/invoices/"))).toBe(null);
    expect(publicImageUrl("javascript:alert(1)")).toBe(null);
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });
    expect(publicImageUrl(signed)).toBe(null);
  });
});
