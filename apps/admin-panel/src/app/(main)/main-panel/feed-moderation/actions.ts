"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getAdminFeedReports, moderateAdminFeedReport } from "@gafus/core/services/feed";

async function actor() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Не авторизован");
  return session.user.id;
}

export async function loadFeedReports(cursor: string | null = null) {
  return getAdminFeedReports(await actor(), cursor);
}

export async function moderateFeedReport(id: string, input: unknown) {
  return moderateAdminFeedReport(await actor(), id, input);
}
