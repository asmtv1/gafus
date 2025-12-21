// components/CourseCard.tsx
"use client";

import { TrainingStatus } from "@gafus/types";
import { useCourseStore } from "@shared/stores";
import Image from "next/image";
import Link from "next/link";
import NextLink from "next/link";
import { useEffect, useState } from "react";
import { Download, Refresh, Delete } from "@mui/icons-material";

import styles from "./CourseCard.module.css";


import type { CourseCardPropsWithIndex } from "@gafus/types";

import { declOfNum } from "@/utils";
import { SimpleCourseRating } from "../CourseRating";
import { FavoriteButton } from "../FavoriteButton";
import { useOfflineCourse } from "@shared/hooks/useOfflineCourse";
import { useOfflineMediaUrl } from "@shared/lib/offline/offlineMediaResolver";
import { showSuccessAlert, showErrorAlert } from "@shared/utils/sweetAlert";
import Swal from "sweetalert2";

// Заглушка по умолчанию для отсутствующих изображений
const DEFAULT_PLACEHOLDER = "/uploads/course-logo.webp";

// Функция для получения русского названия уровня сложности
const getTrainingLevelLabel = (level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT") => {
  switch (level) {
    case "BEGINNER":
      return "Начальный";
    case "INTERMEDIATE":
      return "Средний";
    case "ADVANCED":
      return "Продвинутый";
    case "EXPERT":
      return "Экспертный";
    default:
      return level;
  }
};

