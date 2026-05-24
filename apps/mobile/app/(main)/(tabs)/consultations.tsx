import { useLocalSearchParams } from "expo-router";

import ConsultationsMineScreen from "../consultations/mine";
import { ConsultationsCynologistsListScreen } from "@/features/consultations";

export default function ConsultationsTabScreen() {
  const params = useLocalSearchParams<{ view?: string | string[] }>();
  const view = Array.isArray(params.view) ? (params.view[0] ?? "") : (params.view ?? "");

  if (view === "mine") {
    return <ConsultationsMineScreen />;
  }
  return <ConsultationsCynologistsListScreen />;
}
