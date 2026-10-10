"use client";
import { useQuery } from "@tanstack/react-query";
import { gafusApi } from "./api";

export function GafusPostProgress({ postId }: { postId: string }) {
  const query = useQuery({
    queryKey: ["gafus-reaction-progress", postId],
    queryFn: () => gafusApi.reactionProgress(postId),
    staleTime: 20_000,
    retry: false,
  });
  const progress = query.data;
  if (!progress) return null;
  const left = Math.max(0, progress.nextThreshold - progress.current);
  return <section aria-label="Прогресс награды за реакции"
    style={{ borderRadius: 14, border: "1px solid #e3dbba", background: "#fffaf0", padding: 14 }}>
    <strong style={{ fontSize: 14, color: "#566f40" }}>🐾 Гафусы за реакции</strong>
    <p style={{ fontSize: 13, color: "#66735a", margin: "7px 0" }}>
      {progress.current} реакций · до следующей награды ещё {left}
    </p>
    <progress
      aria-label="Прогресс до следующего Гафуса"
      value={progress.progress}
      max={1}
      style={{ width: "100%", accentColor: "#7b914c" }}
    />
  </section>;
}
