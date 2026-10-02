import Image from "next/image";

export type ProfileIconName =
  | "reminders"
  | "tour"
  | "trainer-notes"
  | "notes-empty"
  | "email"
  | "password"
  | "login"
  | "notifications"
  | "about"
  | "app-info"
  | "premium"
  | "telegram"
  | "privacy"
  | "offer"
  | "consent"
  | "distribution"
  | "support"
  | "logout"
  | "delete-account";

export function ProfileIcon({ name, size = 40 }: { name: ProfileIconName; size?: number }) {
  return (
    <Image
      src={`/images/profile-icons/${name}.webp`}
      alt=""
      width={size}
      height={size}
      style={{ objectFit: "contain", flexShrink: 0 }}
    />
  );
}
