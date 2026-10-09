import { FeedAuthorPostsPage } from "@/features/feed/FeedViews";

export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <FeedAuthorPostsPage username={username} />;
}
