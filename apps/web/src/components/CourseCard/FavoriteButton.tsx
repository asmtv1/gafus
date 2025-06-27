"use client";

import { useState, useTransition, useEffect } from "react";
import TurnedInIcon from "@mui/icons-material/TurnedIn";
import { toggleFavoriteCourse } from "@/lib/course/addtoFavorite";

type FavoriteButtonProps = {
  id: number;
  isFavorite?: boolean;
  onUnfavorite?: () => void;
};

export const FavoriteButton: React.FC<FavoriteButtonProps> = ({
  id,
  isFavorite = false,
  onUnfavorite,
}) => {
  const [favorite, setFavorite] = useState(isFavorite);
  const [error, setError] = useState<Error | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  const handleToggleFavorite = async () => {
    startTransition(() => {
      (async () => {
        try {
          const updatedState = await toggleFavoriteCourse(id);
          setFavorite(updatedState);

          if (!updatedState && onUnfavorite) {
            onUnfavorite();
          }
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
        style={{ backgroundColor: "white", border: "none" }}
        title="Добавить в избранное"
      >
        <TurnedInIcon style={{ color: favorite ? "gold" : "gray" }} />
      </button>
      {error && <p style={{ color: "red" }}>Ошибка: {error.message}</p>}
    </>
  );
};
