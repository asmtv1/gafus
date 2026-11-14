/**
 * Isomorphic, synchronous error signal bridge. Never imports Node-only OTLP
 * code so the @gafus/logger root remains safe for browser and mobile builds.
 * Error objects/messages/meta are NOT sent to the sink.
 */
export type ServerErrorSignal = {
  level: "error" | "fatal";
  /** Up to 4 bounded function+code-offset frames, with no original path. */
  stackFrames?: string;
  errorCode: "LOGGER_ERROR" | "TYPE_ERROR" | "REFERENCE_ERROR" |
    "RANGE_ERROR" | "SYNTAX_ERROR" | "URI_ERROR" | "ABORT_ERROR" |
    "PRISMA_ERROR" | "LOGGER_FATAL";
};
type ServerErrorSink = (signal:ServerErrorSignal)=>void;
let serverSink: ServerErrorSink | null = null;

export function installServerErrorSink(sink:ServerErrorSink|null):void {
  serverSink=sink;
}
function errorKind(error:Error | undefined): ServerErrorSignal["errorCode"] {
  // Never include an arbitrary Error.name, message, stack, URL, SQL, or
  // error's own enumerable application data in a telemetry event.
  if (!error) return "LOGGER_ERROR";
  switch (error.name) {
    case "TypeError": return "TYPE_ERROR";
    case "ReferenceError": return "REFERENCE_ERROR";
    case "RangeError": return "RANGE_ERROR";
    case "SyntaxError": return "SYNTAX_ERROR";
    case "URIError": return "URI_ERROR";
    case "AbortError": return "ABORT_ERROR";
    case "PrismaClientKnownRequestError": return "PRISMA_ERROR";
    default: return "LOGGER_ERROR";
  }
}
export function safeServerErrorFrames(error: Error | undefined):string|undefined {
  if(!error||typeof error.stack!=="string")return undefined;
  const sanitized:string[]=[];
  for(const line of error.stack.split("\n").slice(1,22)){
    if(sanitized.length>=4)break;
    // Raw paths (including relative, file://, node:, Windows, and URLs)
    // are never copied into output. Function names and numeric offsets
    // are the only fields permitted, with strict length/character caps.
    const match=/^\s*at ([A-Za-z_$][A-Za-z0-9_.$<>-]{0,63}) \((?:[^\r\n()]+):(\d{1,6}):(\d{1,5})\)\s*$/.exec(line);
    if(!match)continue;
    const func=match[1]!;
    if(/(?:\d{6}|[a-f0-9]{12}|token|secret|password|authorization)/i.test(func))
      continue;
    sanitized.push("at "+func+" (code:"+match[2]+":"+match[3]+")");
  }
  const result=sanitized.join("\n");
  return result.length>0&&result.length<=320?result:undefined;
}

export function emitServerErrorSignal(
  level:"error" | "fatal", error?:Error,
):void {
  if (!serverSink) return;
  const errorCode=level==="fatal" ? "LOGGER_FATAL" : errorKind(error);
  try { serverSink({level,errorCode,
    ...(safeServerErrorFrames(error)?{stackFrames:safeServerErrorFrames(error)}:{}),
  }); }
  catch {
    // Diagnostics must never alter business behavior.
  }
}
