import { Loading } from "../../shared/ui";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../shared/api/client";
import {
  cancelMomentPollVote, changeMomentPollVote, closeMomentPoll, getMomentPoll,
  listMomentPollVoters, voteMomentPoll,
  type MomentPoll as PollResult, type MomentPollVotersPage,
} from "./momentsApi";
import { loadMomentPollImages } from "./momentPollImages";
import { SecondaryButton } from "../../shared/ui";
import { RouteLink, momentProfilePath } from "../../shared/router/location";

type MomentPollProps = { postId: string; userId: string };
type VoteIntent =
  | { kind: "first" | "change"; optionIds: string[] }
  | { kind: "cancel" };

// A different actor/post never inherits an earlier vote, edit draft or request.
export function MomentPoll(props: MomentPollProps) {
  return <MomentPollTarget key={JSON.stringify([props.userId, props.postId])} {...props} />;
}

/** Avatars are optional; a failed image falls back to the person's initial. */
function PollVoterAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const [broken, setBroken] = useState(false);
  const initial = name.trim().charAt(0).toLocaleUpperCase("ru-RU") || "Г";
  return <span className="moment-poll-voter-avatar" aria-hidden="true">
    {avatarUrl && !broken
      ? <img src={avatarUrl} alt="" loading="lazy" decoding="async"
          referrerPolicy="no-referrer" onError={() => setBroken(true)}/>
      : <span>{initial}</span>}
  </span>;
}

