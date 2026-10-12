import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { redirect } from "next/navigation";
import { VoxConsultationRoom } from "@gafus/ui-components";
import {
  prepareConsultationCallAction,
  signConsultationKeyAction,
  createConsultationCallAdmissionAction,
} from "@/features/consultations/lib/voximplant-call-actions";

export const dynamic = "force-dynamic";

export default async function ConsultationCallPage({
  params,
}: { params: Promise<{ bookingId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const { bookingId } = await params;
  return (
    <VoxConsultationRoom
      bookingId={bookingId}
      backHref="/main-panel/consultations"
      prepare={prepareConsultationCallAction}
      signKey={signConsultationKeyAction}
      authorizeJoin={createConsultationCallAdmissionAction}
    />
  );
}
