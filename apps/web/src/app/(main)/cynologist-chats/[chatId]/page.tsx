import ChatLoader from "@/features/cynologist-chat/ChatLoader";
export default async function Page({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  return <ChatLoader chatId={chatId} />;
}
