import { loadQuestionModeration } from "./actions";
import { QuestionsModeration } from "./QuestionsModeration";
export default async function Page() {
  try {
    return <QuestionsModeration initial={await loadQuestionModeration()} />;
  } catch (error) {
    return <p>{error instanceof Error ? error.message : "Не удалось загрузить жалобы"}</p>;
  }
}
