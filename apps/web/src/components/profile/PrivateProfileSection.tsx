import type { UserWithTrainings } from "@/types/user";
import type { LiteCourse } from "@/types/course";
import Link from "next/link";
import MyCourses from "./MyCourses";
import MyCreatedCourses from "./MyCreatedCourses";

interface PrivateProfileSectionProps {
  user: UserWithTrainings;
  createdCourses: LiteCourse[];
}

export default function PrivateProfileSection({
  user,
  createdCourses,
}: PrivateProfileSectionProps) {
  return (
    <section>
      <p>Ник: {user.username}</p>
      <p>Телефон: {user.phone}</p>
      <Link href="/passwordReset">
        <button>Сменить пароль</button>
      </Link>

      {createdCourses.length > 0 && (
        <>
          <h3>Созданные курсы:</h3>
          {createdCourses.map((course) => (
            <MyCreatedCourses key={course.id} course={course} />
          ))}
        </>
      )}

      <h3>Начатые курсы:</h3>
      {user.courses.length === 0 ? (
        <div>Вы пока не начали ни один курс</div>
      ) : (
        <ul>
          {user.courses.map((course) => (
            <MyCourses key={course.courseId} {...course} />
          ))}
        </ul>
      )}
    </section>
  );
}
