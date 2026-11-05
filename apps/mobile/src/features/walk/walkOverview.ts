import { estimatedWalkMeters, walkDurationSeconds, type DogWalk } from "./walkModel";

export interface WalkDaySummary {
  /** Local calendar day (including DST-safe midnight boundaries). */
  timestamp: number;
  label: string;
  seconds: number;
  isToday: boolean;
}

export interface WalkWeekOverview {
  days: WalkDaySummary[];
  count: number;
  seconds: number;
  steps: number;
  meters: number;
  /** Most recent completed walk, or null when the user has none. */
  latest: DogWalk | null;
}

/** A calendar-week summary; a walk is counted on the local day it began. */
export function getWalkWeekOverview(walks: DogWalk[], nowMs: number): WalkWeekOverview {
  const now = new Date(nowMs);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  const days: WalkDaySummary[] = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return {
      timestamp: day.getTime(),
      label: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][index]!,
      seconds: 0,
      isToday: day.getTime() === today.getTime(),
    };
  });

  let count = 0;
  let seconds = 0;
  let steps = 0;
  let latest: DogWalk | null = null;

  for (const walk of walks) {
    if (walk.finishedAtMs === null || !Number.isFinite(walk.startedAtMs)) continue;
    if (!latest || walk.finishedAtMs > latest.finishedAtMs!) latest = walk;
    if (walk.startedAtMs < monday.getTime() || walk.startedAtMs >= nextMonday.getTime()) continue;
    const duration = walkDurationSeconds(walk, walk.finishedAtMs);
    const dayIndex = (new Date(walk.startedAtMs).getDay() + 6) % 7;
    days[dayIndex]!.seconds += duration;
    seconds += duration;
    steps += walk.steps;
    count++;
  }

  return { days, count, seconds, steps, meters: estimatedWalkMeters(steps), latest };
}
