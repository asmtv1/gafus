import { useLocalSearchParams } from "expo-router";
import { QuestionDetailScreen } from "@/features/questions/QuestionDetailScreen";
export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <QuestionDetailScreen key={id} id={id} />;
}
