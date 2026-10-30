import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { setCourseFavorite } from "./courseApi";

type FavoriteButtonProps = {
  userId: string;
  courseId: string;
  isFavorite: boolean;
};

// Retire the mutation observer when a card changes owner or course. A late
// ACK from its old instance must not disable or paint the new card.
export function FavoriteCourseButton(props: FavoriteButtonProps) {
  return (
    <FavoriteCourseButtonInstance
      key={JSON.stringify([props.userId, props.courseId])}
      {...props}
    />
  );
}

function FavoriteCourseButtonInstance({ userId, courseId, isFavorite }: FavoriteButtonProps) {
  const cache = useQueryClient();
  const flight = useRef(false);
  const mutation = useMutation({
    mutationFn: () => setCourseFavorite(courseId, !isFavorite),
    // Do not optimistically grant or revoke access. Read new state from Core.
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["courses", "catalog", userId] });
    },
  });
  const submit = () => {
    // React batches multiple clicks before disabled={isPending} can paint.
    if (flight.current) return;
    flight.current = true;
    // Unknown ACK/failure remains visible via mutation.isError. Never replay.
    void mutation.mutateAsync().catch(() => undefined).finally(() => {
      flight.current = false;
    });
  };
  return (
    <div className="course-favorite">
      <button
        type="button"
        disabled={mutation.isPending}
        aria-label={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
        aria-pressed={isFavorite}
        onClick={submit}
      >
        {mutation.isPending ? "Сохраняем…" : isFavorite ? "★ В избранном" : "☆ В избранное"}
      </button>
      {mutation.isError && (
        <div role="alert">
          <p>
            Не удалось подтвердить избранное. Проверьте актуальное состояние курсов перед новой
            попыткой.
          </p>
          <button
            type="button"
            className="button-secondary"
            onClick={() =>
              void cache.invalidateQueries({
                queryKey: ["courses", "catalog", userId],
              })
            }
          >
            Обновить список курсов
          </button>
        </div>
      )}
    </div>
  );
}