export const CourseCard = ({
  id,
  name,
  type,
  duration,
  logoImg,
  isPrivate = false,
  userStatus = TrainingStatus.NOT_STARTED,
  startedAt,
  completedAt,
  shortDesc,
  authorUsername,
  createdAt: _createdAt,
  avgRating,
  trainingLevel,
  reviews,
  isFavorite: propIsFavorite,
  onUnfavorite,
  index: _index = 0,
}: CourseCardPropsWithIndex) => {
  const {
    markImageLoaded,
    markImageError,
    isImageCached,
    isFavorite: storeIsFavorite,
  } = useCourseStore();

  // Используем значение из store, если оно доступно, иначе из пропсов
  const isFavorite = storeIsFavorite(id) ?? propIsFavorite;
  const [imgError, setImgError] = useState(false);
  const [isImageAlreadyCached, setIsImageAlreadyCached] = useState(false);
  
  // Офлайн-функциональность
  const {
    isDownloadedByType,
    downloadCourse,
    updateCourse,
    deleteCourse,
    isDownloading,
    isUpdating,
  } = useOfflineCourse();
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [useHardNavigation, setUseHardNavigation] = useState(false);

  // Синхронизируем состояние избранного с store при изменении пропсов
  useEffect(() => {
    if (propIsFavorite !== isFavorite) {
      // Если пропс изменился, обновляем локальное состояние
      // Это поможет синхронизировать состояние между страницами
    }
  }, [propIsFavorite, isFavorite]);

  // Проверяем, скачан ли курс
  useEffect(() => {
    const checkDownloaded = async () => {
      setIsChecking(true);
      const downloaded = await isDownloadedByType(type);
      setIsDownloaded(downloaded);
      setIsChecking(false);
    };
    checkDownloaded();
  }, [type, isDownloadedByType]);

  // Получаем офлайн-версию логотипа из IndexedDB
  const offlineLogoUrl = useOfflineMediaUrl(type, logoImg || undefined);

  // Используем blob URL если доступен, иначе оригинальный URL
  // Если изображение не загрузилось или если src пустой, используем заглушку
  // НО: если есть blob URL, игнорируем imgError (blob URL всегда работает офлайн)
  const hasBlobUrl = offlineLogoUrl && offlineLogoUrl.startsWith("blob:");
  const finalSrc = !logoImg
    ? DEFAULT_PLACEHOLDER
    : hasBlobUrl
    ? offlineLogoUrl
    : imgError
    ? DEFAULT_PLACEHOLDER
    : logoImg;

  // Логирование для отладки
  useEffect(() => {
    if (logoImg) {
      console.log("[CourseCard] Logo resolution", {
        courseType: type,
        logoImg,
        offlineLogoUrl,
        finalSrc,
        isBlobUrl: offlineLogoUrl?.startsWith("blob:"),
        imgError,
        hasLogoImg: !!logoImg,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.log("[CourseCard] No logoImg provided", {
        courseType: type,
        logoImg,
        timestamp: new Date().toISOString(),
      });
    }
  }, [type, logoImg, offlineLogoUrl, finalSrc, imgError]);

  // Проверяем кэш изображения в useEffect
  useEffect(() => {
    if (logoImg) {
      const cached = isImageCached(logoImg);
      setIsImageAlreadyCached(cached);
    }
  }, [logoImg, isImageCached]);

  // Отслеживаем загрузку изображения
  useEffect(() => {
    if (logoImg && !isImageAlreadyCached) {
      const img = document.createElement("img");
      img.onload = () => markImageLoaded(logoImg);
      img.onerror = () => markImageError(logoImg);
      img.src = logoImg;
    }
  }, [logoImg, isImageAlreadyCached, markImageLoaded, markImageError]);

  // В iOS PWA офлайн клиентская навигация может не сработать.
  // Используем обычную ссылку на странице офлайна, чтобы SW обработал навигацию.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const isOfflinePage = window.location.pathname === "/~offline";
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = "standalone" in navigator && !!navigator.standalone;

    if (isOfflinePage && isIOS && isStandalone) {
      setUseHardNavigation(true);
    }
  }, []);

  // Обработчики для скачивания и обновления
  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const result = await downloadCourse(type);
    if (result.success) {
      setIsDownloaded(true);
      await showSuccessAlert("Курс успешно скачан");
    } else {
      await showErrorAlert(result.error || "Не удалось скачать курс");
    }
  };

  const handleUpdate = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const result = await updateCourse(type);
    if (result.success) {
      // Обновляем состояние
      setIsDownloaded(true);
      
      // Показываем информативное сообщение
      if (result.hasUpdates) {
        await showSuccessAlert(result.message || "Курс успешно обновлен");
      } else {
        // Курс уже актуален
        await showSuccessAlert(result.message || "Курс уже актуален");
      }
    } else {
      await showErrorAlert(result.error || "Не удалось обновить курс");
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const confirmed = await Swal.fire({
      title: "Удалить курс?",
      text: "Вы уверены, что хотите удалить курс из офлайн-хранилища?",
      imageUrl: "/uploads/logo.png",
      imageWidth: 50,
      imageHeight: 50,
      imageAlt: "Гафус",
      showCancelButton: true,
      confirmButtonText: "Удалить",
      cancelButtonText: "Отмена",
      confirmButtonColor: "#d32f2f",
      cancelButtonColor: "#FFF8E5",
      customClass: {
        popup: "swal2-popup-custom",
        title: "swal2-title-custom",
        htmlContainer: "swal2-content-custom",
        confirmButton: "swal2-confirm-custom",
        cancelButton: "swal2-cancel-custom",
      },
    });
    
    if (!confirmed.isConfirmed) {
      return;
    }
    
    const result = await deleteCourse(id);
    if (result.success) {
      setIsDownloaded(false);
      await showSuccessAlert("Курс удален из офлайн-хранилища");
    } else {
      await showErrorAlert(result.error || "Не удалось удалить курс");
    }
  };

  const getStatusText = () => {
    switch (userStatus) {
      case TrainingStatus.NOT_STARTED:
        return "Не начат";
      case TrainingStatus.IN_PROGRESS:
        return "В процессе";
      case TrainingStatus.COMPLETED:
        return "Завершен";
      default:
        return "Не начат";
    }
  };

  const getStatusColor = () => {
    switch (userStatus) {
      case TrainingStatus.NOT_STARTED:
        return styles.notStarted;
      case TrainingStatus.IN_PROGRESS:
        return styles.inProgress;
      case TrainingStatus.COMPLETED:
        return styles.completed;
      default:
        return styles.notStarted;
    }
  };

  const getReviewText = () => {
    const reviewCount = reviews?.length || 0;
    
    if (reviewCount === 0) {
      // Если отзывов нет
      return userStatus === TrainingStatus.COMPLETED ? "Оставить отзыв" : "Нет отзывов";
    }
    
    // Если есть отзывы
    return `${reviewCount} ${declOfNum(reviewCount, ["отзыв", "отзыва", "отзывов"])}`;
  };

  return (
    <li className={styles.courseCard}>
      <div className={styles.courseCardContent}>
      {useHardNavigation ? (
        <a href={`/trainings/${type}`} className={styles.link}>
          <div className={styles.imageContainer}>
            <Image
              src={finalSrc}
              alt={`${name} logo`}
              width={350}
              height={200}
              className={styles.image}
              onError={() => setImgError(true)}
            />
            {isPrivate && <div className={styles.privateBadge}>Приватный</div>}
          </div>

          <div className={styles.content}>
            <h3 className={styles.title}>{name}</h3>
            <div className={styles.meta}>
              <div className={styles.duration}>
                <span><b>Длительность:</b> {duration}</span>
              </div>
              <div className={styles.status}>
                <span className={getStatusColor()}>{getStatusText()}</span>
              </div>
            </div>
            <div className={styles.description}>
              <p><b>Уровень сложности:</b> {getTrainingLevelLabel(trainingLevel)}</p>
              <p><b>Описание:</b> {shortDesc}</p>
            </div>

            {startedAt && (
              <div className={styles.date}>
                <b>Начат:</b>{" "}
                {(() => {
                  if (startedAt instanceof Date) {
                    return startedAt.toLocaleDateString("ru-RU");
                  } else if (typeof startedAt === "string") {
                    const date = new Date(startedAt);
                    return isNaN(date.getTime()) ? startedAt : date.toLocaleDateString("ru-RU");
                  }
                  return startedAt;
                })()}
              </div>
            )}

            {completedAt && (
              <div className={styles.date}>
                <b>Завершен:</b>{" "}
                {(() => {
                  if (completedAt instanceof Date) {
                    return completedAt.toLocaleDateString("ru-RU");
                  } else if (typeof completedAt === "string") {
                    const date = new Date(completedAt);
                    return isNaN(date.getTime()) ? completedAt : date.toLocaleDateString("ru-RU");
                  }
                  return completedAt;
                })()}
              </div>
            )}
          </div>
        </a>
      ) : (
        <Link
          href={`/trainings/${type}`}
          className={styles.link}
          prefetch={false}
        >
          <div className={styles.imageContainer}>
            <Image
              src={finalSrc}
              alt={`${name} logo`}
              width={350}
              height={200}
              className={styles.image}
              onError={() => setImgError(true)}
            />
            {isPrivate && <div className={styles.privateBadge}>Приватный</div>}
          </div>

          <div className={styles.content}>
            <h3 className={styles.title}>{name}</h3>
            <div className={styles.meta}>
              <div className={styles.duration}>
                <span><b>Длительность:</b> {duration}</span>
              </div>
              <div className={styles.status}>
                <span className={getStatusColor()}>{getStatusText()}</span>
              </div>
            </div>
            <div className={styles.description}>
              <p><b>Уровень сложности:</b> {getTrainingLevelLabel(trainingLevel)}</p>
              <p><b>Описание:</b> {shortDesc}</p>
            </div>

            {startedAt && (
              <div className={styles.date}>
                <b>Начат:</b>{" "}
                {(() => {
                  if (startedAt instanceof Date) {
                    return startedAt.toLocaleDateString("ru-RU");
                  } else if (typeof startedAt === "string") {
                    const date = new Date(startedAt);
                    return isNaN(date.getTime()) ? startedAt : date.toLocaleDateString("ru-RU");
                  }
                  return startedAt;
                })()}
              </div>
            )}

            {completedAt && (
              <div className={styles.date}>
                <b>Завершен:</b>{" "}
                {(() => {
                  if (completedAt instanceof Date) {
                    return completedAt.toLocaleDateString("ru-RU");
                  } else if (typeof completedAt === "string") {
                    const date = new Date(completedAt);
                    return isNaN(date.getTime()) ? completedAt : date.toLocaleDateString("ru-RU");
                  }
                  return completedAt;
                })()}
              </div>
            )}
          </div>
        </Link>
      )}
      <div className={styles.rating}>
            <SimpleCourseRating 
              courseId={id} 
              initialRating={avgRating || 0} 
              readOnly={userStatus !== TrainingStatus.COMPLETED}
            />
            {(reviews && reviews.length > 0) || userStatus === TrainingStatus.COMPLETED ? (
              <NextLink 
                href={`/trainings/${type}/reviews`} 
                className={styles.reviewsLink}
              >
                {getReviewText()}
              </NextLink>
            ) : (
              <span className={styles.reviews}>{getReviewText()}</span>
            )}
          </div>
          </div>

      <div className={styles.author}>
        <div>
          Автор курса:&nbsp;
          {authorUsername ? (
            <NextLink href={`/profile?username=${authorUsername}`} className={styles.authorlink}>
              {authorUsername}
            </NextLink>
          ) : (
            <span>Неизвестный автор</span>
          )}
        </div>
        <FavoriteButton id={id} isFavorite={isFavorite} onUnfavorite={() => onUnfavorite?.(id)} />
      </div>

      {!isChecking && (
        <div className={styles.offlineActions}>
          {!isDownloaded ? (
            <button
              className={styles.downloadButton}
              onClick={handleDownload}
              disabled={isDownloading}
              title="Скачать курс для офлайн-доступа"
            >
              <Download className={styles.buttonIcon} />
              <span>{isDownloading ? "Скачивание..." : "Скачать"}</span>
            </button>
          ) : (
            <>
              <button
                className={styles.updateButton}
                onClick={handleUpdate}
                disabled={isUpdating}
                title="Обновить курс"
              >
                <Refresh className={`${styles.buttonIcon} ${isUpdating ? styles.spinning : ""}`} />
                <span>{isUpdating ? "Обновление..." : "Обновить"}</span>
              </button>
              <button
                className={styles.deleteButton}
                onClick={handleDelete}
                title="Удалить курс из офлайн-хранилища"
              >
                <Delete className={styles.buttonIcon} />
                <span>Удалить</span>
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
};
