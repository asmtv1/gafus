import { expect, it, vi } from "vitest";
import { z } from "zod";

const randomUUID = vi.hoisted(() =>
  vi.fn()
    .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440001")
    .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440002"),
);
vi.mock("expo-crypto", () => ({ randomUUID }));
vi.mock("@react-navigation/native", () => ({ useIsFocused: () => true }));
vi.mock("@/shared/lib/api/gallery", () => ({ galleryApi: {} }));
vi.mock("@/shared/stores/authStore", () => ({ useAuthStore: vi.fn() }));
vi.mock("./session", () => ({ registerGalleryClient: vi.fn() }));

import { requestId } from "./data";

it("uses unique UUIDs accepted by upload, retry and move validation", () => {
  const first = requestId();
  const second = requestId();
  expect(first).not.toBe(second);
  expect(z.string().uuid().safeParse(first).success).toBe(true);
  expect(z.string().uuid().safeParse(second).success).toBe(true);
  expect(randomUUID).toHaveBeenCalledTimes(2);
});
