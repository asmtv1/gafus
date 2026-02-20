import { describe, expect, it } from "vitest";

import {
  createTokenHash,
  generateSecureToken,
  HASH_HEX_LENGTH,
  isValidTokenFormat,
  SALT_HEX_LENGTH,
  safeTokenCompare,
  TOKEN_VERSION,
} from "./csrf-crypto";

describe("csrf-crypto", () => {
  describe("isValidTokenFormat", () => {
    it("возвращает true для валидного формата salt.hash", () => {
      const valid = "a".repeat(SALT_HEX_LENGTH) + "." + "b".repeat(HASH_HEX_LENGTH);
      expect(isValidTokenFormat(valid)).toBe(true);
    });

    it("возвращает false для не 2 частей", () => {
      expect(isValidTokenFormat("single")).toBe(false);
      expect(isValidTokenFormat("a.b.c")).toBe(false);
    });

    it("возвращает false для не-hex символов", () => {
      const invalid = "x".repeat(SALT_HEX_LENGTH) + "." + "z".repeat(HASH_HEX_LENGTH);
      expect(isValidTokenFormat(invalid.replace("x", "~"))).toBe(false); // ~ не hex
      expect(isValidTokenFormat("a".repeat(SALT_HEX_LENGTH) + "." + "b".repeat(HASH_HEX_LENGTH))).toBe(true);
    });

    it("возвращает false для неверной длины salt", () => {
      const shortSalt = "a".repeat(SALT_HEX_LENGTH - 1) + "." + "b".repeat(HASH_HEX_LENGTH);
      expect(isValidTokenFormat(shortSalt)).toBe(false);
    });

    it("возвращает false для неверной длины hash", () => {
      const shortHash = "a".repeat(SALT_HEX_LENGTH) + "." + "b".repeat(HASH_HEX_LENGTH - 1);
      expect(isValidTokenFormat(shortHash)).toBe(false);
    });

    it("принимает кастомные saltHexLen и hashHexLen", () => {
      expect(isValidTokenFormat("ab.cd", 2, 2)).toBe(true);
      expect(isValidTokenFormat("ab.cde", 2, 2)).toBe(false);
    });
  });

  describe("createTokenHash", () => {
    it("детерминирован при одинаковых secret и salt", () => {
      const h1 = createTokenHash("secret", "salt");
      const h2 = createTokenHash("secret", "salt");
      expect(h1).toBe(h2);
    });

    it("разный хеш при разном salt", () => {
      const h1 = createTokenHash("secret", "salt1");
      const h2 = createTokenHash("secret", "salt2");
      expect(h1).not.toBe(h2);
    });

    it("использует version по умолчанию", () => {
      const h = createTokenHash("s", "a");
      expect(h).toHaveLength(HASH_HEX_LENGTH);
      expect(/^[0-9a-f]+$/i.test(h)).toBe(true);
    });

    it("разный хеш при разном version", () => {
      const h1 = createTokenHash("s", "a", "v1");
      const h2 = createTokenHash("s", "a", "v2");
      expect(h1).not.toBe(h2);
    });
  });

  describe("safeTokenCompare", () => {
    it("возвращает true для равных строк", () => {
      const s = "a".repeat(64);
      expect(safeTokenCompare(s, s)).toBe(true);
    });

    it("возвращает false для разных значений", () => {
      expect(safeTokenCompare("a".repeat(64), "b".repeat(64))).toBe(false);
    });

    it("возвращает false для разной длины", () => {
      expect(safeTokenCompare("aa", "aaa")).toBe(false);
    });

    it("сравнивает корректно hex-строки одинаковой длины", () => {
      expect(safeTokenCompare("deadbeef", "deadbeef")).toBe(true);
      expect(safeTokenCompare("deadbeef", "deadbeef0")).toBe(false);
    });
  });

  describe("generateSecureToken", () => {
    it("возвращает hex-строку нужной длины", () => {
      const t = generateSecureToken(16);
      expect(t).toHaveLength(32);
      expect(/^[0-9a-f]+$/i.test(t)).toBe(true);
    });

    it("генерирует разные значения при каждом вызове", () => {
      const t1 = generateSecureToken(32);
      const t2 = generateSecureToken(32);
      expect(t1).not.toBe(t2);
    });
  });

  describe("constants", () => {
    it("TOKEN_VERSION = v1", () => {
      expect(TOKEN_VERSION).toBe("v1");
    });
    it("SALT_HEX_LENGTH = 32", () => {
      expect(SALT_HEX_LENGTH).toBe(32);
    });
    it("HASH_HEX_LENGTH = 64", () => {
      expect(HASH_HEX_LENGTH).toBe(64);
    });
  });
});
