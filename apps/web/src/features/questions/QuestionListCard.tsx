import Link from "next/link";
import type { QuestionListItemDto } from "@gafus/types";
import { Author, BestLabel, Counts, Status } from "./parts";
import s from "./Questions.module.css";

/** Shared question preview for the discussion index and a user's own questions. */
export function QuestionListCard({ question }: { question: QuestionListItemDto }) {
  return (
    <Link href={`/questions/${question.id}`} className={`${s.card} ${s.questionCard}`}>
      <Status question={question} />
      <h2>{question.title}</h2>
      {question.bestAnswer && (
        <div className={s.bestPreview}>
          <BestLabel />
          <div>{question.bestAnswer.body}</div>
        </div>
      )}
      <div className={s.cardFooter}>
        <Author author={question.author} date={question.createdAt} />
        <Counts question={question} />
      </div>
    </Link>
  );
}
