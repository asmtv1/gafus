import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { setQuestionAnswerHeart, type QuestionAnswerCard } from "./questionApi";

type AnswerHeartProps = {
  userId: string;
  questionId: string;
  answer: QuestionAnswerCard;
};

// A new owner/question/answer must not inherit another target's pending mutation.
export function AnswerHeart(props: AnswerHeartProps) {
  return (
    <AnswerHeartTarget
      key={JSON.stringify([props.userId, props.questionId, props.answer.id])}
      {...props}
    />
  );
}

function AnswerHeartTarget({ userId, questionId, answer }: AnswerHeartProps) {
  const cache = useQueryClient();
  const submitting = useRef(false);
  const mutation = useMutation({
    mutationFn: () => setQuestionAnswerHeart(answer.id, !answer.liked),
    onSuccess: async () => {
      await cache.invalidateQueries({
        queryKey: ["questions", "detail", userId, questionId],
      });
    },
  });
  const submit = () => {
    // A disabled DOM button alone cannot guard two clicks in one React turn.
    if (!answer.canHeart || submitting.current || mutation.isPending) return;
    submitting.current = true;
    // Preserve strict ACK/error rendering; only another user action may retry.
    void mutation.mutateAsync().catch(() => undefined).finally(() => {
      submitting.current = false;
    });
  };
  const unavailableHint = !answer.canHeart && answer.canEdit
    ? "Своему ответу нельзя поставить сердечко"
    : !answer.canHeart ? "Реакция недоступна" : undefined;
  return (
    <div className="answer-heart" title={unavailableHint}>
      <button
        type="button"
        aria-label={answer.liked ? "Убрать сердечко" : "Поставить сердечко"}
        aria-description={unavailableHint}
        aria-pressed={answer.liked}
        disabled={!answer.canHeart || mutation.isPending}
        onClick={submit}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.8Z" />
        </svg>
        <span>{answer.hearts}</span>
      </button>
      {mutation.isError && (
        <div role="alert">
          <p>Не удалось изменить сердечко.</p>
          <button
            type="button"
            className="button-secondary"
            onClick={() =>
              void cache.invalidateQueries({
                queryKey: ["questions", "detail", userId, questionId],
              })
            }
          >
            Обновить состояние сердечка
          </button>
        </div>
      )}
    </div>
  );
}
