import AdsClick from "@mui/icons-material/AdsClick";
import AdminPanelSettings from "@mui/icons-material/AdminPanelSettings";
import CalendarMonth from "@mui/icons-material/CalendarMonth";
import CardMembership from "@mui/icons-material/CardMembership";
import EventNote from "@mui/icons-material/EventNote";
import Flag from "@mui/icons-material/Flag";
import Handshake from "@mui/icons-material/Handshake";
import MarkEmailUnread from "@mui/icons-material/MarkEmailUnread";
import Notifications from "@mui/icons-material/Notifications";
import People from "@mui/icons-material/People";
import Pets from "@mui/icons-material/Pets";
import Slideshow from "@mui/icons-material/Slideshow";
import Storage from "@mui/icons-material/Storage";
import TrendingUp from "@mui/icons-material/TrendingUp";
import type { AdminSection } from "./routes";

const iconBySection: Record<AdminSection["key"], typeof Flag> = {
  "feed-moderation": Flag,
  questions: Flag,
  users: People,
  mail: MarkEmailUnread,
  media: Storage,
  "video-quality": Slideshow,
  admin: AdminPanelSettings,
  partners: Handshake,
  profit: TrendingUp,
  "feature-flags": Flag,
  broadcasts: Notifications,
  reengagement: TrendingUp,
  "rewarded-ads": AdsClick,
  gafus: Pets,
  "mobile-intro": Slideshow,
  "app-subscriptions": CardMembership,
  consultations: Pets,
  bookings: EventNote,
  "trainers-schedules": CalendarMonth,
};

/** Original Next Material Icons, with inline sizing for the Web Shadow DOM. */
export function AdminNavIcon({ sectionKey }: { sectionKey: AdminSection["key"] }) {
  const Icon = iconBySection[sectionKey];
  return <Icon className="sidebar-nav-icon" style={{ width: 20, height: 20 }} aria-hidden="true" />;
}
