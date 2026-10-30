import type { ProfileQuestionCard } from "./profileQuestionsOwnerApi";
import { RouteLink, questionPath } from "../../shared/router/location";
import original from "../../brand/LegacyQuestionsPage.module.css";
import { QuestionAuthorAvatar } from "../questions/NextQuestionPreview";

const readableDate=(value:string)=>new Date(value).toLocaleDateString("ru-RU",{
  day:"numeric",month:"long",year:"numeric",
});
/** Exact retained Next QuestionListCard/Status/BestLabel/Author/Counts hierarchy.
 * Safe owner-only list projection; intentionally never exposes author ID,
 * raw moderation metadata, private IDs or unapproved signed media to the UI. */
export function ProfileQuestionListCard({question:q}:{question:ProfileQuestionCard}) {
  return <RouteLink to={questionPath(q.id)}
    className={`${original.card} ${original.questionCard} next-question-preview`}>
    <div className={original.tabs}>
      <span className={`${original.badge} ${q.status==="resolved"? original.resolved:
        q.status==="answered"?original.answered:""}`}>
        {q.status==="resolved"?"Решён":q.status==="answered"?"Есть ответы":"Ждёт ответа"}
      </span>
      {q.closed&&<span className={`${original.badge} ${original.closed}`}>
        Обсуждение закрыто</span>}
      <span className={original.tag}>{q.category}</span>
      {q.tags.map(tag=><span key={tag} className={original.tag}>#{tag}</span>)}
    </div>
    <h2>{q.title}</h2>
    {q.bestAnswer&&<div className={original.bestPreview}>
      <span className={`${original.badge} ${original.resolved}`}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
          fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-4 6-6-1.41-1.41L11 13.17l-2.59-2.58L7 12l4 4z"/></svg>
        Лучший ответ
      </span>
      <div>{q.bestAnswer.body}</div>
    </div>}
    <div className={original.cardFooter}>
      <div className={original.author}>
        <QuestionAuthorAvatar name={q.authorName} url={q.authorAvatarUrl}/>
        <div><strong>{q.authorName}</strong>
          <div className={original.meta}>{readableDate(q.createdAt)}</div>
        </div>
      </div>
      <span className={`${original.meta} ${original.tabs}`}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"
          fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/></svg>
        {q.answerCount} ответов
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"
          fill="currentColor"><path d="M12 6a9.77 9.77 0 0 0-9 6 9.77 9.77 0 0 0 18 0 9.77 9.77 0 0 0-9-6zm0 10a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>
        {q.viewCount}
      </span>
    </div>
  </RouteLink>;
}
