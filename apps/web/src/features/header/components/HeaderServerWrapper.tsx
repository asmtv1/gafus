// src/components/Header/HeaderServerWrapper.tsx
import { authOptions } from "@gafus/auth";
import { getServerSession } from "next-auth";
import type { NextAuthOptions } from "next-auth";

import Header from "./Header";

export default async function HeaderServerWrapper() {
  const session = await getServerSession(authOptions as NextAuthOptions);

  const userName = session?.user?.username ?? "";
  const avatarUrl = session?.user?.avatarUrl ?? "/uploads/avatar.svg";
  const userRole = session?.user?.role ?? "USER";
  const trainerOnly = ["TRAINER", "ADMIN", "MODERATOR"].includes(userRole);
  return <Header userName={userName} avatarUrl={avatarUrl} trainerOnly={trainerOnly} />;
}
