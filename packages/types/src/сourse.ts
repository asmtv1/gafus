export interface Course {
  id: number;
  description: string;
  duration: string;
  logoImg: string;
  name: string;
  type: string;
  userStatus: string;
  shortDesc: string;
  authorUsername: string;
  createdAt: Date;
  isFavorite: boolean;
  avgRating: number | null;
  reviews: {
    id: number;
    createdAt: Date;
    updatedAt: Date;
    courseId: number;
    userId: string;
    rating: number | null;
    comment: string | null;
  }[];
}
export type LiteCourse = Pick<Course, "id" | "name"> & {
  userCourses: {
    completedDays: number[];
    startedAt: Date | null;
    completedAt: Date | null;
    user: {
      id: string;
      username: string;
    };
  }[];
};
