import {
  AddRounded,
  ArticleOutlined,
  BookmarkBorderOutlined,
  NotificationsNoneOutlined,
  PersonOffOutlined,
} from "@mui/icons-material";
import Link from "next/link";
import { PrimaryButtonLink, SecondaryButtonLink } from "@/shared/components/ui";

import styles from "./Feed.module.css";

type FeedSection = "feed" | "saved" | "hidden" | "notifications";

const sections = [
  { key: "feed", href: "/feed", label: "Лента", Icon: ArticleOutlined },
  { key: "saved", href: "/feed/saved", label: "Сохранённое", Icon: BookmarkBorderOutlined },
  { key: "hidden", href: "/feed/hidden-authors", label: "Скрытые авторы", Icon: PersonOffOutlined },
] as const;

const titles: Record<FeedSection, string> = {
  feed: "Моменты",
  saved: "Сохранённое",
  hidden: "Скрытые авторы",
  notifications: "Уведомления",
};

const descriptions: Record<FeedSection, string> = {
  feed: "Истории, фотографии и видео о жизни с питомцами.",
  saved: "Публикации, к которым хочется вернуться.",
  hidden: "Управляйте авторами, которых не хотите видеть в ленте.",
  notifications: "Новые реакции и комментарии к вашим публикациям.",
};

/** Общая шапка раздела без большого декоративного баннера. */
export function FeedTopBar({
  active,
  showActions = true,
}: {
  active: FeedSection;
  showActions?: boolean;
}) {
  return (
    <header className={styles.feedTopBar}>
      <div className={styles.feedTopBarMain}>
        <div className={styles.feedHeading}>
          <span className={styles.feedEyebrow}>Сообщество GAFUS</span>
          <h1 className={styles.feedTopBarTitle}>{titles[active]}</h1>
          <p className={styles.feedTopBarDescription}>{descriptions[active]}</p>
        </div>
        {showActions && (
          <div className={styles.feedTopBarActions}>
            <SecondaryButtonLink
              href="/feed/notifications"
              className={
                styles.feedNotifications +
                (active === "notifications" ? " " + styles.feedNotificationsActive : "")
              }
              aria-label="Уведомления"
              aria-current={active === "notifications" ? "page" : undefined}
              title="Уведомления"
            >
              <NotificationsNoneOutlined aria-hidden="true" />
            </SecondaryButtonLink>
            <PrimaryButtonLink
              href="/feed/create"
              className={styles.feedCreate}
              aria-label="Новая публикация"
            >
              <AddRounded aria-hidden="true" />
              <span>Новая публикация</span>
            </PrimaryButtonLink>
          </div>
        )}
      </div>
      {showActions && (
        <nav className={styles.feedNav} aria-label="Разделы «Моментов»">
          {sections.map(({ key, href, label, Icon }) => (
            <Link
              key={key}
              href={href}
              className={
                styles.feedNavItem + (active === key ? " " + styles.feedNavItemActive : "")
              }
              aria-current={active === key ? "page" : undefined}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
