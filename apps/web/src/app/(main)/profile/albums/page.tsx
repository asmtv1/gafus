import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { redirect } from "next/navigation";
import { GalleryAlbums } from "@/features/gallery";
export const dynamic = "force-dynamic";
export default async function AlbumsPage({
  searchParams,
}: {
  searchParams: Promise<{ username?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { username } = await searchParams;
  return <GalleryAlbums username={username || session.user.username || ""} />;
}
