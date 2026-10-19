import { authOptions } from "@gafus/auth";
import { getAdminMediaDashboard } from "@gafus/core/services/systemHealth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import MediaMonitor from "./MediaMonitor";

export const dynamic = "force-dynamic";

export default async function MediaMonitoringPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/main-panel");
  const data = await getAdminMediaDashboard();
  return <MediaMonitor data={data} />;
}
