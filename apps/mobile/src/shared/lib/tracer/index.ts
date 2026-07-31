/**
 * Единый error-reporting facade: JS errors go to the dedicated AppTracer JS
 * project, native crashes go to the native AppTracer SDK.
 */
export { installGlobalJsErrorHandler } from "./installGlobalJsErrorHandler";
export { reportClientError, reportClientErrorAndWait } from "./reportClientError";
export { isTracerEnabled } from "./tracerConfig";
export {
  addTracerBreadcrumb,
  getMobileJsTracerReleaseInfo,
  initializeMobileJsTracer,
  setTracerNetworkContext,
  setTracerScreen,
  setTracerUser,
} from "./mobileJsTracer";
export type { ClientErrorData } from "./types";
