import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@gafus/auth";
import { getProfitDashboard } from "@gafus/core/services/appSubscription";
import PageLayout from "@/shared/components/PageLayout";
import ProfitClient from "@/features/profit/ProfitClient";

export const dynamic = "force-dynamic";

export default async function ProfitPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/main-panel");
  const raw = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const params = {
    from: first(raw.from),
    to: first(raw.to),
    paymentPage: Number(first(raw.paymentPage) ?? 1),
    videoPage: Number(first(raw.videoPage) ?? 1),
  };
  let periodError: string | undefined;
  let data;
  try {
    data = await getProfitDashboard(params);
  } catch (error) {
    if (!(error instanceof Error) || !/^(Период|Некорректная дата)/.test(error.message))
      throw error;
    periodError = error.message;
    data = await getProfitDashboard({});
  }
  return (
    <PageLayout
      title="Чистая прибыль"
      subtitle="Доходы от подписок ЮKassa и расходы с 1 сентября 2026 года"
    >
      <ProfitClient key={`${data.from}:${data.to}`} data={data} periodError={periodError} />
    </PageLayout>
  );
}
