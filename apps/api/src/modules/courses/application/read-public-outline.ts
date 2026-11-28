/** Application decides anonymous publication eligibility before querying day structure. */
import type { isPublicPaidCourse, projectPublicPaidCourseOutline } from "@gafus/core/services/course/publicOutlinePolicy";
import type { CatalogReadService } from "@gafus/core/services/course";

export function createPublicPaidCourseOutlineApplication(ports: {
  metadata: CatalogReadService["getCourseMetadata"];
  outline: CatalogReadService["getCourseOutline"];
  isPublicPaidCourse: typeof isPublicPaidCourse;
  projectPublicPaidCourseOutline: typeof projectPublicPaidCourseOutline;
}) {
  return {
    async execute({ courseType }: { courseType: string }) {
      const metadata = await ports.metadata(courseType);
      if (!ports.isPublicPaidCourse(metadata)) return { kind: "not_found" as const };
      const outline = await ports.outline(courseType);
      return {
        kind: "found" as const,
        data: ports.projectPublicPaidCourseOutline(courseType, metadata, outline),
      };
    },
  };
}
