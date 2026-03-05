import { redirect } from "next/navigation";

import { generateStaticPageMetadata } from "@gafus/metadata";
import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";

import SetPasswordForm from "@features/profile/components/SetPasswordForm";

export const metadata = generateStaticPageMetadata(
  "Установка пароля",
  "Установите пароль для входа через логин",
  "/profile/set-password",
);

export default async function SetPasswordPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <SetPasswordForm />;
}
