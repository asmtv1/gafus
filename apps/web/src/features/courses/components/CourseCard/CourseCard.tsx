// components/CourseCard.tsx
"use client";

import { TrainingStatus } from "@gafus/types";
import { useCourseStore } from "@shared/stores";
import Image from "next/image";
import Link from "next/link";
import NextLink from "next/link";
import { useEffect, useState } from "react";
import {
  AccessTime,
  SignalCellularAlt,
  CheckCircleOutline,
  GroupOutlined,
} from "@mui/icons-material";

import styles from "./CourseCard.module.css";

import type { CourseCardPropsWithIndex } from "./types";

import { declOfNum } from "@gafus/core/utils";
import { STEP_STATUS_LABELS } from "@gafus/core/utils/training";
import { SimpleCourseRating } from "../CourseRating";
import { useOfflineStore } from "@shared/stores/offlineStore";
import { FavoriteButton } from "../FavoriteButton/FavoriteButton";

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

const formatPriceRub = (priceRub: number | null) => {
  if (priceRub == null) {
    return "уточняется";
  }

  return `${new Intl.NumberFormat("ru-RU").format(priceRub)} ₽`;
};

const SHOW_COURSE_AUTHOR_PILL = false;
const SHOW_COURSE_RATING_AND_REVIEWS = false;

export const CourseCard = ({
  id,
  name,
  type,
  duration,
  logoImg,
  isPrivate = false,
  isPaid = false,
  priceRub,
  userStatus = TrainingStatus.NOT_STARTED,
  startedAt,
  completedAt,
  shortDesc,
  authorUsername,
  authorAvatarUrl,
  createdAt: _createdAt,
  avgRating,
  trainingLevel,
  reviews,
  startedUsersCount,
  isFavorite: propIsFavorite,
  onUnfavorite,
  onPaidCourseClick,
  index = 0,
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

  // Проверяем наличие ожидающих синхронизации действий для этого курса
  const syncQueue = useOfflineStore((state) => state.syncQueue);
  const hasPendingSync = syncQueue.some(
    (action) =>
      action.type === "step-status-update" && (action.data as { courseId: string }).courseId === id,
  );

  // Синхронизируем состояние избранного с store при изменении пропсов
  useEffect(() => {
    if (propIsFavorite !== isFavorite) {
      // Если пропс изменился, обновляем локальное состояние
      // Это поможет синхронизировать состояние между страницами
    }
  }, [propIsFavorite, isFavorite]);

  const finalSrc = !logoImg
    ? DEFAULT_PLACEHOLDER
    : imgError
      ? DEFAULT_PLACEHOLDER
      : logoImg;

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

  const getStatusText = () =>
    STEP_STATUS_LABELS[userStatus as TrainingStatus] ??
    STEP_STATUS_LABELS[TrainingStatus.NOT_STARTED];

  const getStatusColor = () => {
    switch (userStatus) {
      case TrainingStatus.NOT_STARTED:
        return styles.notStarted;
      case TrainingStatus.IN_PROGRESS:
        return styles.inProgress;
      case TrainingStatus.COMPLETED:
        return styles.completed;
      case TrainingStatus.PAUSED:
        return styles.inProgress;
      case TrainingStatus.RESET:
        return styles.reset;
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
    <li
      className={styles.courseCard}
      data-tour-target={index === 0 ? "courses-first-card" : undefined}
    >
      <div className={styles.courseCardContent}>
        <Link
          href={`/trainings/${type}`}
          className={styles.link}
          prefetch={false}
        >
          <div className={styles.imageContainer}>
            <div className={styles.imageFrame}>
              <Image
                src={finalSrc}
                alt={`Обложка курса «${name}»`}
                width={350}
                height={200}
                className={styles.image}
                onError={() => setImgError(true)}
              />
            </div>
          </div>

          <div className={styles.content}>
            {(isPaid || isPrivate) && (
              <div className={styles.accessLabels}>
                {isPaid && <span className={styles.accessLabel}>Платный</span>}
                {isPaid && <span className={styles.accessLabel}>{formatPriceRub(priceRub)}</span>}
                {isPrivate && <span className={styles.accessLabel}>Приватный</span>}
              </div>
            )}
            <h3 className={styles.title}>{name}</h3>
            <div className={styles.factsRow}>
              <span className={styles.fact}>
                <AccessTime aria-hidden="true" className={styles.factIcon} />
                <span>{duration}</span>
              </span>
              <span className={styles.fact}>
                <SignalCellularAlt aria-hidden="true" className={styles.factIcon} />
                <span>{getTrainingLevelLabel(trainingLevel)}</span>
              </span>
              <span className={`${styles.fact} ${getStatusColor()}`}>
                <CheckCircleOutline aria-hidden="true" className={styles.factIcon} />
                <span>{getStatusText()}</span>
                {hasPendingSync && (
                  <span className={styles.pendingIndicator} title="Ожидает синхронизации">
                    ⏳
                  </span>
                )}
              </span>
            </div>
            <div className={styles.description}>
              <p>{shortDesc}</p>
            </div>

            {typeof startedUsersCount === "number" && startedUsersCount > 0 ? (
              <div className={styles.participants}>
                <GroupOutlined aria-hidden="true" className={styles.participantsIcon} />
                Этот курс уже прошли {startedUsersCount}{" "}
                {declOfNum(startedUsersCount, ["человек", "человека", "человек"])}
              </div>
            ) : null}

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
        {SHOW_COURSE_RATING_AND_REVIEWS && <div className={styles.rating}>
          <SimpleCourseRating
            courseId={id}
            initialRating={avgRating || 0}
            readOnly={userStatus !== TrainingStatus.COMPLETED}
          />
          {(reviews && reviews.length > 0) || userStatus === TrainingStatus.COMPLETED ? (
            <NextLink href={`/trainings/${type}/reviews`} className={styles.reviewsLink}>
              {getReviewText()}
            </NextLink>
          ) : (
            <span className={styles.reviews}>{getReviewText()}</span>
          )}
        </div>}
      </div>

      {SHOW_COURSE_AUTHOR_PILL ? (
        <div className={styles.author}>
          <div className={styles.authorPill}>
            <div className={styles.authorInfo}>
              <div className={styles.authorAvatar}>
                {authorAvatarUrl ? (
                  <Image
                    src={authorAvatarUrl}
                    alt=""
                    width={44}
                    height={44}
                    className={styles.authorAvatarImg}
                    unoptimized={authorAvatarUrl.startsWith("http")}
                  />
                ) : null}
              </div>
              <div className={styles.authorTextWrap}>
                <div className={styles.authorLine}>
                  <span className={styles.authorLabel}>Автор курса: </span>
                  {authorUsername ? (
                    <NextLink href={`/profile?username=${authorUsername}`} className={styles.authorlink}>
                      {authorUsername}
                    </NextLink>
                  ) : (
                    <span>Неизвестный автор</span>
                  )}
                </div>
              </div>
            </div>
            <div className={styles.authorBookmarkWrap}>
              <FavoriteButton id={id} isFavorite={isFavorite} onUnfavorite={() => onUnfavorite?.(id)} />
            </div>
          </div>
        </div>
      ) : null}

    </li>
  );
};
