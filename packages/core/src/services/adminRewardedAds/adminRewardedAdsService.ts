import { prisma } from "@gafus/prisma";
import { DateTime } from "luxon";

import type {
  RewardedAdsAdminDashboard,
  RewardedAdsDashboardPeriodDays,
  RewardedAdsDailyPoint,
  RewardedAdsFailureBreakdown,
  RewardedAdsPlatformBreakdown,
  RewardedAdsSummary,
  RewardedAdsTargetBreakdown,
  RewardedAdsTodayActivity,
} from "./types";

export const REWARDED_ADS_DASHBOARD_TIMEZONE = "Europe/Moscow" as const;
export const REWARDED_ADS_DASHBOARD_PERIODS = [7, 30, 90] as const;

type LifecycleEvent = {
  eventType: string;
  payload: unknown;
  createdAt: Date;
};

export type RewardedAdsSessionInput = {
  id: string;
  userId: string;
  platform: "ANDROID" | "IOS";
  targetType: string | null;
  targetId: string | null;
  createdAt: Date;
  rewardedAt: Date | null;
  grantedAt: Date | null;
  errorCode: string | null;
  events: LifecycleEvent[];
};

type DateRange = { start: Date; end: Date };

type SessionFact = {
  source: RewardedAdsSessionInput;
  created: boolean;
  loaded: boolean;
  shown: boolean;
  rewarded: boolean;
  granted: boolean;
  skipped: boolean;
  failed: boolean;
};

const EMPTY_SUMMARY: RewardedAdsSummary = {
  sessions: 0,
  uniqueUsers: 0,
  loaded: 0,
  shown: 0,
  rewarded: 0,
  granted: 0,
  skipped: 0,
  failed: 0,
  uniqueShownUsers: 0,
  uniqueRewardedUsers: 0,
  uniqueSkippedUsers: 0,
  loadRate: 0,
  showRate: 0,
  completionRate: 0,
  grantRate: 0,
  skipRate: 0,
  errorRate: 0,
};

function isInRange(value: Date | null, range: DateRange): boolean {
  return Boolean(value && value >= range.start && value < range.end);
}

function percent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function sessionToFact(session: RewardedAdsSessionInput, range?: DateRange): SessionFact {
  const events = range
    ? session.events.filter((event) => isInRange(event.createdAt, range))
    : session.events;
  const eventTypes = new Set(events.map((event) => event.eventType));
  const everRewarded =
    Boolean(session.rewardedAt) || session.events.some((event) => event.eventType === "REWARDED");
  const created = range ? isInRange(session.createdAt, range) : true;
  const granted = range ? isInRange(session.grantedAt, range) : Boolean(session.grantedAt);
  const rewarded = range
    ? isInRange(session.rewardedAt, range) || eventTypes.has("REWARDED")
    : everRewarded || granted;
  const shown = range ? eventTypes.has("SHOWN") : eventTypes.has("SHOWN") || rewarded || granted;
  const loaded = range
    ? eventTypes.has("LOADED")
    : eventTypes.has("LOADED") || shown || rewarded || granted;
  const dismissed = eventTypes.has("DISMISSED");

  return {
    source: session,
    created,
    loaded,
    shown,
    rewarded,
    granted,
    skipped: shown && dismissed && !everRewarded && !granted,
    failed: eventTypes.has("FAILED"),
  };
}

function factsToSummary(facts: SessionFact[]): RewardedAdsSummary {
  if (facts.length === 0) return { ...EMPTY_SUMMARY };

  const sessions = facts.filter((fact) => fact.created).length;
  const loaded = facts.filter((fact) => fact.loaded).length;
  const shown = facts.filter((fact) => fact.shown).length;
  const rewarded = facts.filter((fact) => fact.rewarded).length;
  const granted = facts.filter((fact) => fact.granted).length;
  const skipped = facts.filter((fact) => fact.skipped).length;
  const failed = facts.filter((fact) => fact.failed).length;
  const distinctUsers = (predicate: (fact: SessionFact) => boolean) =>
    new Set(facts.filter(predicate).map((fact) => fact.source.userId)).size;

  return {
    sessions,
    uniqueUsers: distinctUsers((fact) => fact.created),
    loaded,
    shown,
    rewarded,
    granted,
    skipped,
    failed,
    uniqueShownUsers: distinctUsers((fact) => fact.shown),
    uniqueRewardedUsers: distinctUsers((fact) => fact.rewarded),
    uniqueSkippedUsers: distinctUsers((fact) => fact.skipped),
    loadRate: percent(loaded, sessions),
    showRate: percent(shown, loaded),
    completionRate: percent(rewarded, shown),
    grantRate: percent(granted, rewarded),
    skipRate: percent(skipped, shown),
    errorRate: percent(failed, sessions),
  };
}

