import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { QUESTION_REPORT_REASONS } from "@gafus/types";
import { reportQuestion } from "./questionApi";
import {PrimaryButton, SecondaryButton} from "../../shared/ui";

/** Content complaints go to Core; no moderation rights are granted in Web. */
type QuestionReportProps = { questionId: string; answerId?: string; compact?: boolean };

// A complaint's pending/ACK state belongs to one precise target, never to a
// different question or answer after parent props change.
export function QuestionReport(props: QuestionReportProps) {
  const target = props.answerId === undefined ? "question" : `answer/${props.answerId}`;
  return <QuestionReportTarget key={`${props.questionId}/${target}`} {...props} />;
}

function QuestionReportTarget({ questionId, answerId, compact = false }: QuestionReportProps) {
  // A target may occur in more than one view: never derive DOM IDs from its ID.
  const id = useId();
  const formId = `${id}-report-form`;
  const reasonId = `${id}-report-reason`;
  const detailsId = `${id}-report-details`;
  const errorId = `${id}-report-error`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLSelectElement>(null);
  const confirmationRef = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof QUESTION_REPORT_REASONS)[number]>(
    QUESTION_REPORT_REASONS[0],
  );
  const [details, setDetails] = useState("");
  const submitting = useRef(false);
  const mutation = useMutation({
    mutationFn: reportQuestion,
    onSuccess: () => setOpen(false),
  });

  // Focus only on this instance's own state transition, never after retirement.
  useEffect(() => {
    if (open && !mutation.isSuccess) reasonRef.current?.focus();
  }, [open, mutation.isSuccess]);
  useEffect(() => {
    if (mutation.isSuccess) confirmationRef.current?.focus();
  }, [mutation.isSuccess]);

  const close = () => {
    if (submitting.current || mutation.isPending) return;
    setOpen(false);
    mutation.reset();
    triggerRef.current?.focus();
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Synchronous guard: two submit events can arrive before pending renders.
    if (submitting.current || mutation.isPending) return;
    submitting.current = true;
    // Keep mutation.isError and form fields intact; never auto-replay reports.
    void mutation.mutateAsync({ questionId, answerId, reason, details })
      .catch(() => undefined)
      .finally(() => {
        submitting.current = false;
      });
  };
  return (
    <div className="question-report">
      {!mutation.isSuccess && (
        <button type="button" ref={triggerRef}
          aria-expanded={open} aria-controls={formId}
          aria-label={answerId ? "Пожаловаться на ответ" : "Пожаловаться на вопрос"}
          title={compact ? "Пожаловаться" : undefined}
          className={compact ? "web4-question-report-icon" : undefined}
          disabled={mutation.isPending}
          onClick={() => {
            if (submitting.current || mutation.isPending) return;
            if (open) close();
            else { mutation.reset(); setOpen(true); }
          }}>
          {compact ? <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M5 21V4m0 1c4-3 7 3 11 0l3-1v12l-3 1c-4 3-7-3-11 0"/>
          </svg> : answerId ? "Пожаловаться на ответ" : "Пожаловаться на вопрос"}
        </button>
      )}
      {open && !mutation.isSuccess && (
        <form id={formId} aria-label={answerId ? "Жалоба на ответ" : "Жалоба на вопрос"}
          onSubmit={submit}>
          <label htmlFor={reasonId}>Причина жалобы</label>
          <select ref={reasonRef} id={reasonId} value={reason}
            disabled={mutation.isPending}
            onChange={(event) =>
              setReason(event.target.value as (typeof QUESTION_REPORT_REASONS)[number])
            }>
            {QUESTION_REPORT_REASONS.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <label htmlFor={detailsId}>Комментарий (необязательно)</label>
          <textarea id={detailsId} value={details} maxLength={1000} rows={3}
            disabled={mutation.isPending} onChange={(event) => setDetails(event.target.value)} />
          <PrimaryButton type="submit" disabled={mutation.isPending}
            aria-describedby={mutation.isError ? errorId : undefined}>
            {mutation.isPending ? "Отправляем…" : "Отправить жалобу"}
          </PrimaryButton>
          <SecondaryButton variant="red" type="button" disabled={mutation.isPending} onClick={close}>
            Отмена
          </SecondaryButton>
          {mutation.isError && <p id={errorId} role="alert">Не удалось отправить жалобу.</p>}
        </form>
      )}
      {mutation.isSuccess && <p ref={confirmationRef} tabIndex={-1} role="status">
        Жалоба отправлена на рассмотрение.
      </p>}
    </div>
  );
}
