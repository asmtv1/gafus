import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";
import { generateStaticPageMetadata } from "@gafus/metadata";

import DeleteAccountForm from "@features/profile/components/DeleteAccountForm";

export const metadata = generateStaticPageMetadata(
  "Удаление аккаунта",
  "Необратимое удаление учётной записи и данных",
  "/profile/delete-account",
);

export default async function DeleteAccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const email = session.user.email?.trim() ?? null;

  return <DeleteAccountForm userEmail={email} />;
}
