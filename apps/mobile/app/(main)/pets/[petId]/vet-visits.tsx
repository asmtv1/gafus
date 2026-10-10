import { useLocalSearchParams } from "expo-router";
import { PetVetVisitsScreen } from "@/features/pets/PetVetVisits";

export default function VetVisitsRoute() {
  const { petId } = useLocalSearchParams<{ petId: string }>();
  return <PetVetVisitsScreen petId={typeof petId === "string" ? petId : ""} />;
}
