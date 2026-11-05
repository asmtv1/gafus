/** User-visible local retry guidance, distinct from an unavailable server job. */
export function videoRetryMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
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
