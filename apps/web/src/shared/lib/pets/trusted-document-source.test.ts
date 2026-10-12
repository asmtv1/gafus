import { describe, expect, it } from "vitest";
import { trustedLegacyPetDocumentSource } from "./trusted-document-source";
describe("trusted document proxy targets", () => {
  it.each([
    "https://storage.yandexcloud.net/gafus-media/uploads/users/u/pets/p/documents/doc.pdf",
    "https://gafus-media.storage.yandexcloud.net/uploads/users/u/doc.pdf",
    "https://gafus.ru/uploads/users/u/pets/p/documents/doc.pdf",
  ])("allows only a legacy user object: %s", (value) => {
    expect(trustedLegacyPetDocumentSource(value)).toBe(true);
  });
  it.each([
    "http://storage.yandexcloud.net/gafus-media/uploads/users/u/doc.pdf",
    "https://storage.yandexcloud.net/gafus-media/uploads/videocourses/course.mp4",
    "https://127.0.0.1/admin/secrets",
    "https://storage.yandexcloud.net.attacker.test/gafus-media/uploads/users/u/doc.pdf",
    "https://gafus.ru/api/v1/user/secret",
    "https://gafus.ru/uploads/users/u/%2e%2e/secret",
    "https://gafus.ru/uploads/users/u/doc.pdf?redirect=https://evil.test",
    "https://user:pass@gafus.ru/uploads/users/u/doc.pdf",
  ])("rejects unsafe document proxy target: %s", (value) => {
    expect(trustedLegacyPetDocumentSource(value)).toBe(false);
  });
});
