import { useEffect, useRef } from "react";
import { AnswerHeart } from "./AnswerHeart";
import { AnswerOwnerControls } from "./AnswerOwnerControls";
import { BestAnswerButton } from "./QuestionManagement";
import { QuestionReport } from "./QuestionReport";
import type { QuestionAnswerCard } from "./questionApi";

type Props = {
  userId: string;
  questionId: string;
  answer: QuestionAnswerCard;
  blocked: boolean;
  canReply: boolean;
  canManage: boolean;
  onReply: (answerId: string, authorName: string) => void;
};

/** Compact reply actions for root answers, preloaded children and fetched threads.
 * Permission checks stay in Core and the existing action components. */
export function AnswerActionBar({
  userId, questionId, answer, blocked, canReply, canManage, onReply,
}: Props) {
  const details = useRef<HTMLDetailsElement>(null);
  const alive = !answer.deleted && !answer.hidden;
  const editable = (answer.canEdit || answer.canDelete) && !blocked;
  const more = alive && !blocked;

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const element = details.current;
      if (!element?.open || element.contains(event.target as Node)) return;
      // Editing, confirmation and report forms stay visible until explicit
      // submission/cancel. Dismissing them by accident could lose draft text.
      if (element.querySelector("form, [aria-label='Подтверждение удаления ответа']")) return;
      element.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !details.current?.open) return;
      if (details.current.querySelector("form, [aria-label='Подтверждение удаления ответа']")) return;
      details.current.open = false;
      details.current.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  return (
    <div className="web4-answer-actions" aria-label="Действия с ответом">
      {alive && <AnswerHeart userId={userId} questionId={questionId} answer={answer} />}
      {alive && canReply && !blocked && (
        <button type="button" className="web4-answer-reply"
          aria-label="Ответить на комментарий"
          onClick={() => onReply(answer.id, answer.authorName)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.95L3 21l1.95-5.5a9 9 0 1 1 16.05-4Z" />
          </svg>
          Ответить
        </button>
      )}
      {more && (
        <details ref={details} className="web4-answer-more">
          <summary aria-label={`Ещё действия с ответом: ${answer.authorName}`} title="Ещё действия">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
          </summary>
          <div className="web4-answer-more-content">
            {canManage && <BestAnswerButton userId={userId}
              questionId={questionId} answerId={answer.id} isBest={answer.best} />}
            {editable && <AnswerOwnerControls userId={userId} questionId={questionId}
              answer={answer} />}
            <QuestionReport questionId={questionId} answerId={answer.id} />
          </div>
        </details>
      )}
    </div>
  );
}
