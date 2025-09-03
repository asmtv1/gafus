// components/CourseCard.tsx
"use client";

import { TrainingStatus } from "@gafus/types";
import { useCourseStore } from "@shared/stores";
import Link from "next/link";
import NextLink from "next/link";
import { useEffect, useState } from "react";

import styles from "./CourseCard.module.css";


import type { CourseCardPropsWithIndex } from "@gafus/types";

import { declOfNum } from "@/utils";
import { CourseRating } from "../CourseRating";
import { FavoriteButton } from "../FavoriteButton";

// Заглушка по умолчанию для отсутствующих изображений
const DEFAULT_PLACEHOLDER = "/uploads/course-logo.webp";

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

  // Синхронизируем состояние избранного с store при изменении пропсов
  useEffect(() => {
    if (propIsFavorite !== isFavorite) {
      // Если пропс изменился, обновляем локальное состояние
      // Это поможет синхронизировать состояние между страницами
    }
  }, [propIsFavorite, isFavorite]);

  // Используем заглушку если изображение не загрузилось или если src пустой
  const finalSrc = imgError || !logoImg ? DEFAULT_PLACEHOLDER : logoImg;

  // Проверяем кэш изображения в useEffect
  useEffect(() => {
    const cached = isImageCached(logoImg);
    setIsImageAlreadyCached(cached);
  }, [logoImg, isImageCached]);

  // Отслеживаем загрузку изображения
  useEffect(() => {
    if (!isImageAlreadyCached) {
      const img = document.createElement("img");
      img.onload = () => markImageLoaded(logoImg);
      img.onerror = () => markImageError(logoImg);
      img.src = logoImg;
    }
  }, [logoImg, isImageAlreadyCached, markImageLoaded, markImageError]);

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
    if (!reviews || reviews.length === 0) return "Нет отзывов";
    return `${reviews.length} ${declOfNum(reviews.length, ["отзыв", "отзыва", "отзывов"])}`;
  };

  return (
    <li className={styles.courseCard}>
      <Link href={`/trainings/${type}`} className={styles.link}>
        <div className={styles.imageContainer}>
          {isImageAlreadyCached ? (
            <img
              src={finalSrc}
              alt={`${name} logo`}
              width={350}
              height={200}
              className={styles.image}
              onError={() => setImgError(true)}
            />
          ) : (
            <img
              src={finalSrc}
              alt={`${name} logo`}
              width={350}
              height={200}
              className={styles.image}
              onError={() => setImgError(true)}
            />
          )}
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
          <p > <b>Описание: </b>{shortDesc}</p>
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

          <div className={styles.rating}>
            <CourseRating courseId={id} initialRating={avgRating || 0} />
            <span className={styles.reviews}>{getReviewText()}</span>
          </div>
        </div>
      </Link>

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
    </li>
  );
};
