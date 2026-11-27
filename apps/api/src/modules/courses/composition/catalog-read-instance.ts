/** Bind narrow viewer-scoped SQL catalog projections before Hono routes.
 * Private membership, favorites and progress must be restricted to owner in SQL.
 * Core alone owns paywall, private-course visibility and wire projection.
 */
import { createCatalogReadService, type CatalogReadPort } from "@gafus/core/services/course";
import {
  readCatalogCourseRows, readCatalogProgressRows, readCatalogFavoriteRows,
  readCourseAccessByType, readCourseAccessById,
  readCourseMetadataRow, readCourseOutlineRow,
} from "@gafus/course-read-server/legacy-catalog-rows";

import { resolveCourseEntitlement } from "../../content-access/composition/content-policy-instance.js";

const catalogReadPort: CatalogReadPort = {
  readCatalogCourseRows,
  readCatalogProgressRows,
  readCatalogFavoriteRows,
  readCourseAccessByType,
  readCourseAccessById,
  readCourseMetadataRow,
  readCourseOutlineRow,
};
export const { getCoursesWithProgress, checkCourseAccess, checkCourseAccessById, getCourseMetadata, getCourseOutline } =
  createCatalogReadService(catalogReadPort, resolveCourseEntitlement);
