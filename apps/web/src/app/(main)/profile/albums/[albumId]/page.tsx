import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { redirect } from "next/navigation";
import { GalleryAlbum } from "@/features/gallery";
export const dynamic = "force-dynamic";
export default async function AlbumPage({ params }: { params: Promise<{ albumId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return <GalleryAlbum albumId={(await params).albumId} />;
}
