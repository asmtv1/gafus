/** Exact illustrated Next ProfileIcon assets, copied byte-for-byte from
 * apps/web/public/images/profile-icons. Presentation only; no mutation or API.
 */
export type ProfileIconName =
  | "reminders" | "tour" | "trainer-notes" | "notes-empty" | "email"
  | "password" | "login" | "notifications" | "about" | "app-info"
  | "premium" | "telegram" | "privacy" | "offer" | "consent"
  | "distribution" | "support" | "logout" | "delete-account";

export function NextProfileIcon({ name, size = 40 }: {
  name: ProfileIconName; size?: number;
}) {
  return <img src={`/images/profile-icons/${name}.webp`} alt="" aria-hidden="true"
    width={size} height={size} loading="lazy"
    style={{objectFit:"contain",flexShrink:0}}/>;
}