export function summarizeRewardedAdsSessions(
  sessions: RewardedAdsSessionInput[],
  range?: DateRange,
): RewardedAdsSummary {
  return factsToSummary(sessions.map((session) => sessionToFact(session, range)));
}

function factsToTodayActivity(facts: SessionFact[]): RewardedAdsTodayActivity {
  const distinctUsers = (predicate: (fact: SessionFact) => boolean) =>
    new Set(facts.filter(predicate).map((fact) => fact.source.userId)).size;

  return {
    sessionsStarted: facts.filter((fact) => fact.created).length,
    uniqueUsersStarted: distinctUsers((fact) => fact.created),
    loaded: facts.filter((fact) => fact.loaded).length,
    shown: facts.filter((fact) => fact.shown).length,
    rewarded: facts.filter((fact) => fact.rewarded).length,
    granted: facts.filter((fact) => fact.granted).length,
    skipped: facts.filter((fact) => fact.skipped).length,
    failed: facts.filter((fact) => fact.failed).length,
    uniqueShownUsers: distinctUsers((fact) => fact.shown),
    uniqueRewardedUsers: distinctUsers((fact) => fact.rewarded),
    uniqueSkippedUsers: distinctUsers((fact) => fact.skipped),
  };
}

function getDashboardRanges(now: Date, days: RewardedAdsDashboardPeriodDays) {
  const nowInMoscow = DateTime.fromJSDate(now, { zone: "utc" }).setZone(
    REWARDED_ADS_DASHBOARD_TIMEZONE,
  );
  const todayStart = nowInMoscow.startOf("day");
  const tomorrowStart = todayStart.plus({ days: 1 });
  const periodStart = todayStart.minus({ days: days - 1 });

  return {
    today: { start: todayStart.toUTC().toJSDate(), end: tomorrowStart.toUTC().toJSDate() },
    period: { start: periodStart.toUTC().toJSDate(), end: tomorrowStart.toUTC().toJSDate() },
    periodStart,
  };
}

function groupFacts<T extends string>(facts: SessionFact[], getKey: (fact: SessionFact) => T) {
  const groups = new Map<T, SessionFact[]>();
  for (const fact of facts) {
    const key = getKey(fact);
    const current = groups.get(key) ?? [];
    current.push(fact);
    groups.set(key, current);
  }
  return groups;
}

function failureCodeFromSession(session: RewardedAdsSessionInput): string {
  const failedEvent = session.events.find((event) => event.eventType === "FAILED");
  if (failedEvent?.payload && typeof failedEvent.payload === "object") {
    const code = (failedEvent.payload as Record<string, unknown>).code;
    if (typeof code === "string" && code.trim()) return code;
  }
  return session.errorCode || "UNKNOWN";
}

function buildFailures(facts: SessionFact[]): RewardedAdsFailureBreakdown[] {
  const counts = new Map<string, number>();
  for (const fact of facts) {
    if (!fact.failed) continue;
    const code = failureCodeFromSession(fact.source);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, 10);
}

function buildDaily(
  facts: SessionFact[],
  periodStart: DateTime,
  days: RewardedAdsDashboardPeriodDays,
): RewardedAdsDailyPoint[] {
  const groups = groupFacts(
    facts,
    (fact) =>
      DateTime.fromJSDate(fact.source.createdAt, { zone: "utc" })
        .setZone(REWARDED_ADS_DASHBOARD_TIMEZONE)
        .toISODate()!,
  );

  return Array.from({ length: days }, (_, index) => {
    const date = periodStart.plus({ days: index }).toISODate()!;
    const summary = factsToSummary(groups.get(date) ?? []);
    return {
      date,
      sessions: summary.sessions,
      shown: summary.shown,
      rewarded: summary.rewarded,
      skipped: summary.skipped,
      failed: summary.failed,
      completionRate: summary.completionRate,
    };
  });
}

function targetKey(targetType: string | null, targetId: string | null): string {
  return `${targetType ?? "UNKNOWN"}:${targetId ?? "UNKNOWN"}`;
}

