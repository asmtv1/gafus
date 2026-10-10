"use server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { createFeedPreferences } from "@gafus/core/services/feed";
const moderation = createFeedPreferences({ db: prisma, enabled: () => true });
async function actor() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Не авторизован");
  return session.user.id;
}
export async function loadFeedReports(cursor: string | null = null) { return moderation.reports(await actor(), { cursor }); }
export async function moderateFeedReport(id: string, input: unknown) { return moderation.moderate(await actor(), id, input); }
