/** Device/browser photo encoding is the ONLY processing path: no Cloud photo Jobs.
 * Error messages deliberately never echo untrusted server/S3 error text or URLs.
 */
export function photoRetryMessage(reason: unknown): string {
  const raw = reason instanceof Error ? reason.message : String(reason ?? "");
  if (/size|large|limit|10.?mib|10.?mb|размер|сверх|слишком больш|413|лимит/i.test(raw))
    return "Фотография слишком большая или не поместилась в лимит. Попробуйте другую фотографию либо уменьшите её размер и нажмите круглую стрелку.";
  if (/unsupported|format|mime|decode|corrupt|invalid.image|heic|формат|поврежд|не удалось прочитать/i.test(raw))
    return "Не удалось прочитать фотографию. Откройте её в галерее, сохраните как JPG или PNG и повторите обработку стрелкой.";
  if (/timeout|network|fetch|s3|cloud|connection|offline|storage|temporarily|502|503|504|408|429|сеть|интернет|соединен|загрузк|хранилищ|передач/i.test(raw))
    return "Фотография подготовлена, но не отправилась. Проверьте интернет и повторите загрузку круглой стрелкой на этой фотографии.";
  return "Не удалось обработать фотографию на вашем устройстве. Освободите место, не закрывайте страницу и нажмите круглую стрелку на этом фото. Если ошибка повторится, попробуйте JPG или PNG.";
}
