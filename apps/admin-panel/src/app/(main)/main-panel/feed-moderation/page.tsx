import { loadFeedReports } from "./actions";
import { FeedModeration } from "./FeedModeration";
export default async function Page() {
  try { return <FeedModeration initial={await loadFeedReports()} />; }
  catch (error) { return <p>{error instanceof Error ? error.message : "Не удалось загрузить жалобы"}</p>; }
}
