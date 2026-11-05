/** WebP is encoded on the phone, not by a backend/Cloud photo worker.
 * Avoid showing raw S3 error codes or sensitive URLs to users.
 */
export function photoRetryMessage(reason: unknown): string {
  const raw = reason instanceof Error ? reason.message : String(reason ?? "");
  if (/size|large|limit|10.?mib|10.?mb|размер|слишком больш|413|лимит/i.test(raw))
    return "Фото слишком большое. Уменьшите его или выберите другое и нажмите круглую стрелку.";
  if (/unsupported|format|mime|decode|corrupt|invalid.image|heic|формат|поврежд|не удалось прочитать/i.test(raw))
    return "Не удалось прочитать фото. Сохраните его в галерее как JPG или PNG и повторите стрелкой.";
  if (/timeout|network|fetch|s3|cloud|connection|offline|storage|temporarily|502|503|504|408|429|сеть|интернет|соединен|загрузк|хранилищ|передач/i.test(raw))
    return "Фото не отправилось. Проверьте интернет и нажмите круглую стрелку на этом фото.";
  return "Не удалось обработать фото на телефоне. Освободите место, оставьте приложение открытым и нажмите круглую стрелку. Если не поможет, выберите JPG или PNG.";
}
