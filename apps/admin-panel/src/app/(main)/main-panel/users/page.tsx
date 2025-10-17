import UsersClient from "./UsersClient";

import { getAllUsers } from "@/features/users/lib/getAllUsers";

export default async function UsersPage() {
  const users = await getAllUsers();

  return <UsersClient users={users} />;
}

