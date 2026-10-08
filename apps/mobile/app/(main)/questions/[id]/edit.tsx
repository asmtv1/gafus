import { useLocalSearchParams } from "expo-router";
import { QuestionFormScreen } from "@/features/questions/QuestionFormScreen";
export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <QuestionFormScreen key={id} id={id} />;
}
