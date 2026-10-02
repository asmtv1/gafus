import ChatHub from "@/features/cynologist-chat/ChatHub";
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <ChatHub initialCommunity={tab === "community"} />;
}
