import { redirect } from "next/navigation";

import { authOptions } from "@gafus/auth";
import { getServerSession } from "next-auth";
import type { NextAuthOptions } from "next-auth";

import DailyCourseImportClient from "./DailyCourseImportClient";

const ALLOWED_ROLES = new Set(["TRAINER", "ADMIN", "MODERATOR"]);

export default async function DailyCourseImportPage() {
  const session = await getServerSession(authOptions as NextAuthOptions);
  const role = session?.user?.role;
  if (!session?.user?.id || !role || !ALLOWED_ROLES.has(role)) {
    redirect("/login");
  }

  return <DailyCourseImportClient />;
}
