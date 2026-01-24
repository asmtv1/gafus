"use client";

import { useState, useEffect, useRef } from "react";
import { Divider } from "@mui/material";

import PageLayout from "@shared/components/PageLayout";
import TrainerVideoUploader from "./TrainerVideoUploader";
import TrainerVideosList from "./TrainerVideosList";
import { getMultipleVideoStatuses } from "../lib/getMultipleVideoStatuses";

import type { TrainerVideoViewModel } from "../types";

interface TrainerVideosClientProps {
  videos: TrainerVideoViewModel[];
  isAdmin?: boolean;
}

export default function TrainerVideosClient({
  videos: initialVideos,
  isAdmin = false,
}: TrainerVideosClientProps) {
  const [videos, setVideos] = useState<TrainerVideoViewModel[]>(initialVideos);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Polling для видео со статусом PENDING или PROCESSING
  useEffect(() => {
    const videosToCheck = videos.filter(
      (v) => v.transcodingStatus === "PENDING" || v.transcodingStatus === "PROCESSING",
    );

    if (videosToCheck.length === 0) {
      // Если нет видео для проверки, останавливаем polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    // Функция для проверки статусов
    const checkStatuses = async () => {
      const videoIds = videosToCheck.map((v) => v.id);
      const result = await getMultipleVideoStatuses(videoIds);

      if ("error" in result) {
        console.error("[TrainerVideosClient] Ошибка получения статусов:", result.error);
        return;
      }

      // Обновляем видео только если статус изменился
      setVideos((prev) =>
        prev.map((v) => {
          const updatedStatus = result.find((status) => status.id === v.id);
          if (updatedStatus && updatedStatus.transcodingStatus !== v.transcodingStatus) {
            return {
              ...v,
              transcodingStatus: updatedStatus.transcodingStatus,
              transcodingError: updatedStatus.transcodingError,
              hlsManifestPath: updatedStatus.hlsManifestPath,
              thumbnailPath: updatedStatus.thumbnailPath,
              durationSec: updatedStatus.durationSec,
            };
          }
          return v;
        }),
      );
    };

    // Сразу проверяем статусы
    checkStatuses();

    // Проверяем каждые 5 секунд
    pollingIntervalRef.current = setInterval(checkStatuses, 5000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [videos]);

  const handleUploaded = (video: TrainerVideoViewModel) => {
    setVideos((prev) => [video, ...prev.filter((item) => item.id !== video.id)]);
  };

  const handleDeleted = (videoId: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== videoId));
  };

  const handleUpdated = (videoId: string, displayName: string | null) => {
    setVideos((prev) => prev.map((v) => (v.id === videoId ? { ...v, displayName } : v)));
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
        isAdmin={isAdmin}
      />
    </PageLayout>
  );
}
