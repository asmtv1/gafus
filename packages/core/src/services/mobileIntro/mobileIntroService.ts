import { prisma } from "@gafus/prisma";
import type {
  MobileIntroAuthOutcome,
  MobileIntroEventInput,
  MobileIntroReport,
} from "./types";

/** Persists only first-run analytics. Replays are intentionally harmless. */
export async function recordMobileIntroEvent(input: MobileIntroEventInput): Promise<void> {
  await prisma.mobileIntroInstallation.upsert({
    where: {
      installationId_introVersion: {
        installationId: input.installationId,
        introVersion: input.introVersion,
      },
    },
    create: {
      installationId: input.installationId,
      introVersion: input.introVersion,
      platform: input.platform,
      openedAt: input.openedAt,
      ...(input.event === "OPENED" ? {} : { completion: input.event, completedAt: input.occurredAt }),
    },
    update: {},
  });

  if (input.event !== "OPENED") {
    // The first terminal result wins even when an offline queue is replayed concurrently.
    await prisma.mobileIntroInstallation.updateMany({
      where: {
        installationId: input.installationId,
        introVersion: input.introVersion,
        completion: null,
      },
      data: { completion: input.event, completedAt: input.occurredAt },
    });
  }
}

export async function recordMobileIntroAuthOutcome(input: {
  installationId: string;
  introVersion: string;
  userId: string;
  outcome: MobileIntroAuthOutcome;
  platform: "IOS" | "ANDROID";
  openedAt: Date;
  occurredAt?: Date;
}): Promise<void> {
  const occurredAt = input.occurredAt ?? new Date();
  // Auth can arrive before an offline OPENED event. Create the same unique row so
  // a later event replay joins it instead of losing the conversion.
  await prisma.mobileIntroInstallation.upsert({
    where: { installationId_introVersion: { installationId: input.installationId, introVersion: input.introVersion } },
    create: {
      installationId: input.installationId,
      introVersion: input.introVersion,
      platform: input.platform,
      openedAt: input.openedAt,
      authOutcome: input.outcome,
      authOutcomeAt: occurredAt,
      authOutcomeUserId: input.userId,
    },
    update: {},
  });
  await prisma.mobileIntroInstallation.updateMany({
    where: {
      installationId: input.installationId,
      introVersion: input.introVersion,
      authOutcome: null,
    },
    data: {
      authOutcome: input.outcome,
      authOutcomeAt: occurredAt,
      authOutcomeUserId: input.userId,
    },
  });
}

export async function getMobileIntroReport(range: { start: Date; end: Date }): Promise<MobileIntroReport> {
  const rows = await prisma.mobileIntroInstallation.findMany({
    where: { openedAt: { gte: range.start, lt: range.end } },
    select: { completion: true, authOutcome: true },
  });
  const count = (predicate: (row: (typeof rows)[number]) => boolean) => rows.filter(predicate).length;
  const openings = rows.length;
  const registered = count((row) => row.authOutcome === "REGISTERED");
  const loggedIn = count((row) => row.authOutcome === "LOGGED_IN");
  return {
    timeZone: "Europe/Samara",
    range: { start: range.start.toISOString(), end: range.end.toISOString() },
    generatedAt: new Date().toISOString(),
    openings,
    completed: count((row) => row.completion === "COMPLETED"),
    skipped: count((row) => row.completion === "SKIPPED"),
    registered,
    loggedIn,
    pendingAuth: openings - registered - loggedIn,
  };
}
