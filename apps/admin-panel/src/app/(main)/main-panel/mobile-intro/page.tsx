import type { Metadata } from "next";

import MobileIntroReport from "@/features/mobile-intro/components/MobileIntroReport";
import { parseMobileIntroDateRange } from "@/features/mobile-intro/lib/dateRange";
import { getAdminMobileIntroReport } from "@/features/mobile-intro/lib/mobileIntroReport";
import PageLayout from "@/shared/components/PageLayout";

export const metadata: Metadata = {
  title: "Презентация приложения | Админ панель",
  description: "Воронка первого запуска мобильного приложения",
};

export default async function MobileIntroPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string | string[]; end?: string | string[] }>;
}) {
  const { start, end } = await searchParams;
  const range = parseMobileIntroDateRange(start, end);
  const report = await getAdminMobileIntroReport(range);

  return (
    <PageLayout
      title="Презентация приложения"
      subtitle="Воронка первого запуска: открытие, просмотр и авторизация"
    >
      <MobileIntroReport report={report} startDate={range.startDate} endDate={range.endDate} />
    </PageLayout>
  );
}
