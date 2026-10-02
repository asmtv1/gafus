import { Image } from "expo-image";

const icons = {
  reminders: require("../../../../assets/images/profile-icons/reminders.webp"),
  tour: require("../../../../assets/images/profile-icons/tour.webp"),
  "trainer-notes": require("../../../../assets/images/profile-icons/trainer-notes.webp"),
  "notes-empty": require("../../../../assets/images/profile-icons/notes-empty.webp"),
  email: require("../../../../assets/images/profile-icons/email.webp"),
  password: require("../../../../assets/images/profile-icons/password.webp"),
  login: require("../../../../assets/images/profile-icons/login.webp"),
  notifications: require("../../../../assets/images/profile-icons/notifications.webp"),
  about: require("../../../../assets/images/profile-icons/about.webp"),
  "app-info": require("../../../../assets/images/profile-icons/app-info.webp"),
  premium: require("../../../../assets/images/profile-icons/premium.webp"),
  telegram: require("../../../../assets/images/profile-icons/telegram.webp"),
  privacy: require("../../../../assets/images/profile-icons/privacy.webp"),
  offer: require("../../../../assets/images/profile-icons/offer.webp"),
  consent: require("../../../../assets/images/profile-icons/consent.webp"),
  distribution: require("../../../../assets/images/profile-icons/distribution.webp"),
  support: require("../../../../assets/images/profile-icons/support.webp"),
  logout: require("../../../../assets/images/profile-icons/logout.webp"),
  "delete-account": require("../../../../assets/images/profile-icons/delete-account.webp"),
} as const;

export function ProfileIcon({ name, size = 40 }: { name: keyof typeof icons; size?: number }) {
  return (
    <Image
      source={icons[name]}
      style={{ width: size, height: size, flexShrink: 0 }}
      contentFit="contain"
      accessible={false}
    />
  );
}
