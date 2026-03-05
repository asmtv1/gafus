import { generateStaticPageMetadata } from "@gafus/metadata";
import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";

import SetVkPhoneForm from "@features/profile/components/SetVkPhoneForm";
import ChangePhoneForm from "./ChangePhoneForm";

export const metadata = generateStaticPageMetadata(
  "Смена телефона",
  "Подтверждение смены номера телефона по коду из Telegram",
  "/profile/change-phone",
);

export default async function ChangePhonePage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.needsPhone) {
    return <SetVkPhoneForm />;
  }
  return <ChangePhoneForm />;
}
