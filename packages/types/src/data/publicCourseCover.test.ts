import { describe, it, expect } from "vitest";
import { publicCourseCoverUrl } from "./publicCourseCover";

describe("strict anonymous course media projection", () => {
  it("retains only unsigned public bucket images", () => {
    for (const value of [
      "https://storage.yandexcloud.net/gafus-media/uploads/courses/cover.webp",
      "https://gafus-media.storage.yandexcloud.net/uploads/course.jpg",
      // Legacy course-cover objects have .blob keys but are served as image/png.
      "https://storage.yandexcloud.net/gafus-media/uploads/trainers/trainer123/courses/0478ee02-df96-4f9d-8e30-e050e002faf5/0478ee02-df96-4f9d-8e30-e050e002faf5.blob",
      "https://gafus-media.storage.yandexcloud.net/uploads/trainers/trainer123/courses/798a7d39-3491-4ff1-bab8-252afe96871d/798a7d39-3491-4ff1-bab8-252afe96871d.blob",
    ]) expect(publicCourseCoverUrl(value)).toBe(value);
  });
  it("refuses signed, credentialed, private and unusual destinations", () => {
    for (const value of [null, "", "http://storage.yandexcloud.net/gafus-media/uploads/x.webp",
      "https://storage.yandexcloud.net/another-bucket/uploads/x.webp",
      "https://evil.test/uploads/x.jpg", "//evil.test/logo.jpg", "/uploads/logo.jpg",
      "javascript:alert(1)", "data:image/png;base64,abc", "https://localhost/x.png",
      "https://storage.yandexcloud.net/gafus-media/private/photo.jpg",
      "https://storage.yandexcloud.net/gafus-media/uploads/photo.png?X-Amz-Signature=secret",
      "https://storage.yandexcloud.net/gafus-media/uploads/%2e%2e/private/photo.png",
      "https://storage.yandexcloud.net/gafus-media/uploads/photo.svg",
      "https://storage.yandexcloud.net/gafus-media/uploads/random.blob",
      "https://storage.yandexcloud.net/gafus-media/uploads/private/courses/0478ee02-df96-4f9d-8e30-e050e002faf5.blob",
      "https://storage.yandexcloud.net/gafus-media/uploads/trainers/owner/courses/0478ee02-df96-4f9d-8e30-e050e002faf5/another.blob",
      "https://storage.yandexcloud.net/gafus-media/uploads/trainers/owner/courses/0478ee02-df96-4f9d-8e30-e050e002faf5/0478ee02-df96-4f9d-8e30-e050e002faf5.blob?sig=private",
      "https://evil.test/uploads/trainers/owner/courses/0478ee02-df96-4f9d-8e30-e050e002faf5/0478ee02-df96-4f9d-8e30-e050e002faf5.blob",
      "https://storage.yandexcloud.net/gafus-media/uploads/a.png#token",
    ]) expect(publicCourseCoverUrl(value)).toBeNull();
  });
});
