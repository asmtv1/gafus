import { authOptions } from "@gafus/auth";
import { getAdminMailDashboard } from "@gafus/core/services/systemHealth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import MailHealthClient from "./MailHealthClient";

export const dynamic = "force-dynamic";

export default async function MailHealthPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/main-panel");
  const data = await getAdminMailDashboard();
  return <MailHealthClient data={data} />;
}
