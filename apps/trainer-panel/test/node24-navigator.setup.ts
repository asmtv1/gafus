/**
 * Vitest-only compatibility for Node >= 21, which exposes a getter-only
 * global navigator. These suites set isolated JSDOM globals using
 * Object.assign(globalThis, { navigator: dom.window.navigator, ... }).
 * Keep the Node 24 native value until the individual test installs JSDOM.
 * Never load this helper in application or server runtime.
 */
const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
if (descriptor && descriptor.configurable &&
    ("get" in descriptor || ("value" in descriptor && !descriptor.writable))) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    enumerable: descriptor.enumerable,
    writable: true,
    value: globalThis.navigator,
  });
}
