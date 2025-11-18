"use client";

import { useState } from "react";
import { Divider } from "@mui/material";

import PageLayout from "@shared/components/PageLayout";
import TrainerVideoUploader from "./TrainerVideoUploader";
import TrainerVideosList from "./TrainerVideosList";

import type { TrainerVideoViewModel } from "../types";

interface TrainerVideosClientProps {
  videos: TrainerVideoViewModel[];
}

export default function TrainerVideosClient({ videos: initialVideos }: TrainerVideosClientProps) {
  const [videos, setVideos] = useState<TrainerVideoViewModel[]>(initialVideos);

  const handleUploaded = (video: TrainerVideoViewModel) => {
    setVideos((prev) => [video, ...prev.filter((item) => item.id !== video.id)]);
  };

  const handleDeleted = (videoId: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== videoId));
  };

  const handleUpdated = (videoId: string, displayName: string | null) => {
    setVideos((prev) =>
      prev.map((v) => (v.id === videoId ? { ...v, displayName } : v))
    );
  };

  return (
    <PageLayout
      title="Мои видео"
      subtitle="Загружайте личные видео для использования в шагах, экзаменах и курсах"
    >
      <TrainerVideoUploader onUploaded={handleUploaded} />

      <Divider sx={{ my: 4 }} />

      <TrainerVideosList 
        videos={videos} 
        onVideoDeleted={handleDeleted}
        onVideoUpdated={handleUpdated}
      />
    </PageLayout>
  );
}

