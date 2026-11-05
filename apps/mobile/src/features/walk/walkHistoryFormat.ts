import { walkDurationSeconds, type DogWalk } from "./walkModel";

export interface WalkHistoryRow {
  id: string;
  day: string;
  departedAt: string;
  returnedAt: string;
  duration: string;
  steps: number;
}

export function formatWalkLength(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours) return `${hours} ч ${mins} мин`;
  if (mins) return `${mins} мин${secs ? ` ${secs} сек` : ""}`;
  return `${secs} сек`;
}

export function toWalkHistoryRows(walks: DogWalk[]): WalkHistoryRow[] {
  return walks
    .filter((walk) => walk.finishedAtMs !== null)
    .sort((a, b) => b.startedAtMs - a.startedAtMs)
    .map((walk) => {
      const from = new Date(walk.startedAtMs);
      const to = new Date(walk.finishedAtMs!);
      return {
        id: walk.clientId ?? String(walk.startedAtMs),
        day: from.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }),
        departedAt: from.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
        returnedAt: to.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
        duration: formatWalkLength(walkDurationSeconds(walk, walk.finishedAtMs!)),
        steps: walk.steps,
      };
    });
}
