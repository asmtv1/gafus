import { redirect } from "next/navigation";

import { generateStaticPageMetadata } from "@gafus/metadata";
import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";

import ChangeUsernameForm from "./ChangeUsernameForm";

export const metadata = generateStaticPageMetadata(
  "Смена логина",
  "Изменение логина (username) аккаунта",
  "/profile/change-username",
);

export default async function ChangeUsernamePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  return <ChangeUsernameForm />;
}
