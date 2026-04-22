import { Redirect } from "expo-router";

/**
 * URL `/consultations` остаётся валидным; основной сценарий — вкладка «Консультация».
 */
export default function ConsultationsIndexRedirect() {
  return <Redirect href="/(main)/(tabs)/consultations" />;
}
