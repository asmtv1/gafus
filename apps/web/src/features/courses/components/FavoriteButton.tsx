"use client";

import TurnedInIcon from "@mui/icons-material/TurnedIn";
import { toggleFavoriteCourse } from "@shared/lib/course/addtoFavorite";
import { useCourseStore } from "@shared/stores";
import { useState, useTransition, useEffect } from "react";

import type { FavoriteButtonProps } from "@gafus/types";

export const FavoriteButton = ({ id, isFavorite = false, onUnfavorite }: FavoriteButtonProps) => {
  const [favorite, setFavorite] = useState(isFavorite);
  const [error, setError] = useState<Error | null>(null);
  const [isPending, startTransition] = useTransition();
  const { addToFavorites, removeFromFavorites, isFavorite: storeIsFavorite } = useCourseStore();

  useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  // Синхронизируем локальное состояние с store
  useEffect(() => {
    const storeValue = storeIsFavorite(id);
    setFavorite(storeValue);
  }, [storeIsFavorite, id]);

  const handleToggleFavorite = async () => {
    startTransition(() => {
      (async () => {
        try {
          const updatedState = await toggleFavoriteCourse(id);

          // Мгновенно обновляем store
          if (updatedState) {
            addToFavorites(id);
          } else {
            removeFromFavorites(id);
            if (onUnfavorite) {
              onUnfavorite(id);
            }
          }

          // Обновляем локальное состояние
          setFavorite(updatedState);

          // Глобальное событие автоматически отправится через store
          // forceRefreshFavorites() больше не нужен здесь
        } catch (error) {
          setError(error instanceof Error ? error : new Error("Unknown error"));
        }
      })();
    });
  };

  return (
    <>
      <button
        onClick={handleToggleFavorite}
        disabled={isPending}
        style={{ backgroundColor: "unset", border: "none" }}
        title="Добавить в избранное"
      >
        <TurnedInIcon style={{ color: favorite ? "gold" : "gray" }} />
      </button>
      {error && <p style={{ color: "red" }}>Ошибка: {error.message}</p>}
    </>
  );
};
