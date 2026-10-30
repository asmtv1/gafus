import { useState } from "react";
import type { QuestionCard } from "./questionApi";
import { questionPath, RouteLink } from "../../shared/router/location";
import original from "../../brand/LegacyQuestionsPage.module.css";

/** An expired/broken avatar must fall back to the original author initial,
 * rather than leaving a browser broken-image icon in the question footer. */
export function QuestionAuthorAvatar({ name, url }: { name: string; url: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (url && failedUrl !== url) {
    return <img className={original.avatar} src={url} alt="" loading="lazy"
      onError={() => setFailedUrl(url)}/>;
  }
  return <span className={original.avatar} aria-hidden="true">
    {name.trim().slice(0, 1).toLocaleUpperCase("ru-RU") || "?"}
  </span>;
}

/** Retained Next QuestionListCard structure and author/footer layout.
 * Published tags, view counts and avatar are derived from existing Hono DTO
 * fields; unapproved image schemes, private actor IDs, raw signed media keys,
 * moderation fields and answer bodies are not passed through the Web cache.
 */
export function NextQuestionPreview({question}: {question: QuestionCard}) {
  const status=question.status === "resolved" ? "Решён" :
    question.status === "answered" ? "Есть ответы" : "Ждёт ответа";
  const date = new Date(question.createdAt);
  const dateText = Number.isFinite(date.getTime()) ?
    date.toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric"}) : "";
  return <RouteLink to={questionPath(question.id)}
    className={`${original.card} ${original.questionCard} next-question-preview`}
    aria-label={`Вопрос: ${question.title}`}>
    <div className={original.tabs}>
      <span className={`${original.badge} ${question.status === "resolved" ?
        original.resolved : question.status === "answered" ? original.answered : ""}`}>
        {status}
      </span>
      {question.closed && <span className={`${original.badge} ${original.closed}`}>
        Обсуждение закрыто
      </span>}
      <span className={original.tag}>{question.category}</span>
      {question.tags.map(tag => <span className={original.tag} key={tag}>#{tag}</span>)}
    </div>
    <h2>{question.title}</h2>
    <div className={original.cardFooter}>
      <div className={original.author}>
        <QuestionAuthorAvatar name={question.authorName} url={question.authorAvatarUrl}/>
        <div><strong>{question.authorName}</strong>
          {dateText && <div className={original.meta}>{dateText}</div>}
        </div>
      </div>
      <span className={`${original.meta} ${original.tabs}`}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
          strokeLinejoin="round"><path d="M20 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 20l.9-4.5A8.5 8.5 0 1 1 20 11.5Z"/></svg>
        {question.answerCount} ответов
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
          strokeLinejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/>
          <circle cx="12" cy="12" r="2.5"/></svg>
        {question.viewCount}
      </span>
    </div>
  </RouteLink>;
}
