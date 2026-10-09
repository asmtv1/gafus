/** Return a useful S3 error without exposing request signatures or response content. */
export async function galleryUploadRejected(response: Pick<Response, "status" | "text">): Promise<Error> {
  let code: string | undefined;
  try {
    // S3 errors use XML. Never log or display the raw body: it may contain signed values.
    const body = await response.text();
    code = body.match(/<Code>\s*([A-Za-z][A-Za-z0-9_]{0,63})\s*<\/Code>/)?.[1];
  } catch {
    // A transport error must not mask the original HTTP failure.
  }
  const status = response.status >= 400 && response.status <= 599
    ? `HTTP ${response.status}` : "HTTP ошибка";
  const reason = code ? `${status}, ${code}` : status;
  return new Error(`Хранилище отклонило фотографию (${reason}). Сообщите этот код поддержке.`);
}
