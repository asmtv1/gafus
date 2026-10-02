import { useLocalSearchParams } from "expo-router";
import ChatScreen from "@/features/cynologist-chat/ChatScreen";
export default function Page() { const { chatId } = useLocalSearchParams<{ chatId: string }>(); return <ChatScreen chatId={chatId} />; }
