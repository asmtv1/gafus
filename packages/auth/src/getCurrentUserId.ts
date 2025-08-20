"use server";

import { getServerSession } from "next-auth";
import { edgeAuthOptions } from "./edge-auth";

export async function getCurrentUserId(): Promise<string | null> {
  const session = await getServerSession(edgeAuthOptions);
  return session?.user?.id || null;
}
