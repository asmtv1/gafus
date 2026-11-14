import type { CourseWithProgressData } from "@gafus/types";

/** Exact owner-scoped read projections used by Core catalog policy. Persistence
 * selects only current-viewer access/favorites/progress and never leaks buyers.
 * These are domain DTOs: Prisma selection types stay in the DB adapter.
 */
export type CatalogCourseRow = {
  id: string;
  name: string;
  type: string;
  description: string;
  shortDesc: string;
  duration: string;
  logoImg: string;
  isPrivate: boolean;
  isPaid: boolean;
  avgRating: number | null;
  trainingLevel: CourseWithProgressData["trainingLevel"];
  equipment: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: { username: string; profile: { avatarUrl: string | null } | null };
  reviews: {
    rating: number | null;
    comment: string | null;
    createdAt: Date;
    user: { username: string; profile: { avatarUrl: string | null } | null };
  }[];
  _count: { userCourses: number };
  dayLinks: {
    id: string;
    order: number;
    day: {
      id: string;
      title: string;
      stepLinks: { id: string; order: number; step: { title: string } }[];
    };
  }[];
  favoritedBy: { userId: string }[];
  access: { userId: string }[];
};
export type CatalogUserProgressRow = {
  courseId: string;
  /** SQL enum value; Core converts it into public TrainingStatus. */
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
};
export type CatalogCoursePolicyRow = { id: string; isPrivate: boolean; isPaid: boolean };
export type CatalogMetadataRow = {
  id: string; name: string; shortDesc: string; logoImg: string;
  description: string; isPaid: boolean; isPrivate: boolean;
  videoUrl: string | null; equipment: string;
  trainingLevel: CourseWithProgressData["trainingLevel"];
};
export type CatalogOutlineRow = {
  dayLinks: {
    id: string; order: number;
    day: {
      title: string; type: string; equipment: string;
      stepLinks: {
        step: { type: string; durationSec: number | null; estimatedDurationSec: number | null };
      }[];
    };
  }[];
};
export interface CatalogReadPort {
  readCatalogCourseRows(viewerId?: string): Promise<CatalogCourseRow[]>;
  readCatalogProgressRows(viewerId?: string): Promise<CatalogUserProgressRow[]>;
  readCatalogFavoriteRows(viewerId?: string): Promise<{ courseId: string }[]>;
  readCourseAccessByType(courseType: string): Promise<CatalogCoursePolicyRow | null>;
  readCourseAccessById(courseId: string): Promise<CatalogCoursePolicyRow | null>;
  readCourseMetadataRow(courseType: string): Promise<CatalogMetadataRow | null>;
  readCourseOutlineRow(courseType: string): Promise<CatalogOutlineRow | null>;
}
let boundCatalogReadPort: Readonly<CatalogReadPort> | null = null;
export function registerCatalogReadPort(port: CatalogReadPort): void {
  if (boundCatalogReadPort !== null && boundCatalogReadPort !== port) {
    throw new Error("COURSE_CATALOG_READ_PORT_ALREADY_BOUND");
  }
  boundCatalogReadPort = port;
}
export function requireCatalogReadPort(): Readonly<CatalogReadPort> {
  if (!boundCatalogReadPort) throw new Error("COURSE_CATALOG_READ_PORT_UNBOUND");
  return boundCatalogReadPort;
}
