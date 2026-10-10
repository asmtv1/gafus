import {
  AddRounded,
  ArticleOutlined,
  BookmarkBorderOutlined,
  NotificationsNoneOutlined,
  PersonOffOutlined,
} from "@mui/icons-material";
import Link from "next/link";
import Image from "next/image";
import { CaramelButtonLink } from "@/shared/components/ui";

import styles from "./Feed.module.css";
import { BOOKMARK_ARTWORK_URI } from "./bookmarkArtwork";

type FeedSection = "feed" | "saved" | "hidden" | "notifications";

const sections = [
  { key: "feed", href: "/feed", label: "Публикации", Icon: ArticleOutlined },
  { key: "saved", href: "/feed/saved", label: "Закладки", Icon: BookmarkBorderOutlined },
  { key: "hidden", href: "/feed/hidden-authors", label: "Скрытые авторы", Icon: PersonOffOutlined },
] as const;

const titles: Record<FeedSection, string> = {
  feed: "Моменты",
  saved: "Закладки",
  hidden: "Скрытые авторы",
  notifications: "Уведомления",
};

/** Единая компактная навигация раздела «Моменты» на десктопе и мобильных экранах. */
export function FeedTopBar({ active, showActions = true }: { active: FeedSection; showActions?: boolean }) {
  return (
    <header className={styles.feedTopBar}>
      <div className={styles.feedTopBarMain}>
        {active === "feed" ? (
          <h1 className={styles.momentsVisuallyHidden}>Моменты</h1>
        ) : (
          <h1 className={styles.feedTopBarTitle}>{titles[active]}</h1>
        )}
        {showActions && <div className={styles.feedTopBarActions}>
          <Link
            href="/feed/notifications"
            className={`${styles.feedNotifications} ${active === "notifications" ? styles.feedNotificationsActive : ""}`}
            aria-label="Уведомления"
            aria-current={active === "notifications" ? "page" : undefined}
            title="Уведомления"
          >
            <NotificationsNoneOutlined fontSize="small" aria-hidden="true" />
          </Link>
          <Link href="/feed/create" className={styles.feedCreate} aria-label="Создать пост">
            <AddRounded fontSize="small" aria-hidden="true" />
            <span>Создать пост</span>
          </Link>
        </div>}
      </div>
      {showActions && <nav className={styles.feedNav} aria-label="Разделы «Моментов»">
        {sections.map(({ key, href, label, Icon }) => {
          const NavigationLink = key === "saved" ? CaramelButtonLink : Link;
          return (
            <NavigationLink
              key={key}
              href={href}
              className={`${styles.feedNavItem} ${active === key ? styles.feedNavItemActive : ""} ${key === "hidden" ? styles.feedNavManage : ""} ${key === "saved" ? styles.feedNavBookmarks : ""}`}
              aria-current={active === key ? "page" : undefined}
            >
              {key === "saved" ? (
                <Image
                  src={BOOKMARK_ARTWORK_URI}
                  width={22}
                  height={22}
                  unoptimized
                  className={styles.feedBookmarkImage}
                  alt=""
                  aria-hidden="true"
                />
              ) : (
                <Icon fontSize="small" aria-hidden="true" />
              )}
              <span>{label}</span>
            </NavigationLink>
          );
        })}
      </nav>}
    </header>
  );
}
