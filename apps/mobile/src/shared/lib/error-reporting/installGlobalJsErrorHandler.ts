import { reportClientError } from "./reportClientError";

type RnErrorUtils = {
  getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
};

let installed = false;
let promiseInstalled=false;
/** RN enables its own Hermes tracker only in development. In production,
 * install the supported runtime hook when present without patching Promise
 * or replacing RN development diagnostics. Never serialize rejection values. */
export function installUnhandledPromiseReporter():boolean {
  if(promiseInstalled)return true;
  if(typeof __DEV__!=='undefined'&&__DEV__)return false;
  const hermes=(globalThis as {HermesInternal?:{
    enablePromiseRejectionTracker?:(options:{allRejections:boolean;onUnhandled:(id:number,reason:unknown)=>void;onHandled:(id:number)=>void})=>void;
  }}).HermesInternal;
  if(!hermes?.enablePromiseRejectionTracker)return false;
  try {
    hermes.enablePromiseRejectionTracker({
      allRejections:true,
      onUnhandled:(_id,reason)=>reportClientError(reason instanceof Error?reason:new Error("PROMISE_REJECTION"),{issueKey:"GlobalPromiseRejection"}),
      onHandled:()=>{},
    });
    promiseInstalled=true;
    return true;
  }catch{ /* diagnostic: expected Unhandled-rejection hook returns false on unsupported runtime. */ return false;}
}


/**
 * Репортит необработанные JS-ошибки в очередь GAFUS, затем вызывает предыдущий handler.
 * Вызывать один раз при старте приложения (например из root layout).
 */
export function installGlobalJsErrorHandler(): void {
  installUnhandledPromiseReporter();
  if (installed) return;
  const errorUtils = (globalThis as { ErrorUtils?: RnErrorUtils }).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) {
    return;
  }
  installed = true;
  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    reportClientError(error, {
      issueKey: "GlobalJsError",
      severity: isFatal ? "fatal" : "error",
      keys: { isFatal: String(Boolean(isFatal)) },
    });
    previous?.(error, isFatal);
  });
}
