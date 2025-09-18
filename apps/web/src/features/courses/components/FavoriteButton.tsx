"use client";

import TurnedInIcon from "@mui/icons-material/TurnedIn";
import { useOfflineStore } from "@shared/stores/offlineStore";
import { useFavoritesStore } from "@shared/stores/favoritesStore";
import { useState, useTransition, useEffect } from "react";

import type { FavoriteButtonProps } from "@gafus/types";

export const FavoriteButton = ({ id, isFavorite = false, onUnfavorite }: FavoriteButtonProps) => {
  const [favorite, setFavorite] = useState(isFavorite);
  const [error, setError] = useState<Error | null>(null);
  const [isPending, startTransition] = useTransition();
  const { isOnline } = useOfflineStore();
  const { isFavorite: favIsFavorite, addFavorite, removeFavorite } = useFavoritesStore();
  const { syncQueue } = useOfflineStore();

  useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  // Синхронизируем локальное состояние с store
  useEffect(() => {
    const storeValue = favIsFavorite(id);
    setFavorite(storeValue);
  }, [favIsFavorite, id]);

  const handleToggleFavorite = async () => {
    startTransition(() => {
      (async () => {
        try {
          const current = favIsFavorite(id);
          const updatedState = !current;
          if (updatedState) {
            await addFavorite(id);
          } else {
            await removeFavorite(id);
          }

          // Обновляем локальное состояние
          setFavorite(updatedState);

          // Если удалили из избранного, вызываем callback
          if (!updatedState && onUnfavorite) {
            onUnfavorite(id);
          }

          // Глобальное событие автоматически отправится через store
        } catch (error) {
          setError(error instanceof Error ? error : new Error("Unknown error"));
        }
      })();
    });
  };

  // Проверяем, есть ли ожидающие синхронизации действия для этого курса
  const pendingSync = syncQueue.some(action => 
    action.type === "favorite-toggle" && 
    (action.data as { courseId: string }).courseId === id
  );

  return (
    <>
      <button
        onClick={handleToggleFavorite}
        disabled={isPending}
        style={{
          backgroundColor: "unset",
          border: "none",
          position: "absolute",
          top: "-4%",
          left: "82%",
          
        }}
        title={
          !isOnline 
            ? "Офлайн режим - изменения будут синхронизированы при восстановлении сети"
            : pendingSync
            ? "Ожидает синхронизации с сервером"
            : "Добавить в избранное"
        }
      >
        <TurnedInIcon style={{ 
          fontSize: "2.5rem",
          stroke: favorite ? "none" : "#636128",
          strokeWidth: "1px",
          fill: favorite ? "gold" : "transparent",
          opacity: pendingSync ? 0.7 : 1
        }} />
        {pendingSync && (
          <div style={{
            position: "absolute",
            top: "-2px",
            right: "-2px",
            width: "8px",
            height: "8px",
            backgroundColor: "#ffa500",
            borderRadius: "50%",
            border: "1px solid white"
          }} />
        )}
      </button>
      {error && <p style={{ color: "red" }}>Ошибка: {error.message}</p>}
    </>
  );
};
