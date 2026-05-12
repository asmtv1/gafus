import UsersClient from "./UsersClient";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { redirect } from "next/navigation";

import { getAllUsers } from "@/features/users/lib/getAllUsers";

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (!role || (role !== "ADMIN" && role !== "MODERATOR")) {
    redirect("/main-panel");
  }
  const users = await getAllUsers();

  return <UsersClient users={users} actorRole={role} />;
}
