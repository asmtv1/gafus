import { redirect } from "next/navigation";

import { generateStaticPageMetadata } from "@gafus/metadata";
import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";

import ChangeEmailForm from "./ChangeEmailForm";

export const metadata = generateStaticPageMetadata(
  "Смена email",
  "Запрос смены адреса электронной почты с подтверждением по ссылке из письма",
  "/profile/change-email",
);

export default async function ChangeEmailPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  return <ChangeEmailForm />;
}
