import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Алиас под веб-URL /trainings/:courseType (Universal Links / App Links).
 */
export default function TrainingsCourseAliasScreen() {
  const { courseType } = useLocalSearchParams<{ courseType: string }>();
  if (!courseType || typeof courseType !== "string") {
    return <Redirect href="/(main)/(tabs)" />;
  }
  return <Redirect href={`/(main)/training/${encodeURIComponent(courseType)}`} />;
}
