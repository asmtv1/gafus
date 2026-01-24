import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";

import TrainerVideosClient from "@features/trainer-videos/components/TrainerVideosClient";
import { getTrainerVideos } from "@features/trainer-videos/lib/getTrainerVideos";
import type { TrainerVideoViewModel } from "@features/trainer-videos/types";

export const metadata: Metadata = {
  title: "Мои видео — панель тренера",
};

export default async function MyVideosPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const videos = await getTrainerVideos(session.user.id);
  const isAdmin = session.user.role === "ADMIN";

  const serialized: TrainerVideoViewModel[] = videos.map((video) => ({
    ...video,
    createdAt: video.createdAt.toISOString(),
    updatedAt: video.updatedAt.toISOString(),
  }));

  return <TrainerVideosClient videos={serialized} isAdmin={isAdmin} />;
}
