import { PhotoUploadStageError } from "./photoUploadStage";

/** Classify failures without sending file paths, presigned URLs or filenames to telemetry. */
export function photoFailureCode(reason: unknown):
  "NATIVE_MISSING" | "SOURCE_MISSING" | "MEMORY" | "DECODE" | "ENCODE" |
  "NETWORK" | "STORAGE" | "SIZE" | "UNKNOWN" {
  const original = reason instanceof PhotoUploadStageError ? reason.original : reason;
  const raw = original instanceof Error ? original.message : String(original ?? "");
  if (/NativeSharedObjectNotFoundException|Unable to find the native shared object|PHOTO_ENCODER_UNEXPECTED_STATE/i.test(raw))
    return "ENCODE";
  if (/cannot find native module|native module.*(missing|not found|null)|ExpoImageManipulator.*(missing|undefined)|requireNativeModule/i.test(raw))
    return "NATIVE_MISSING";
  if (/PHOTO_SOURCE_MISSING|ENOENT|no such file|file.*not found|file.*does not exist|could not (open|read) file/i.test(raw))
    return "SOURCE_MISSING";
  if (/out.of.memory|bitmap.*allocat|not enough memory|heap.?space|OutOfMemoryError/i.test(raw))
    return "MEMORY";
  if (/size|large|limit|10.?mib|10.?mb|размер|слишком больш|413|лимит/i.test(raw))
    return "SIZE";
  if (/unsupported|format|mime|decode|corrupt|invalid.image|heic|формат|поврежд|не удалось прочитать|image loading failed/i.test(raw))
    return "DECODE";
  if (/encode|encoding|compress|bitmap|webp|jpeg|jpg|манипуляц/i.test(raw))
    return "ENCODE";
  if (/timeout|network|fetch|connection|offline|temporarily|502|503|504|408|429|сеть|интернет|соединен/i.test(raw))
    return "NETWORK";
  if (/s3|cloud|storage|хранилищ|передач|загрузк/i.test(raw))
    return "STORAGE";
  return "UNKNOWN";
}

/** User instructions must not expose native details or presigned S3 URLs. */
export function photoRetryMessage(reason: unknown): string {
  const category = photoFailureCode(reason);
  // The Feed publication queue persists a stable error.message STRING, not
  // the PhotoUploadStageError instance. Decode only our known-safe stage codes,
  // so a server-side 500 never appears as "out of space on your phone".
  const raw = reason instanceof Error ? reason.message : reason;
  const stage = reason instanceof PhotoUploadStageError ? reason.stage :
    typeof raw === "string" && /^PHOTO_(JPEG|WEBP|RESERVE|TRANSFER|CONFIRM)_FAILED$/.test(raw)
      ? raw.slice(6, -7).toLowerCase() : null;
  if (stage === "confirm")
    return "Сервер не подтвердил отправленное фото. Нажмите круглую стрелку для повтора. Если ошибка повторится, сообщите о проблеме.";
  if (stage === "reserve" || stage === "transfer")
    return "Фото не удалось отправить или зарезервировать на сервере. Проверьте интернет и повторите круглой стрелкой.";
  if (!(reason instanceof PhotoUploadStageError) && stage === "jpeg")
    return "Не удалось открыть фото для преобразования. Выберите его заново или сохраните как JPG.";
  if (!(reason instanceof PhotoUploadStageError) && stage === "webp")
    return "Не удалось создать WebP-версию фото на устройстве. Выберите фото заново или сохраните как JPG.";
  if (reason instanceof PhotoUploadStageError &&
      (category === "UNKNOWN" || category === "ENCODE")) {
    if (reason.stage === "jpeg")
      return "Не удалось открыть фото для преобразования. Попробуйте выбрать его заново или сохраните как JPG.";
    if (reason.stage === "webp")
      return "Не удалось создать WebP-версию фото на устройстве. Выберите фото заново или сохраните как JPG.";
    return "Не удалось подтвердить отправку фото. Проверьте интернет и повторите загрузку.";
  }
  switch (category) {
    case "NATIVE_MISSING":
      return "В этой сборке недоступна обработка фото. Обновите GAFUS через магазин приложений и попробуйте снова.";
    case "SOURCE_MISSING":
      return "Исходное фото больше недоступно. Выберите его заново из галереи.";
    case "MEMORY":
      return "Телефону не хватило памяти для фото. Закройте другие приложения, выберите фото заново и повторите.";
    case "SIZE":
      return "Фото слишком большое. Уменьшите его или выберите другое и нажмите круглую стрелку.";
    case "DECODE":
      return "Не удалось прочитать фото. Сохраните его в галерее как JPG или PNG и повторите стрелкой.";
    case "ENCODE":
      return "Не удалось создать обработанную фотографию. Повторите стрелкой; если ошибка останется, выберите фото из галереи заново.";
    case "NETWORK":
    case "STORAGE":
      return "Фото не отправилось. Проверьте интернет и нажмите круглую стрелку на этом фото.";
    default:
      return "Не удалось обработать фото на телефоне. Освободите место, оставьте приложение открытым и нажмите круглую стрелку. Если не поможет, выберите JPG или PNG.";
  }
}
