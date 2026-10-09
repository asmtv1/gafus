import { useLocalSearchParams } from "expo-router";
import { FeedDetailScreen } from "@/features/feed/screens";
export default function FeedPostRoute() {
  const { postId, commentId } = useLocalSearchParams<{ postId: string; commentId?: string }>();
  return <FeedDetailScreen id={postId} commentId={typeof commentId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(commentId) ? commentId : undefined} />;
}
