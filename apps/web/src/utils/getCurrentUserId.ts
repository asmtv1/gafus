"use server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";

export async function getCurrentUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Вы не авторизован");
  }
  return session.user.id;
}
