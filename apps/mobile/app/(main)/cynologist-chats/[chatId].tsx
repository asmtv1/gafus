import { Redirect } from "expo-router";
/** Legacy Stream IDs are not Chat2 IDs. Open the messenger list instead. */
export default function RetiredChatDialog() {
  return <Redirect href="/(main)/chats" />;
}
