import { useLocalSearchParams } from "expo-router";
import { FeedProfilePostsScreen } from "@/features/feed/ProfilePostsScreen";

export default function FeedProfilePostsRoute() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <FeedProfilePostsScreen username={username ?? ""} />;
}
