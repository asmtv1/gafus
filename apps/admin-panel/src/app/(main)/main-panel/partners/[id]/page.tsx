import { notFound } from "next/navigation";
import PageLayout from "@/shared/components/PageLayout";
import PartnerDetailClient from "./PartnerDetailClient";
import { getPartnerAdminDetail } from "@/features/partners/lib/getPartnersAdmin";

export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const partner = await getPartnerAdminDetail(id);
  if (!partner) notFound();
  return <PageLayout title={`Партнёр: ${partner.fullName || partner.username}`} subtitle={`Код приглашения ${partner.referralCode}`}><PartnerDetailClient partner={partner} /></PageLayout>;
}
