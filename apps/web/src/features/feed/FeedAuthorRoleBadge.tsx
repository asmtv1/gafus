import { getFeedAuthorRoleBadge, type FeedAuthorDto } from "@gafus/types";
import styles from "./Feed.module.css";

/** Post author badges: admins and trainers only. */
export function FeedAuthorRoleBadge({ role }: { role?: FeedAuthorDto["role"] }) {
  const label = getFeedAuthorRoleBadge(role);
  if (!label) return null;

  return (
    <span className={[
      styles.authorRoleBadge,
      role === "ADMIN" ? styles.authorRoleAdmin : styles.authorRoleTrainer,
    ].join(" ")}>
      {label}
    </span>
  );
}
