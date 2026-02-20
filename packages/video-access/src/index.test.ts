import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createVideoAccessService,
  getVideoAccessService,
} from "./index";

const VALID_SECRET = "a".repeat(32);

describe("createVideoAccessService / VideoAccessService constructor", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("создаёт инстанс при secret ≥32 символов", () => {
    const service = createVideoAccessService(VALID_SECRET);
    expect(service).toBeDefined();
    expect(typeof service.generateToken).toBe("function");
    expect(typeof service.verifyToken).toBe("function");
  });

  it("throw при secret < 32 символов", () => {
    expect(() => createVideoAccessService("short")).toThrow(
      "VIDEO_ACCESS_SECRET must be at least 32 characters",
    );
  });

  it("throw при secret 31 символ", () => {
    expect(() => createVideoAccessService("a".repeat(31))).toThrow(
      "VIDEO_ACCESS_SECRET must be at least 32 characters",
    );
  });

  it("throw в production без secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VIDEO_ACCESS_SECRET", "");
    expect(() => createVideoAccessService("")).toThrow(
      "VIDEO_ACCESS_SECRET must be set in production",
    );
  });

  it("accept trim-whitespace secret", () => {
    const service = createVideoAccessService(`  ${VALID_SECRET}  `);
    const token = service.generateToken({
      videoId: "v1",
      userId: "u1",
    });
    expect(token).toBeTruthy();
  });

  it("при пустом secret и NODE_ENV=test использует random secret (staging/test path)", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VIDEO_ACCESS_SECRET", "");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const service = createVideoAccessService("  ");
    expect(service).toBeDefined();
    const token = service.generateToken({ videoId: "v1", userId: "u1" });
    expect(token).toBeTruthy();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Using random VIDEO_ACCESS_SECRET"),
    );
    warnSpy.mockRestore();
  });

  it("при NODE_ENV=development и пустом secret создаёт сервис с random secret", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VIDEO_ACCESS_SECRET", "");
    const service = createVideoAccessService("  ");
    expect(service).toBeDefined();
    const token = service.generateToken({ videoId: "v1", userId: "u1" });
    expect(token).toBeTruthy();
  });
});

describe("generateToken / verifyToken roundtrip", () => {
  const service = createVideoAccessService(VALID_SECRET);

  it("roundtrip: generateToken → verifyToken возвращает совпадающий payload", () => {
    const options = { videoId: "video-1", userId: "user-1", ttlMinutes: 60 };
    const token = service.generateToken(options);
    const payload = service.verifyToken(token);

    expect(payload).not.toBeNull();
    expect(payload!.videoId).toBe("video-1");
    expect(payload!.userId).toBe("user-1");
    expect(payload!.expiresAt).toBeGreaterThan(Date.now());
  });

  it("verifyToken возвращает null для истёкшего токена (jwt throws)", () => {
    const token = service.generateToken({
      videoId: "v1",
      userId: "u1",
      ttlMinutes: 0,
    });
    const payload = service.verifyToken(token);
    expect(payload).toBeNull();
  });

  it("verifyToken возвращает null когда payload.expiresAt в прошлом (custom check)", () => {
    // Токен с exp в будущем, но payload.expiresAt в прошлом — покрывает ветку line 99
    const secret = VALID_SECRET;
    const payload = {
      videoId: "v1",
      userId: "u1",
      expiresAt: Date.now() - 60000,
    };
    const token = jwt.sign(payload, secret, {
      algorithm: "HS256",
      expiresIn: "60m",
    });
    const result = service.verifyToken(token);
    expect(result).toBeNull();
  });

  it("verifyToken возвращает null для подделанного токена", () => {
    const validToken = service.generateToken({
      videoId: "v1",
      userId: "u1",
    });
    const tampered = validToken.slice(0, -5) + "xxxxx";
    const payload = service.verifyToken(tampered);
    expect(payload).toBeNull();
  });

  it("verifyToken возвращает null для невалидной строки", () => {
    expect(service.verifyToken("not-a-jwt")).toBeNull();
    expect(service.verifyToken("")).toBeNull();
  });
});

describe("generateSignedUrl / verifySignedUrl", () => {
  const service = createVideoAccessService(VALID_SECRET);

  it("generateSignedUrl создаёт URL с token в query", () => {
    const url = service.generateSignedUrl(
      "https://cdn.example.com/video.m3u8",
      "vid-1",
      "uid-1",
    );
    expect(url).toContain("?token=");
    expect(url).toContain("https://cdn.example.com/video.m3u8");
  });

  it("verifySignedUrl с валидным URL возвращает payload", () => {
    const baseUrl = "https://cdn.example.com/video.m3u8";
    const url = service.generateSignedUrl(baseUrl, "vid-1", "uid-1");
    const payload = service.verifySignedUrl(url);
    expect(payload).not.toBeNull();
    expect(payload!.videoId).toBe("vid-1");
    expect(payload!.userId).toBe("uid-1");
  });

  it("verifySignedUrl без token в query возвращает null", () => {
    const url = "https://cdn.example.com/video.m3u8";
    const payload = service.verifySignedUrl(url);
    expect(payload).toBeNull();
  });

  it("verifySignedUrl с invalid URL возвращает null", () => {
    const payload = service.verifySignedUrl("not-a-valid-url");
    expect(payload).toBeNull();
  });
});

describe("generateHmacSignature / verifyHmacSignature", () => {
  const service = createVideoAccessService(VALID_SECRET);

  it("generateHmacSignature возвращает hex-строку", () => {
    const sig = service.generateHmacSignature("data");
    expect(typeof sig).toBe("string");
    expect(/^[0-9a-f]+$/i.test(sig)).toBe(true);
  });

  it("verifyHmacSignature с правильной подписью возвращает true", () => {
    const data = "video-id:user-id";
    const sig = service.generateHmacSignature(data);
    expect(service.verifyHmacSignature(data, sig)).toBe(true);
  });

  it("verifyHmacSignature с неправильной подписью возвращает false", () => {
    const data = "video-id:user-id";
    expect(service.verifyHmacSignature(data, "wrong-signature")).toBe(false);
  });

  it("подпись детерминирована для одинаковых данных", () => {
    const data = "same-data";
    const s1 = service.generateHmacSignature(data);
    const s2 = service.generateHmacSignature(data);
    expect(s1).toBe(s2);
  });
});

describe("getVideoAccessService (singleton)", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("возвращает один и тот же инстанс при повторных вызовах", async () => {
    vi.stubEnv("VIDEO_ACCESS_SECRET", VALID_SECRET);
    const { getVideoAccessService: getService } = await import("./index");
    const s1 = getService();
    const s2 = getService();
    expect(s1).toBe(s2);
  });
});
