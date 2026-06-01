import { afterEach, describe, expect, it } from "vitest";

import { isAbortError } from "./abortError";

describe("isAbortError", () => {
  const originalDOMException = globalThis.DOMException;

  afterEach(() => {
    if (originalDOMException) {
      globalThis.DOMException = originalDOMException;
    } else {
      Reflect.deleteProperty(globalThis, "DOMException");
    }
  });

  it("detects abort errors when DOMException is unavailable in React Native", () => {
    Reflect.deleteProperty(globalThis, "DOMException");
    const error = Object.assign(new Error("Aborted"), { name: "AbortError" });

    expect(isAbortError(error)).toBe(true);
  });
});
