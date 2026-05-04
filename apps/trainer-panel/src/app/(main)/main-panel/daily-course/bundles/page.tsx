import { redirect } from "next/navigation";

import { authOptions } from "@gafus/auth";
import { getMoscowDateKey } from "@gafus/core/services/dailyCourse";
import { getServerSession } from "next-auth";
import type { NextAuthOptions } from "next-auth";

import { getDailyCourseBundlesPageData } from "@/features/daily-course/lib/actions";

import DailyCourseBundlesClient from "./DailyCourseBundlesClient";

const ALLOWED_ROLES = new Set(["TRAINER", "ADMIN", "MODERATOR"]);

export default async function DailyCourseBundlesPage() {
  const session = await getServerSession(authOptions as NextAuthOptions);
  const role = session?.user?.role;
  if (!session?.user?.id || !role || !ALLOWED_ROLES.has(role)) {
    redirect("/login");
  }

  const { bundles, steps } = await getDailyCourseBundlesPageData();
  return (
    <DailyCourseBundlesClient
      bundles={bundles}
      steps={steps}
      today={getMoscowDateKey()}
    />
  );
}
