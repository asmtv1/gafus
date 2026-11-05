/** User-visible local retry guidance, distinct from an unavailable server job. */
export function videoRetryMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (/VIDEO720_DIMENSIONS|VIDEO720_INVALID_MP4/i.test(raw))
    return "Не удалось подготовить совместимый MP4. Попробуйте другое видео или сохраните его как MP4 (H.264, до 30 кадров/с) и нажмите круглую стрелку.";
  if (/VIDEO720_FILE_TOO_LARGE/i.test(raw))
    return "Видео превышает 200 МБ после преобразования. Выберите более короткий ролик или уменьшите его размер.";
  if (/VIDEO720_TIMEOUT|VIDEO720_NATIVE_ERROR|VIDEO720_FILE_EMPTY|VIDEO720_INVALID_URI/i.test(raw))
    return "Не удалось преобразовать видео на устройстве. Оставьте GAFUS открытым, проверьте свободное место и повторите попытку стрелкой.";
  if (/VIDEO720_DISABLED/i.test(raw))
    return "Подготовка видео недоступна в этой сборке. Обновите GAFUS и повторите попытку.";
  if (/VIDEO_POSTER_/i.test(raw))
    return "Не получилось создать обложку видео. Освободите место, оставьте приложение открытым и нажмите круглую стрелку на этом видео. Вторая обложка для 360p не требуется.";
  if (/LOCAL_VIDEO|video.encode|encoder|codec|compress|перекодир|кодир|не удалось подготовить/i.test(raw))
    return "Не удалось создать видео H.264 на устройстве. Освободите место, закройте тяжёлые приложения и нажмите круглую стрелку на этом ролике. Если ошибка повторится, выберите совместимый MP4.";
  if (/size|too.large|200.mib|200.mb|длительност|размер|120.sec|формат|unsupported|mime/i.test(raw))
    return "Выберите видео MP4 (H.264), до 2 минут и 200 МБ, затем попробуйте снова.";
  if (/network|fetch|timeout|timed.out|s3|cloud|сеть|соединен|время загрузки|хранилищ|загрузк/i.test(raw))
    return "Видео не отправилось. Проверьте интернет и нажмите круглую стрелку на этом видео. Оригинал сохранён.";
  return "Не удалось подготовить видео. Освободите место, оставьте приложение открытым и нажмите круглую стрелку. Если не поможет, выберите MP4 (H.264).";
}
export const videoServerFailureMessage =
  "Сервер не завершил обработку видео. Проверка статуса не запустит её заново. Сохраните оригинал и прикрепите его повторно после восстановления обработки.";