/** No shared Query cache for voter identities; every expand is a new protected GET. */
function PublicPollVoters({ postId, optionId, optionText }: {
  postId: string; optionId: string; optionText: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<MomentPollVotersPage["items"]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef(false);
  function load(next: string | null) {
    if (pending.current) return;
    pending.current = true;
    setError(false);
    setLoading(true);
    if (!next) { setExpanded(false); setItems([]); setCursor(null); }
    void listMomentPollVoters(postId, optionId, next).then(page => {
      setItems(current => next ? [...current, ...page.items] : page.items);
      setCursor(page.nextCursor);
      setExpanded(true);
    }).catch(() => {
      // A denied read must not accidentally render previously fetched names.
      setExpanded(false);
      setItems([]);
      setCursor(null);
      setError(true);
    }).finally(() => { pending.current = false; setLoading(false); });
  }
  return <div className="moment-poll-participants">
    <button className="moment-poll-participants-trigger" type="button"
      aria-expanded={expanded} disabled={loading} onClick={() => {
        if (expanded) { setExpanded(false); setItems([]); setCursor(null); }
        else load(null);
      }}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
        strokeLinejoin="round" aria-hidden="true">
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19v-1.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5V19M16 6.2a3 3 0 0 1 0 5.6M18 13.2c1.8.7 2.5 2.2 2.5 4.3V19" />
      </svg>
      <span>{expanded ? "Скрыть участников" : `Участники: ${optionText}`}
      </span>
      <span className="moment-poll-participants-chevron" aria-hidden="true">{expanded ? "⌃" : "›"}</span>
    </button>
    {loading && <Loading variant="compact" message="Загружаем участников…" />}
    {error && <p role="alert">Не удалось показать участников.</p>}
    {expanded && <div className="moment-poll-participants-list">
      <ul>{items.map(item => <li key={item.id}>
        <RouteLink to={momentProfilePath(item.username)} className="moment-poll-voter-link"
          aria-label={"Открыть профиль @" + item.username}>
          <PollVoterAvatar name={item.name} avatarUrl={item.avatarUrl}/>
          <span className="moment-poll-voter-identity">
            <strong>{item.name}</strong>
            <small>@{item.username}</small>
          </span>
          <span className="moment-poll-voter-arrow" aria-hidden="true">›</span>
        </RouteLink>
      </li>)}</ul>
      {cursor && <button type="button" disabled={loading}
        onClick={() => load(cursor)}>Показать ещё</button>}
    </div>}
  </div>;
}

function matches(actual: string[], expected: string[]) {
  return actual.length === expected.length && expected.every(id => actual.includes(id));
}

function MomentPollTarget({ postId, userId }: MomentPollProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [needsCheck, setNeedsCheck] = useState(false);
  const [denied, setDenied] = useState(false);
  const [failedIntent, setFailedIntent] = useState<VoteIntent["kind"] | null>(null);
  const submitting = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const questionNameId = useId();
  const pendingFocus = useRef<"option" | "edit" | null>(null);
  const [confirmedMessage, setConfirmedMessage] = useState<"change" | "cancel" | null>(null);
  const cache = useQueryClient();
  const key = ["moments", "poll", userId, postId];
  const poll = useQuery({
    queryKey: key,
    queryFn: () => getMomentPoll(postId),
    retry: false, staleTime: 0, gcTime: 0,
  });
  // Signed option images are intentionally NOT included in PollResult/Query cache.
  const [optionImages, setOptionImages] = useState<Record<string, string>>({});
  const [optionImageError, setOptionImageError] = useState(false);
  useEffect(() => {
    const images = poll.isSuccess && !poll.isFetching
      ? poll.data.options.filter(option => option.hasImage).map(option => option.id)
      : [];
    setOptionImages({});
    setOptionImageError(false);
    if (!images.length || !poll.data?.id) return;
    let cancelled = false;
    void loadMomentPollImages(postId, poll.data.id, images).then(result => {
      if (!cancelled) setOptionImages(result);
    }).catch(() => { if (!cancelled) setOptionImageError(true); });
    return () => { cancelled = true; };
  }, [poll.data, poll.isSuccess, poll.isFetching, postId]);
  const vote = useMutation({
    retry: false,
    mutationFn: async (intent: VoteIntent): Promise<PollResult> => {
      if (intent.kind === "first") return voteMomentPoll(postId, intent.optionIds);
      if (intent.kind === "change") {
        await changeMomentPollVote(postId, intent.optionIds);
      } else {
        await cancelMomentPollVote(postId);
      }
      // ACK is not proof the displayed state has changed; reconcile via an
      // independent strict GET before updating current UI/cache.
      const fresh = await getMomentPoll(postId);
      if (intent.kind === "change" && !matches(fresh.myOptionIds, intent.optionIds)) {
        throw new Error("Голос ещё не подтверждён чтением");
      }
      if (intent.kind === "cancel" && fresh.myOptionIds.length !== 0) {
        throw new Error("Отмена голоса ещё не подтверждена чтением");
      }
      return fresh;
    },
    onSuccess: async (fresh, intent) => {
      if (intent.kind === "first") {
        setSelected([]);
        await cache.invalidateQueries({ queryKey: key });
      } else {
        // The response is now the server's freshly verified state, never an
        // optimistic locally computed vote or result counter.
        await cache.cancelQueries({ queryKey: key });
        cache.setQueryData(key, fresh);
        setSelected([]);
        setEditing(false);
        setNeedsCheck(false);
        // Only strict server ACK + fresh matching GET may announce completion.
        setConfirmedMessage(intent.kind);
      }
    },
    onError: (error, intent) => {
      pendingFocus.current = null;
      setConfirmedMessage(null);
      setFailedIntent(intent.kind);
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        setDenied(true);
      } else if (intent.kind !== "first") {
        // Unknown committed status: block another PUT/DELETE until a manual GET.
        setNeedsCheck(true);
      }
    },
  });
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [closeProblem, setCloseProblem] = useState("");
  const closeFlight = useRef(false);
  const closePoll = useMutation({
    retry: false,
    mutationFn: () => closeMomentPoll(postId),
    onSuccess: async fresh => {
      await cache.cancelQueries({ queryKey: key });
      cache.setQueryData(key, fresh);
      setCloseConfirm(false);
      setCloseProblem("");
    },
    onError: () => {
      setCloseProblem("Не удалось подтвердить завершение. Проверьте состояние опроса.");
      setCloseConfirm(false);
      void cache.invalidateQueries({ queryKey: key });
    },
    onSettled: () => { closeFlight.current = false; },
  });
  const readDenied = poll.error instanceof ApiError &&
    (poll.error.status === 403 || poll.error.status === 404);
  // A failed or in-flight fresh authorization GET must never reveal prior
  // cached private selections, correct answers or hidden vote counts.
  const ready = poll.isSuccess && !poll.isFetching && !denied;
  const data = ready ? poll.data : undefined;
  const hasVoted = !!data?.myOptionIds.length;
  const ordinaryMutable = !!data && !data.isQuiz && !data.closed && hasVoted;
  const busy = vote.isPending || submitting.current;
  const disabled = !data || data.closed || (hasVoted && !editing) ||
    busy || needsCheck;
  const shownSelected = editing && !busy && !needsCheck
    ? selected : hasVoted ? data?.myOptionIds ?? [] : selected;

  // A focus request belongs only to keyboard focus already inside this poll.
  // Mouse/keyboard interactions elsewhere, even during a deferred GET, win.
  function requestOwnedFocus(target: "option" | "edit") {
    if (sectionRef.current?.contains(document.activeElement)) {
      pendingFocus.current = target;
    }
  }
  useEffect(() => {
    const target = pendingFocus.current;
    const section = sectionRef.current;
    if (!target || !section) return;
    if (denied || poll.isError || data?.closed || data?.isQuiz) {
      pendingFocus.current = null;
      return;
    }
    if (!data || busy || needsCheck) return;
    const focused = document.activeElement;
    if (focused !== document.body && !section.contains(focused)) {
      pendingFocus.current = null;
      return;
    }
    if (target === "edit") {
      if (editing || !ordinaryMutable) return;
      const trigger = editTriggerRef.current;
      if (!trigger || trigger.disabled) return;
      pendingFocus.current = null;
      trigger.focus();
      return;
    }
    // Use native radio/checkbox keyboard semantics, never simulate arrow keys.
    if (hasVoted && !editing) return;
    const inputs = Array.from(section.querySelectorAll<HTMLInputElement>("fieldset input"));
    const option = inputs.find(input => input.checked && !input.disabled) ??
      inputs.find(input => !input.disabled);
    if (!option) return;
    pendingFocus.current = null;
    option.focus();
  });

  const toggle = (id: string) => {
    if (disabled || !data) return;
    setSelected(current => data.allowMultiple
      ? current.includes(id) ? current.filter(value => value !== id) : [...current, id]
      : [id]);
  };
  function dispatch(intent: VoteIntent) {
    if (!data || data.closed || submitting.current || vote.isPending || needsCheck) return;
    if (intent.kind === "first" && hasVoted) return;
    if (intent.kind !== "first" && !ordinaryMutable) return;
    if (intent.kind !== "cancel" && (!intent.optionIds.length ||
      (intent.kind === "change" && matches(intent.optionIds, data.myOptionIds)))) return;
    if (intent.kind === "change") requestOwnedFocus("edit");
    if (intent.kind === "cancel") requestOwnedFocus("option");
    setConfirmedMessage(null);
    submitting.current = true;
    void vote.mutateAsync(intent).catch(() => undefined).finally(() => {
      submitting.current = false;
    });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !selected.length) return;
    dispatch({ kind: editing ? "change" : "first", optionIds: [...selected] });
  }
  function beginEdit() {
    if (!ordinaryMutable || busy || needsCheck || !data) return;
    requestOwnedFocus("option");
    setConfirmedMessage(null);
    setSelected([...data.myOptionIds]);
    setEditing(true);
    vote.reset();
  }
  function cancelEdit() {
    if (busy || needsCheck) return;
    requestOwnedFocus("edit");
    setSelected([]);
    setEditing(false);
    vote.reset();
  }
  async function checkCurrentVote() {
    if (busy || poll.isFetching) return;
    const result = await poll.refetch();
    if (result.isSuccess) {
      // Keep an uncommitted selection draft available for an explicit retry.
      if (!result.data.myOptionIds.length ||
        matches(result.data.myOptionIds, selected)) {
        setEditing(false);
        setSelected([]);
      }
      setNeedsCheck(false);
      setFailedIntent(null);
      // Reconciliation may discover a vote, but must not claim our PUT/DELETE succeeded.
      setConfirmedMessage(null);
      vote.reset();
    } else if (result.error instanceof ApiError &&
      (result.error.status === 403 || result.error.status === 404)) {
      setDenied(true);
    }
  }
  return <section ref={sectionRef} className="moment-poll" aria-label="Опрос"
    onBlurCapture={event => {
      if (event.relatedTarget instanceof Node &&
          !sectionRef.current?.contains(event.relatedTarget)) {
        pendingFocus.current = null;
      }
    }}>
    {poll.isPending && <Loading message="Загружаем опрос…" />}
    {poll.isFetching && poll.data && <Loading message="Проверяем доступ к опросу…" />}
    {denied && <p role="alert">Опрос недоступен.</p>}
    {!denied && poll.isError && <div role="alert">
      <p>{readDenied ? "Опрос недоступен." : "Не удалось загрузить опрос."}</p>
      {!readDenied && <button type="button" onClick={() => void poll.refetch()}>
        Повторить
      </button>}
    </div>}
    {data && <form onSubmit={submit} aria-labelledby={questionNameId}>
      <div className="moment-poll-heading">
        <p className="moment-poll-meta">
          <span className="moment-poll-type">{data.isQuiz ? "Викторина" : "Опрос"}</span>
          <span>{data.allowMultiple ? "Несколько ответов" : "Один ответ"}</span>
          {data.isAnonymous && <span>Анонимно</span>}
        </p>
        <h3 id={questionNameId} className="moment-poll-question">{data.question}</h3>
      </div>
      <fieldset disabled={disabled}>
        <legend>Варианты ответа на вопрос «{data.question}»</legend>
        {data.options.map(option => {
          const chosen = shownSelected.includes(option.id);
          const percent = data.totalVotes && option.votes !== null
            ? Math.round(option.votes / data.totalVotes * 100) : 0;
          return <label key={option.id} className="moment-poll-option">
            <input type={data.allowMultiple ? "checkbox" : "radio"}
              name={"poll-" + postId} value={option.id} checked={chosen}
              onChange={() => toggle(option.id)} />
            <span className="moment-poll-option-label">{option.text}
              {option.isCorrect === true &&
                <span className="moment-poll-correct" aria-label="Правильный ответ">✓</span>}
            </span>
            {optionImages[option.id] && <img
              src={optionImages[option.id]} alt={"Вариант: " + option.text}
              referrerPolicy="no-referrer" loading="lazy"
              className="moment-poll-option-image" />}
            {option.votes !== null && <small>{percent}%</small>}
            {option.votes !== null && <span className="web4-poll-vote-bar" aria-hidden="true">
              <span className="web4-poll-vote-bar-fill" style={{ width: `${percent}%` }} />
            </span>}
          </label>;
        })}
      </fieldset>
      {optionImageError && <p role="alert">Изображения вариантов недоступны.
        Голосование остаётся доступным по тексту.</p>}
      <p className="moment-poll-footnote">{data.totalVotes === null
        ? "Результаты скрыты до голосования или завершения опроса"
        : "Всего голосов: " + data.totalVotes}
        {data.closed ? " · Опрос завершён" : ""}
      </p>
      {!data.isAnonymous && data.totalVotes !== null &&
        data.options.filter(option => (option.votes ?? 0) > 0).map(option =>
          <PublicPollVoters key={option.id} postId={postId} optionId={option.id}
            optionText={option.text} />)}
      {data.canClose && !data.closed && <div className="moment-poll-owner-close">
        {!closeConfirm ? <button type="button"
          disabled={busy || closePoll.isPending || needsCheck}
          onClick={() => { setCloseProblem(""); setCloseConfirm(true); }}>
          Завершить опрос
        </button> : <>
          <p>После завершения голосовать будет нельзя. Открыть опрос снова нельзя.</p>
          <button type="button" disabled={busy || closePoll.isPending}
            onClick={() => {
              if (closeFlight.current || busy) return;
              closeFlight.current = true;
              void closePoll.mutateAsync().catch(() => undefined);
            }}>
            {closePoll.isPending ? "Завершаем…" : "Да, завершить"}
          </button>
          <SecondaryButton variant="red" type="button" disabled={closePoll.isPending}
            onClick={() => setCloseConfirm(false)}>Отмена</SecondaryButton>
        </>}
      </div>}
      {closeProblem && <p role="alert">{closeProblem}</p>}
      {data.explanation && <p>{data.explanation}</p>}
      {confirmedMessage && <p role="status" aria-live="polite">
        {confirmedMessage === "change" ? "Голос изменён." : "Голос отменён."}
      </p>}
      {!data.closed && !hasVoted &&
        <button type="submit" disabled={disabled || !selected.length}>
          {vote.isPending ? "Отправляем…" : "Проголосовать"}
        </button>}
      {ordinaryMutable && <>
        {!editing && <button ref={editTriggerRef} type="button"
          disabled={busy || needsCheck}
          onClick={beginEdit}>Изменить голос</button>}
        {editing && <>
          <button type="submit" disabled={disabled || !selected.length ||
            matches(selected, data.myOptionIds)}>
            {vote.isPending ? "Отправляем…" : "Сохранить выбор"}
          </button>
          <SecondaryButton variant="red" type="button" disabled={busy || needsCheck}
            onClick={cancelEdit}>Отменить изменения</SecondaryButton>
        </>}
        <SecondaryButton variant="red" type="button" disabled={busy || needsCheck}
          onClick={() => dispatch({ kind: "cancel" })}>Отменить голос</SecondaryButton>
      </>}
      {vote.isError && <p role="alert">{failedIntent === "cancel"
        ? "Не удалось подтвердить отмену голоса."
        : failedIntent === "change" ? "Не удалось подтвердить изменение голоса."
          : "Не удалось проголосовать."}</p>}
      {needsCheck && <button type="button" disabled={busy || poll.isFetching}
        onClick={() => void checkCurrentVote()}>Проверить состояние голоса</button>}
    </form>}
  </section>;
}
