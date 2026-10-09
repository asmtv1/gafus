import { FeedPostPage } from "@/features/feed/FeedViews";
export default async function PostPage({ params, searchParams }: {
  params: Promise<{ postId: string }>;
  searchParams: Promise<{ commentId?: string }>;
}) {
  const [{ postId }, query] = await Promise.all([params, searchParams]);
  const commentId = typeof query.commentId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(query.commentId) ? query.commentId : undefined;
  return <FeedPostPage postId={postId} commentId={commentId} />;
}
