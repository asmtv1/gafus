import { generateStaticPageMetadata } from "@gafus/metadata";

import PartnerDashboard from "./PartnerDashboard";

export const metadata = generateStaticPageMetadata(
  "Партнёрская программа",
  "Приглашайте новых учеников и следите за вознаграждением.",
  "/partner",
);

export default function PartnerPage() {
  return <PartnerDashboard />;
}
