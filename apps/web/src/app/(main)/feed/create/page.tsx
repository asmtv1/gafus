import { FeedComposePage } from "@/features/feed/FeedViews";
export default async function CreateFeedPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const q = await searchParams;
  return <FeedComposePage editId={q.edit} />;
}
