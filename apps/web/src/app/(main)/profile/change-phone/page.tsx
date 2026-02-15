import { generateStaticPageMetadata } from "@gafus/metadata";

import ChangePhoneForm from "./ChangePhoneForm";

export const metadata = generateStaticPageMetadata(
  "Смена телефона",
  "Подтверждение смены номера телефона по коду из Telegram",
  "/profile/change-phone",
);

export default function ChangePhonePage() {
  return <ChangePhoneForm />;
}
