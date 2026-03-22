import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Алиас под веб-URL /trainings/:courseType/reviews
 */
export default function TrainingsReviewsAliasScreen() {
  const { courseType } = useLocalSearchParams<{ courseType: string }>();
  if (!courseType || typeof courseType !== "string") {
    return <Redirect href="/(main)/(tabs)" />;
  }
  return (
    <Redirect
      href={`/(main)/training/${encodeURIComponent(courseType)}/reviews`}
    />
  );
}
