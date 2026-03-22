import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Алиас под веб-URL /trainings/:courseType/:day
 */
export default function TrainingsDayAliasScreen() {
  const { courseType, day } = useLocalSearchParams<{
    courseType: string;
    day: string;
  }>();
  if (!courseType || !day || typeof courseType !== "string" || typeof day !== "string") {
    return <Redirect href="/(main)/(tabs)" />;
  }
  return (
    <Redirect
      href={`/(main)/training/${encodeURIComponent(courseType)}/${encodeURIComponent(day)}`}
    />
  );
}
