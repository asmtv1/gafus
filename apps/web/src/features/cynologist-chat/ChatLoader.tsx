"use client";
import { LoadingState } from "@/shared/components/ui/LoadingState";
import dynamic from "next/dynamic";
const ChatPage = dynamic(() => import("./ChatPage"), {
  ssr: false,
  loading: () => <LoadingState message="Загрузка диалога…" />,
});
export default ChatPage;
