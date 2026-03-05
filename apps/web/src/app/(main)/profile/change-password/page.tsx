import { redirect } from "next/navigation";

import { generateStaticPageMetadata } from "@gafus/metadata";
import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";

import ChangePasswordForm from "@features/profile/components/ChangePasswordForm";

export const metadata = generateStaticPageMetadata(
  "Смена пароля",
  "Измените пароль для входа",
  "/profile/change-password",
);

export default async function ChangePasswordPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <ChangePasswordForm />;
}