export async function getRewardedAdsAdminDashboard(
  input: {
    days?: RewardedAdsDashboardPeriodDays;
    now?: Date;
  } = {},
): Promise<RewardedAdsAdminDashboard> {
  const days = input.days ?? 30;
  const now = input.now ?? new Date();
  const ranges = getDashboardRanges(now, days);

  const sessionSelect = {
    id: true,
    userId: true,
    platform: true,
    targetType: true,
    targetId: true,
    createdAt: true,
    rewardedAt: true,
    grantedAt: true,
    errorCode: true,
    events: {
      orderBy: { createdAt: "asc" as const },
      select: { eventType: true, payload: true, createdAt: true },
    },
  };

  const [periodSessions, todayTouchedSessions, settings] = await Promise.all([
    prisma.rewardedAdSession.findMany({
      where: { createdAt: { gte: ranges.period.start, lt: ranges.period.end } },
      orderBy: { createdAt: "desc" },
      select: sessionSelect,
    }),
    prisma.rewardedAdSession.findMany({
      where: {
        OR: [
          { createdAt: { gte: ranges.today.start, lt: ranges.today.end } },
          { rewardedAt: { gte: ranges.today.start, lt: ranges.today.end } },
          { grantedAt: { gte: ranges.today.start, lt: ranges.today.end } },
          { events: { some: { createdAt: { gte: ranges.today.start, lt: ranges.today.end } } } },
        ],
      },
      select: sessionSelect,
    }),
    prisma.rewardedAdSettings.findUnique({
      where: { key: "default" },
      select: { androidEnabled: true, iosEnabled: true, testMode: true },
    }),
  ]);

  const cohort = periodSessions as RewardedAdsSessionInput[];
  const periodFacts = cohort.map((session) => sessionToFact(session));
  const today = factsToTodayActivity(
    (todayTouchedSessions as RewardedAdsSessionInput[]).map((session) =>
      sessionToFact(session, ranges.today),
    ),
  );

  const stepIds = [
    ...new Set(
      cohort
        .filter((session) => session.targetType === "COURSE_STEP" && session.targetId)
        .map((session) => session.targetId!),
    ),
  ];
  const articleIds = [
    ...new Set(
      cohort
        .filter((session) => session.targetType === "ARTICLE" && session.targetId)
        .map((session) => session.targetId!),
    ),
  ];

  const [steps, articles] = await Promise.all([
    stepIds.length
      ? prisma.stepOnDay.findMany({
          where: { id: { in: stepIds } },
          select: {
            id: true,
            order: true,
            step: { select: { title: true } },
            day: {
              select: {
                title: true,
                dayLinks: {
                  orderBy: { order: "asc" },
                  select: { order: true, course: { select: { name: true } } },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    articleIds.length
      ? prisma.article.findMany({
          where: { id: { in: articleIds } },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
  ]);

  const targetPresentation = new Map<string, { title: string; context: string | null }>();
  for (const row of steps) {
    const courseContexts = row.day.dayLinks.map(
      (link) => `${link.course.name}: день ${link.order + 1}`,
    );
    targetPresentation.set(targetKey("COURSE_STEP", row.id), {
      title: row.step.title,
      context: [
        courseContexts.length > 0 ? courseContexts.join(", ") : row.day.title,
        `шаг ${row.order + 1}`,
      ].join(" · "),
    });
  }
  for (const row of articles) {
    targetPresentation.set(targetKey("ARTICLE", row.id), {
      title: row.title,
      context: "Статья",
    });
  }

  const byPlatform: RewardedAdsPlatformBreakdown[] = (["ANDROID", "IOS"] as const).map(
    (platform) => ({
      platform,
      ...factsToSummary(periodFacts.filter((fact) => fact.source.platform === platform)),
    }),
  );
  const byTarget: RewardedAdsTargetBreakdown[] = [
    ...groupFacts(periodFacts, (fact) => targetKey(fact.source.targetType, fact.source.targetId)),
  ]
    .map(([key, facts]) => {
      const first = facts[0]!.source;
      const presentation = targetPresentation.get(key);
      return {
        targetType: first.targetType ?? "UNKNOWN",
        targetId: first.targetId ?? "UNKNOWN",
        title: presentation?.title ?? "Удалённый или неизвестный материал",
        context: presentation?.context ?? null,
        ...factsToSummary(facts),
      };
    })
    .sort((a, b) => b.shown - a.shown || b.sessions - a.sessions || a.title.localeCompare(b.title));

  return {
    generatedAt: now.toISOString(),
    timeZone: REWARDED_ADS_DASHBOARD_TIMEZONE,
    range: {
      days,
      start: ranges.period.start.toISOString(),
      end: ranges.period.end.toISOString(),
    },
    settings: settings ?? { androidEnabled: false, iosEnabled: false, testMode: true },
    today,
    period: factsToSummary(periodFacts),
    byPlatform,
    byTarget,
    daily: buildDaily(periodFacts, ranges.periodStart, days),
    failures: buildFailures(periodFacts),
  };
}
