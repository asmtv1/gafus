import { Loading } from "../../shared/ui";
import { useRef, useState, type FormEvent } from "react";
import "./TrainingNextMainGeometry.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../shared/api/client";
import { RouteLink } from "../../shared/router/location";
import {
  createCourseReview, updateOwnCourseReview, deleteOwnCourseReview,
  projectCourseReviews, type CourseReview, type CourseReviews,
} from "./courseReviewsApi";
import {PrimaryButton,SecondaryButton} from "../../shared/ui";

export type ReviewsSourceLoader = (courseType: string) => Promise<unknown>;
const PAGE_SIZE = 5;

/** Completed learner review authoring on the existing protected course route.
 * Only a verified fresh GET with ownReviewId confirms successful creation. */
export function CourseReviewsPanel({
  userId,
  courseType,
  loadReviews,
}: {
  userId: string;
  courseType: string;
  loadReviews: ReviewsSourceLoader;
}) {
  const [page, setPage] = useState(1);
  const [chosenRating, setChosenRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [requiresCheck, setRequiresCheck] = useState(false);
  const flight = useRef(false);
  const cache = useQueryClient();
  const reviewKey = ["training", "reviews", userId, courseType];
  const query = useQuery<CourseReviews>({
    queryKey: reviewKey,
    queryFn: async () => projectCourseReviews(await loadReviews(courseType), userId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const write = useMutation({
    mutationFn: async (input: { rating: number; comment: string }) => {
      await createCourseReview(courseType, input.rating, input.comment);
      // Hono's success ACK has no review ID; only a verified GET proves ownership.
      const fresh = projectCourseReviews(await loadReviews(courseType), userId);
      if (!fresh.ownReviewId) throw new Error("REVIEW_NOT_CONFIRMED");
      return fresh;
    },
    onSuccess: async (fresh) => {
      await cache.cancelQueries({ queryKey: reviewKey });
      cache.setQueryData(reviewKey, fresh);
      setRequiresCheck(false);
      setChosenRating(null);
      setComment("");
    },
    onError: () => setRequiresCheck(true),
  });
  const ready = query.isSuccess && !query.isFetching;
  const data = ready ? query.data : null;
  const totalPages = data ? Math.max(1, Math.ceil(data.reviews.length / PAGE_SIZE)) : 1;
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = data?.reviews.slice(start, start + PAGE_SIZE) ?? [];
  const unauthenticated = query.error instanceof ApiError && query.error.status === 401;
  const forbidden = query.error instanceof ApiError && query.error.status === 403;
  const canWrite = !!data?.hasCompleted && data.ownReviewId === null;
  const ownReview = data?.reviews.find((item) => item.id === data.ownReviewId) ?? null;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !canWrite || requiresCheck || flight.current ||
      write.isPending || chosenRating === null || comment.length > 10000) return;
    flight.current = true;
    void write.mutateAsync({ rating: chosenRating, comment })
      .catch(() => undefined)
      .finally(() => { flight.current = false; });
  }
  async function checkReview() {
    if (flight.current || write.isPending || query.isFetching) return;
    const fresh = await query.refetch();
    if (fresh.isSuccess) {
      setRequiresCheck(false);
      write.reset();
    }
  }
  return (
    <section className="course-reviews-panel" aria-label="Отзывы о курсе">
      <header>
        <h1 className="training-next-reviews-title">Отзывы к курсу{data
          ? ` "${data.courseName}"` : ""}</h1>
      </header>
      {(query.isPending || query.isFetching) && <Loading message="Загружаем отзывы…" />}
      {query.isError && (
        <div role="alert">
          <p>
            {unauthenticated
              ? "Сессия завершена. Войдите снова."
              : forbidden
                ? "Нет доступа к отзывам этого курса."
                : "Не удалось загрузить отзывы."}
          </p>
          {unauthenticated ? (
            <RouteLink to="/login">Войти</RouteLink>
          ) : (
            !forbidden && (
              <PrimaryButton type="button" onClick={() => void query.refetch()}>
                Повторить
              </PrimaryButton>
            )
          )}
        </div>
      )}
      {data && (
        <>
          {!data.reviews.length && <div role="status" className="training-next-reviews-empty">
            <p>Пока нет отзывов</p>
          </div>}
          {data.reviews.length > 0 && (
            <>
              <ul className="course-reviews-list">
                {visible.map((review) => (
                  <li key={review.id} className="course-review-card">
                    <div className="course-review-head">
                      <strong>{review.user.username}</strong>
                      <time dateTime={review.createdAt}>
                        {new Date(review.createdAt).toLocaleDateString("ru-RU")}
                      </time>
                    </div>
                    <p
                      className="course-review-rating"
                      aria-label={
                        review.rating === null
                          ? "Оценка не указана"
                          : `Оценка ${review.rating} из 5`
                      }
                    >
                      {review.rating === null
                        ? "Без оценки"
                        : "♥".repeat(review.rating) + "♡".repeat(5 - review.rating)}
                    </p>
                    {review.comment && <p>{review.comment}</p>}
                    {review.id === data.ownReviewId && <p className="note">Ваш отзыв</p>}
                  </li>
                ))}
              </ul>
              {totalPages > 1 && (
                <nav className="course-review-pagination" aria-label="Страницы отзывов">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    Назад
                  </button>
                  <span>
                    Страница {currentPage} из {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  >
                    Далее
                  </button>
                </nav>
              )}
            </>
          )}
          {ownReview && (
            <OwnCourseReviewControls
              key={JSON.stringify([userId, courseType, ownReview.id])}
              userId={userId} courseType={courseType} review={ownReview}
              loadReviews={loadReviews}
            />
          )}
          {canWrite && (
            <form className="course-review-create-form" onSubmit={submit}>
              <h3>Оставить отзыв</h3>
              <fieldset disabled={write.isPending || requiresCheck}>
                <legend>Оценка курса</legend>
                {[1, 2, 3, 4, 5].map((value) => (
                  <button key={value} type="button" aria-pressed={chosenRating === value}
                    onClick={() => setChosenRating(value)}>{value}</button>
                ))}
              </fieldset>
              <label htmlFor={"review-comment-" + courseType}>Комментарий (необязательно)</label>
              <textarea id={"review-comment-" + courseType} value={comment}
                rows={3} maxLength={10000}
                disabled={write.isPending || requiresCheck}
                onChange={(event) => setComment(event.target.value)} />
              <PrimaryButton type="submit" disabled={write.isPending || requiresCheck ||
                chosenRating === null || !ready}>
                {write.isPending ? "Отправляем отзыв…" : "Отправить отзыв"}
              </PrimaryButton>
              {requiresCheck && (
                <div role="alert">
                  <p>Не удалось подтвердить отзыв. Проверьте состояние
                    перед повторной отправкой.</p>
                  <PrimaryButton type="button" onClick={() => void checkReview()}
                    disabled={write.isPending || query.isFetching}>
                    Проверить отзыв
                  </PrimaryButton>
                </div>
              )}
            </form>
          )}
        </>
      )}
    </section>
  );
}

type OwnReviewChange =
  | { kind: "edit"; rating: number; comment: string }
  | { kind: "delete" };

/** Own review is projected from current strictly authenticated GET, not from props trust. */
function OwnCourseReviewControls({ userId, courseType, review, loadReviews }: {
  userId: string; courseType: string; review: CourseReview;
  loadReviews: ReviewsSourceLoader;
}) {
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState<number | null>(review.rating);
  const [comment, setComment] = useState(review.comment ?? "");
  const [needsCheck, setNeedsCheck] = useState(false);
  const [checking, setChecking] = useState(false);
  const [failedKind, setFailedKind] = useState<OwnReviewChange["kind"]>("edit");
  const flight = useRef(false);
  const cache = useQueryClient();
  const key = ["training", "reviews", userId, courseType];
  const read = async () => projectCourseReviews(await loadReviews(courseType), userId);
  async function applyRead(fresh: CourseReviews) {
    await cache.cancelQueries({ queryKey: key });
    cache.setQueryData(key, fresh);
  }
  const mutation = useMutation({
    mutationFn: async (change: OwnReviewChange) => {
      if (change.kind === "edit") {
        await updateOwnCourseReview(review.id, change.rating, change.comment);
      } else {
        await deleteOwnCourseReview(review.id);
      }
      const fresh = await read();
      const mine = fresh.reviews.find((item) => item.id === review.id);
      if (change.kind === "edit" &&
        (fresh.ownReviewId !== review.id || mine?.rating !== change.rating ||
          (mine.comment ?? "") !== change.comment.trim())) {
        throw new Error("REVIEW_EDIT_NOT_CONFIRMED");
      }
      if (change.kind === "delete" &&
        (fresh.ownReviewId !== null || mine !== undefined)) {
        throw new Error("REVIEW_DELETE_NOT_CONFIRMED");
      }
      return fresh;
    },
    onSuccess: async (fresh) => {
      await applyRead(fresh);
      setEditing(false);
      setNeedsCheck(false);
    },
    onError: () => setNeedsCheck(true),
  });
  const busy = mutation.isPending || checking;
  function dispatch(change: OwnReviewChange) {
    if (flight.current || busy || needsCheck) return;
    flight.current = true;
    setFailedKind(change.kind);
    void mutation.mutateAsync(change).catch(() => undefined).finally(() => {
      flight.current = false;
    });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || rating === null || !Number.isInteger(rating) ||
      rating < 1 || rating > 5 || comment.length > 10000) return;
    dispatch({ kind: "edit", rating, comment });
  }
  function remove() {
    if (flight.current || busy || needsCheck) return;
    // Acquiring before confirmation also blocks two clicks in one React turn.
    flight.current = true;
    if (!window.confirm("Удалить свой отзыв? Это действие нельзя отменить.")) {
      flight.current = false;
      return;
    }
    setFailedKind("delete");
    void mutation.mutateAsync({ kind: "delete" }).catch(() => undefined).finally(() => {
      flight.current = false;
    });
  }
  async function check() {
    if (flight.current || busy) return;
    setChecking(true);
    try {
      const fresh = await read();
      await applyRead(fresh);
      const latest = fresh.reviews.find((item) => item.id === review.id);
      if (!latest || (failedKind === "edit" &&
        latest.rating === rating && (latest.comment ?? "") === comment.trim())) {
        setEditing(false);
      }
      setNeedsCheck(false);
      mutation.reset();
    } catch {
      setNeedsCheck(true);
    } finally {
      setChecking(false);
    }
  }
  return <section className="course-review-own-controls" aria-label="Управление моим отзывом">
    {!editing && <button type="button" disabled={busy || needsCheck}
      onClick={() => { setRating(review.rating); setComment(review.comment ?? "");
        setEditing(true); }}>
      Редактировать отзыв
    </button>}
    {editing && <form className="course-review-edit-form" onSubmit={submit}>
      <fieldset disabled={busy || needsCheck}>
        <legend>Моя оценка курса</legend>
        {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button"
          aria-pressed={rating === value} onClick={() => setRating(value)}>{value}</button>)}
      </fieldset>
      <label htmlFor={"review-edit-comment-" + review.id}>Мой комментарий</label>
      <textarea id={"review-edit-comment-" + review.id} rows={3}
        maxLength={10000} value={comment} disabled={busy || needsCheck}
        onChange={(event) => setComment(event.target.value)} />
      <PrimaryButton type="submit" disabled={busy || needsCheck || rating === null}>
        {mutation.isPending ? "Сохраняем…" : "Сохранить отзыв"}
      </PrimaryButton>
      <SecondaryButton variant="red" type="button" disabled={busy || needsCheck} onClick={() => {
        setEditing(false); setRating(review.rating); setComment(review.comment ?? "");
      }}>Отмена</SecondaryButton>
    </form>}
    <SecondaryButton variant="red" type="button" disabled={busy || needsCheck} onClick={remove}>Удалить отзыв</SecondaryButton>
    {needsCheck && <div role="alert">
      <p>{failedKind === "edit" ? "Не удалось подтвердить изменение отзыва." :
        "Не удалось подтвердить удаление отзыва."}</p>
      <PrimaryButton type="button" disabled={busy} onClick={() => void check()}>
        Проверить изменения отзыва
      </PrimaryButton>
    </div>}
  </section>;
}
