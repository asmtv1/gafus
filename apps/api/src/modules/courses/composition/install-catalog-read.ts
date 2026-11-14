/** Bind narrow viewer-scoped SQL catalog projections before Hono routes.
 * Private membership, favorites and progress must be restricted to owner in SQL.
 * Core alone owns paywall, private-course visibility and wire projection.
 */
import { registerCatalogReadPort, type CatalogReadPort } from "@gafus/core/services/course";
import {
  readCatalogCourseRows, readCatalogProgressRows, readCatalogFavoriteRows,
  readCourseAccessByType, readCourseAccessById,
  readCourseMetadataRow, readCourseOutlineRow,
} from "@gafus/course-read-server/legacy-catalog-rows";

const catalogReadPort: CatalogReadPort = {
  readCatalogCourseRows,
  readCatalogProgressRows,
  readCatalogFavoriteRows,
  readCourseAccessByType,
  readCourseAccessById,
  readCourseMetadataRow,
  readCourseOutlineRow,
};
registerCatalogReadPort(catalogReadPort);
