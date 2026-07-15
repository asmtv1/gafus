/** Данные для ручной отправки ошибки в Tracer (интерфейс как на web) */
export interface ClientErrorData {
  userId?: string;
  issueKey?: string;
  severity?: "fatal" | "error" | "warning" | "notice" | "debug";
  keys?: Record<string, string | number | boolean>;
}

/** Элемент payload для uploadBatch (формат Tracer SDK) */
export interface TracerPayloadItem {
  type: "CRASH" | "NON_FATAL";
  format: "JS_STACKTRACE";
  severity: "FATAL" | "ERROR" | "WARNING" | "NOTICE" | "DEBUG";
  uploadBean: {
    environment: string;
    versionName: string;
    versionCode: number;
    deviceId: string;
    sessionUuid: string;
    osVersion: string;
    vendor: string;
    device: string;
    packageName: string;
    component?: string;
    tags?: string[];
    properties: Record<string, string | number | boolean | undefined>;
  };
  stackTrace: string;
  logsFile?: string;
}
