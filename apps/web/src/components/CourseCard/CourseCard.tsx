// components/CourseCard.tsx
import Link from "next/link";
import { ROUTES } from "@/constants";
import styles from "./CourseCard.module.css";
import { FavoriteButton } from "./FavoriteButton";
import CourseRating, {
  ClientCourseRating,
} from "@/components/CourseCard/CourseRating";
import Image from "next/image";
import type { Course } from "@gafus/types";

type CourseCardProps = Omit<Course, "description"> & {
  onUnfavorite?: () => void;
  startedAt?: Date | null;
  completedAt?: Date | null;
};

export const CourseCard: React.FC<CourseCardProps> = ({
  id,
  name,
  type,
  duration,
  logoImg,
  userStatus,
  startedAt,
  completedAt,
  shortDesc,
  authorUsername,
  createdAt,
  avgRating,
  reviews,
  isFavorite,
  onUnfavorite,
}) => {
  let statusLabel = "";
  let showStartDate = false;
  let showCompleteDate = false;

  switch (userStatus) {
    case "IN_PROGRESS":
      statusLabel = "Курс начат:";
      showStartDate = !!startedAt;
      break;
    case "NOT_STARTED":
      if (startedAt) {
        statusLabel = "Курс начат:";
        showStartDate = true;
      } else {
        statusLabel = "Курс не начат";
      }
      break;
    case "COMPLETED":
      statusLabel = "Прохождение закончено:";
      showCompleteDate = !!completedAt;
      break;
    default:
      statusLabel = "";
  }

  return (
    <li className={styles.card}>
      <Link href={ROUTES.TRAINING_DETAIL(type)} className={styles.link}>
        <div className={styles.imageContainer}>
          <Image
            src={logoImg}
            alt={name}
            className={styles.image}
            width={240}
            height={135}
            priority
          />
        </div>
        <div className={styles.content}>
          <h2 className={styles.title}>{name}</h2>
          <p className={styles.duration}>Продолжительность: {duration}</p>
          {statusLabel && (
            <p className={styles.duration}>
              {statusLabel}
              {showStartDate &&
                startedAt &&
                new Date(startedAt).toLocaleDateString()}
              {showCompleteDate &&
                completedAt &&
                new Date(completedAt).toLocaleDateString()}
            </p>
          )}
          <p className={styles.description}>{shortDesc}</p>
          <p className={styles.createdAt}>
            Курс опубликован:{" "}
            {createdAt && new Date(createdAt).toLocaleDateString()}
          </p>
        </div>
      </Link>
      <div className={styles.ratingWrapper}>
        {completedAt ? (
          <ClientCourseRating courseId={id} initialRating={avgRating || 0} />
        ) : (
          <>
            <span>Рейтинг курса: </span>
            <CourseRating value={avgRating || 0} />
          </>
        )}
        <p>Оценок : {reviews.length}</p>
      </div>
      <div className={styles.author}>
        <div>
          автор курса :
          <a
            href={`/profile?username=${authorUsername}`}
            className={styles.authorlink}
          >
            {authorUsername}
          </a>
        </div>
        <FavoriteButton
          id={id}
          isFavorite={isFavorite}
          onUnfavorite={onUnfavorite}
        />
      </div>
    </li>
  );
};
