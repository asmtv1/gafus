import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getPetById } from "@gafus/core/services/pets";
import { notFound, redirect } from "next/navigation";
import { VetVisits } from "@/features/pet-vet-visits/VetVisits";

export const dynamic = "force-dynamic";
export const metadata = { title: "Посещения врача — Гафус" };
export default async function VetVisitsPage({ params }: { params: Promise<{ petId: string }> }) {
  const ownerId = (await getServerSession(authOptions))?.user?.id;
  if (!ownerId) redirect("/login");
  const { petId } = await params;
  const pet = await getPetById(petId, ownerId);
  if (!pet) notFound();
  return <VetVisits petId={pet.id} petName={pet.name} />;
}
