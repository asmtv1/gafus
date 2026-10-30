import { Loading } from "../../shared/ui";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FeedPollDraft, validateFeedPollDraft } from
  "@gafus/types";
import { createTextDraftPoll, getExistingDraftPoll } from "./momentDraftPollApi";
import { SecondaryButton } from "../../shared/ui";

function initialPoll(): FeedPollDraft {
  return {
    question: "", options: [{ text: "", isCorrect: false }, { text: "", isCorrect: false }],
    allowMultiple: false, isQuiz: false, isAnonymous: false,
    hideResults: false, shuffleOptions: false,
    explanation: null, endDate: null,
  };
}

/** A creation-only poll editor: never replaces an existing server poll. */
type DraftPollProps = {
  postId: string;
  userId: string;
  version: number;
  onEditingChange: (editing: boolean) => void;
  /** Normal new draft may save poll before any text revision (v0). */
  allowInitialVersion?: boolean;
  onPollPresentChange?: (present: boolean) => void;
};

export function MomentDraftPoll(props: DraftPollProps) {
  // Version changes update the current CAS value without losing an unsaved draft.
  return <MomentDraftPollTarget key={JSON.stringify([
    props.userId, props.postId,
  ])} {...props} />;
}

function MomentDraftPollTarget({
  postId, userId, version, onEditingChange,
  allowInitialVersion = false, onPollPresentChange,
}: DraftPollProps) {
  const active = useRef(true);
  const writeFlight = useRef(false);
  const editingRef = useRef(false);
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;
  const presenceRef = useRef(onPollPresentChange);
  presenceRef.current = onPollPresentChange;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      // If a currently editing poll leaves the parent UI, release its publish gate.
      if (editingRef.current) onEditingChangeRef.current(false);
    };
  }, []);
  const [mustVerify, setMustVerify] = useState(false);
  const [editing, setEditing] = useState(false);
  editingRef.current = editing;
  const [poll, setPoll] = useState<FeedPollDraft>(initialPoll);
  const cache = useQueryClient();
  const existing = useQuery({
    queryKey: ["moments", "draft-poll", userId, postId],
    queryFn: () => getExistingDraftPoll(postId),
    staleTime: 0, gcTime: 0, retry: false,
  });
  const save = useMutation({
    mutationFn: () => createTextDraftPoll({
      postId, expectedVersion: version, poll, allowInitialVersion,
    }),
    onSuccess: async () => {
      if (active.current) {
        editingRef.current = false;
        setEditing(false);
        onEditingChangeRef.current(false);
      }
      await cache.invalidateQueries({
        queryKey: ["moments", "draft-poll", userId, postId],
      });
    },
    onError: async () => {
      // The PUT outcome is unknown; even a subsequent automatic GET 404 must
      // not silently authorize another creation attempt.
      if (active.current) setMustVerify(true);
      await cache.invalidateQueries({
        queryKey: ["moments", "draft-poll", userId, postId],
      });
    },
  });
  useEffect(() => {
    if (active.current && existing.isSuccess && !existing.isFetching) {
      presenceRef.current?.(existing.data !== null);
    }
  }, [existing.isSuccess, existing.isFetching, existing.data]);
  useEffect(() => {
    if (active.current && editing && existing.data) {
      editingRef.current = false;
      setEditing(false);
      onEditingChangeRef.current(false);
    }
  }, [editing, existing.data]);
  const versionReady = Number.isSafeInteger(version) &&
    version >= (allowInitialVersion ? 0 : 1);
  const knownAbsent = existing.isSuccess && !existing.isFetching &&
    existing.data === null;
  const canCreate = knownAbsent && !mustVerify && versionReady;
  const open = () => {
    if (!canCreate || save.isPending || writeFlight.current) return;
    editingRef.current = true;
    setEditing(true);
    onEditingChangeRef.current(true);
  };
  const close = () => {
    if (save.isPending || writeFlight.current) return;
    editingRef.current = false;
    setEditing(false);
    onEditingChangeRef.current(false);
    save.reset();
    setPoll(initialPoll());
  };
  const verifyAbsent = async () => {
    if (writeFlight.current || save.isPending || existing.isFetching) return;
    // Only an explicit successful GET 200/null releases an uncertain write.
    const result = await existing.refetch();
    if (!active.current) return;
    if (result.isSuccess && result.data === null) {
      setMustVerify(false);
      save.reset();
    }
    // A present poll closes the editor via the existing server-driven effect;
    // 401/403/5xx or other GET failures keep the original fields and block PUT.
  };
  const patch = <K extends keyof FeedPollDraft>(key: K, value: FeedPollDraft[K]) =>
    setPoll(current => ({ ...current, [key]: value }));
  const issue = validateFeedPollDraft(poll);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (issue || !editing || !canCreate || save.isPending || writeFlight.current) return;
    writeFlight.current = true;
    void save.mutateAsync().catch(() => undefined).finally(() => {
      writeFlight.current = false;
    });
  };
  return <section className="moment-draft-poll" aria-label="Опрос черновика">
    <h3>Опрос к публикации</h3>
    {existing.isPending && <Loading message="Проверяем опрос…" />}
    {existing.isError && <div role="alert">
      <p>Не удалось проверить существующий опрос.</p>
      <button type="button" onClick={() => void existing.refetch()}>Повторить</button>
    </div>}
    {existing.isSuccess && existing.data && <p>
      Опрос уже сохранён: {existing.data.question}. После публикации
      его изменить нельзя.
    </p>}
    {existing.isSuccess && !existing.data && !editing &&
      <button type="button" disabled={!canCreate} onClick={open}>Добавить опрос</button>}
    {mustVerify && <div role="status">
      <p>Исход сохранения неизвестен. Перед повтором нужно проверить опрос.</p>
      <button type="button" disabled={save.isPending || existing.isFetching}
        onClick={() => void verifyAbsent()}>Проверить наличие опроса</button>
    </div>}
    {editing && !existing.data && <form onSubmit={submit}>
      <label htmlFor="moment-poll-question">Вопрос опроса</label>
      <input id="moment-poll-question" value={poll.question} required
        maxLength={500} disabled={save.isPending}
        onChange={event => patch("question", event.target.value)} />
      {poll.options.map((option, index) => <div key={index}>
        <label htmlFor={"moment-poll-option-" + index}>Вариант {index + 1}</label>
        <input id={"moment-poll-option-" + index} required
          maxLength={200} disabled={save.isPending}
          value={option.text} onChange={event => setPoll(current => ({
            ...current, options: current.options.map((item, at) =>
              at === index ? { ...item, text: event.target.value } : item),
          }))} />
        {poll.isQuiz && <label>
          <input type={poll.allowMultiple ? "checkbox" : "radio"} name="poll-correct"
            disabled={save.isPending} checked={Boolean(option.isCorrect)}
            onChange={() => setPoll(current => ({
              ...current, options: current.options.map((item, at) => ({
                ...item, isCorrect: at === index
                  ? !item.isCorrect
                  : current.allowMultiple ? item.isCorrect : false,
              })),
            }))} />
          Правильный ответ
        </label>}
      </div>)}
      <button type="button" disabled={save.isPending || poll.options.length >= 10}
        onClick={() => patch("options", [...poll.options, { text: "", isCorrect: false }])}>
        Добавить вариант
      </button>
      {poll.options.length > 2 && <SecondaryButton variant="red" className="gafus-inline-red-action" type="button" disabled={save.isPending}
        onClick={() => patch("options", poll.options.slice(0, -1))}>
        Убрать последний вариант
      </SecondaryButton>}
      <label><input type="checkbox" checked={Boolean(poll.allowMultiple)}
        disabled={save.isPending}
        onChange={event => patch("allowMultiple", event.target.checked)} />
        Разрешить несколько ответов</label>
      <label><input type="checkbox" checked={Boolean(poll.isQuiz)}
        disabled={save.isPending} onChange={event => setPoll(current => ({
          ...current, isQuiz: event.target.checked,
          options: current.options.map(option => ({ ...option, isCorrect: false })),
        }))} />Викторина</label>
      <label><input type="checkbox" checked={Boolean(poll.isAnonymous)}
        disabled={save.isPending}
        onChange={event => patch("isAnonymous", event.target.checked)} />Анонимно</label>
      <label><input type="checkbox" checked={Boolean(poll.hideResults)}
        disabled={save.isPending}
        onChange={event => patch("hideResults", event.target.checked)} />
        Скрыть результаты до завершения</label>
      <label><input type="checkbox" checked={Boolean(poll.shuffleOptions)}
        disabled={save.isPending}
        onChange={event => patch("shuffleOptions", event.target.checked)} />
        Перемешать варианты</label>
      {issue && <p role="status">{issue}</p>}
      <button type="submit" disabled={save.isPending || Boolean(issue) || !canCreate}>
        {save.isPending ? "Сохраняем…" : "Сохранить опрос"}
      </button>
      <SecondaryButton variant="red" type="button" disabled={save.isPending} onClick={close}>
        Отмена
      </SecondaryButton>
      {save.isError && <p role="alert">
        Не удалось сохранить опрос. Повтор не создаст новый пост.
      </p>}
    </form>}
  </section>;
}
