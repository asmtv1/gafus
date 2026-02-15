import { generateStaticPageMetadata } from "@gafus/metadata";

import ChangeUsernameForm from "./ChangeUsernameForm";

export const metadata = generateStaticPageMetadata(
  "Смена логина",
  "Изменение логина (username) аккаунта",
  "/profile/change-username",
);

export default function ChangeUsernamePage() {
  return <ChangeUsernameForm />;
}
