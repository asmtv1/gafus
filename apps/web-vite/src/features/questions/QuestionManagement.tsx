import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { setQuestionBestAnswer, setQuestionClosed } from "./questionApi";
import { PrimaryButton, SecondaryButton } from "../../shared/ui";

function useQuestionRefetch(userId: string, questionId: string) {
  const cache = useQueryClient();
  return async () => {
    // Core is the only source of true/false for closure and best-answer flags.
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["questions", "detail", userId, questionId] }),
      cache.invalidateQueries({ queryKey: ["questions", "catalog", userId] }),
    ]);
  };
}

type CloseProps = { userId: string; questionId: string; closed: boolean };

export function QuestionCloseButton(props: CloseProps) {
  return <QuestionCloseTarget
    key={JSON.stringify([props.userId, props.questionId])} {...props} />;
}

function QuestionCloseTarget({ userId, questionId, closed }: CloseProps) {
  const flight = useRef(false);
  const refetch = useQuestionRefetch(userId, questionId);
  const mutation = useMutation({
    mutationFn: () => setQuestionClosed(questionId, !closed),
    onSuccess: refetch,
  });
  const submit = () => {
    if (flight.current || mutation.isPending) return;
    flight.current = true;
    void mutation.mutateAsync().catch(() => undefined).finally(() => {
      flight.current = false;
    });
  };
  return <div>
    <SecondaryButton type="button" className="web4-question-close-trigger"
      disabled={mutation.isPending} onClick={submit}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"
        className="web4-question-button-icon">
        {closed ? <path d="M6 9V5a6 6 0 0 1 12 0v4M5 9h14v12H5z"/> :
          <><rect x="5" y="10" width="14" height="11" rx="2"/>
            <path d="M8 10V7a4 4 0 0 1 8 0v3"/></>}
      </svg>
      {mutation.isPending
        ? "Сохраняем…"
        : closed ? "Открыть обсуждение" : "Закрыть обсуждение"}
    </SecondaryButton>
    {mutation.isError && <p role="alert">Не удалось изменить состояние обсуждения.</p>}
  </div>;
}

type BestProps = { userId: string; questionId: string; answerId: string; isBest: boolean };

export function BestAnswerButton(props: BestProps) {
  return <BestAnswerTarget key={JSON.stringify([
    props.userId, props.questionId, props.answerId,
  ])} {...props} />;
}

function BestAnswerTarget({ userId, questionId, answerId, isBest }: BestProps) {
  const flight = useRef(false);
  const refetch = useQuestionRefetch(userId, questionId);
  const mutation = useMutation({
    mutationFn: () => setQuestionBestAnswer(questionId, isBest ? null : answerId),
    onSuccess: refetch,
  });
  const submit = () => {
    if (flight.current || mutation.isPending) return;
    flight.current = true;
    void mutation.mutateAsync().catch(() => undefined).finally(() => {
      flight.current = false;
    });
  };
  return <div>
    <PrimaryButton type="button" disabled={mutation.isPending}
      onClick={submit}>
      {mutation.isPending
        ? "Сохраняем…"
        : isBest ? "Снять отметку лучшего ответа" : "Выбрать лучший ответ"}
    </PrimaryButton>
    {mutation.isError && <p role="alert">Не удалось изменить лучший ответ.</p>}
  </div>;
}
