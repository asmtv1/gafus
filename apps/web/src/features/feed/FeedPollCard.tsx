"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PrimaryButton, SecondaryButton } from "@/shared/components/ui";
import { feedApi } from "./api";
import { CdnImage } from "@/shared/components/media/CdnImage";
import styles from "./FeedPoll.module.css";

export function FeedPollCard({ postId }: { postId: string }) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cache = useQueryClient();
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "220px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const poll = useQuery({ queryKey: ["feed", "poll", postId],
    queryFn: () => feedApi.getPoll(postId), enabled: visible, staleTime: 20_000,
    retry: false, refetchOnWindowFocus: true });
  const value = poll.data;
  const toggle = (id: string) => {
    if (!value || value.closed || value.myOptionIds.length) return;
    setSelected(current => value.allowMultiple ?
      current.includes(id) ? current.filter(item => item !== id) : [...current, id] : [id]);
  };
  const vote = async () => {
    if (!selected.length || busy) return;
    setBusy(true); setError("");
    try {
      await feedApi.votePoll(postId, { optionIds: selected });
      setSelected([]);
      await cache.invalidateQueries({ queryKey: ["feed", "poll", postId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить голос");
      await cache.invalidateQueries({ queryKey: ["feed", "poll", postId] });
    } finally { setBusy(false); }
  };
  return <section ref={ref} className={styles.poll} aria-label="Опрос">
    {poll.isError ? <div className={styles.pollFooter}>
      <p role="alert" className={styles.subtle}>Не удалось загрузить опрос</p>
      <SecondaryButton onClick={() => void poll.refetch()}>Повторить</SecondaryButton>
    </div> : !value ? <p className={styles.subtle}>Загружаем опрос…</p> : <>
      <h3 className={styles.question}>{value.question}</h3>
      <p className={styles.subtle}>{value.isQuiz ? "Викторина" : "Опрос"} · {value.allowMultiple ? "Можно выбрать несколько вариантов" : "Выберите один вариант"}
        {value.isAnonymous ? " · Анонимно" : ""}</p>
      <div className={styles.answers} role="group" aria-label="Варианты ответа">
        {value.options.map(option => {
          const picked = selected.includes(option.id) || value.myOptionIds.includes(option.id);
          const percent = value.totalVotes && option.votes !== null ? Math.round(option.votes / value.totalVotes * 100) : 0;
          return <button type="button" key={option.id}
            className={`${styles.answer} ${picked ? styles.answerSelected : ""}`}
            aria-pressed={picked} disabled={busy || value.closed || value.myOptionIds.length > 0}
            onClick={() => toggle(option.id)}>
            <span aria-hidden="true">{picked ? "●" : "○"}</span>
            <span>{option.text}{option.isCorrect !== undefined ? option.isCorrect ? " ✓" : "" : ""}</span>
            {option.votes !== null && <span>{percent}%</span>}
            {option.imageUrl && option.imageMediaId && <CdnImage source={option.imageUrl}
              requestFallback={() => feedApi.requestMediaFallback(option.imageMediaId!, "thumb")}
              alt="" loading="lazy" className={styles.answerImage} />}
            {option.votes !== null && <span className={styles.bar}><span className={styles.fill} style={{ width: `${percent}%` }} /></span>}
          </button>;
        })}
      </div>
      <div className={styles.pollFooter}>
        <p className={styles.subtle}>{value.totalVotes === null ? "Результаты пока скрыты" : `${value.totalVotes} голосов`}
          {value.closed ? " · Завершён" : value.endDate ? ` · До ${new Date(value.endDate).toLocaleString("ru-RU")}` : ""}</p>
        {!value.closed && !value.myOptionIds.length &&
          <PrimaryButton disabled={busy || !selected.length} onClick={() => void vote()}>
            {busy ? "Отправляем…" : "Проголосовать"}
          </PrimaryButton>}
      </div>
      {value.explanation && <p className={styles.subtle}>{value.explanation}</p>}
      {error && <p role="alert" className={styles.hint}>{error}</p>}
    </>}
  </section>;
}
