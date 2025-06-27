// src/components/Header/HeaderServerWrapper.tsx
import { getServerSession } from "next-auth";
import Header from "./Header";
import { authOptions } from "@/lib/auth/auth";

export default async function HeaderServerWrapper() {
  const session = await getServerSession(authOptions);
  const userName = session?.user?.username ?? "";
  const avatarUrl = session?.user?.avatarUrl ?? "/avatar.svg";
  return <Header userName={userName} avatarUrl={avatarUrl} />;
}
