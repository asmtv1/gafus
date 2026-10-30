/** Feed Media V2 exposes attachment states, not a percentage. Keep the bar
 * indeterminate instead of presenting a made-up progress value. */
export function MomentCommentMediaProcessing({ count, createdAt }: {
  count: number; createdAt?: string;
}) {
  if (!Number.isSafeInteger(count) || count <= 0) return null;
  const age = createdAt ? Date.now() - Date.parse(createdAt) : NaN;
  const delayed = Number.isFinite(age) && age > 5 * 60_000;
  const noun = count % 10 === 1 && count % 100 !== 11 ? "вложение" :
    count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)
      ? "вложения" : "вложений";
  return <div className="moment-comment-processing" role={delayed ? "alert" : "status"}
    aria-label="Обработка вложений комментария">
    <div className="moment-comment-processing-title">
      <span className="moment-comment-processing-dot" aria-hidden="true" />
      <span>{delayed ? "Обработка вложений задерживается" :
        <>Обрабатываем {count} {noun}…</>}</span>
    </div>
    {!delayed && <div className="moment-comment-processing-track" role="progressbar"
      aria-label="Обработка медиа в комментарии"
      aria-valuetext="Обработка на сервере, процент пока неизвестен">
      <span className="moment-comment-processing-bar" aria-hidden="true" />
    </div>}
    <small>{delayed
      ? "Сервис обработки отвечает медленно. Комментарий сохранён, вложения ожидают обработки. Обновите страницу немного позже."
      : "Фото или видео появится здесь после обработки."}</small>
  </div>;
}
