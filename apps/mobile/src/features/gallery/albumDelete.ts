import { galleryTransport } from "@/shared/lib/api/gallery";
import { sameGalleryActor, type GalleryActor, privateGalleryReads } from "./privateRead";
import { reportClientError } from "@/shared/lib/tracer";
export type AlbumDeleteOutcome = "confirmed" | "unknown" | "rejected" | "stale";
/** One DELETE followed by guarded GET. Only server NOT_FOUND proves deletion. */
export async function deleteAlbumAndConfirm({
  actor,
  albumId,
  live,
}: {
  actor: GalleryActor;
  albumId: string;
  live: () => boolean;
}): Promise<AlbumDeleteOutcome> {
  const guard = () => live() && sameGalleryActor(actor);
  if (!albumId || !guard()) return "stale";
  try {
    const ack = await galleryTransport<{ id: string }>(`albums/${encodeURIComponent(albumId)}`, {
      method: "DELETE",
      requestGuard: guard,
    });
    if (!guard()) return "stale";
    if (ack?.id !== albumId) return "unknown";
    try {
      await privateGalleryReads(actor, live).getAlbum(albumId);
      if (!guard()) return "stale";
      return "unknown";
    } catch (error) {
      if (!guard()) return "stale";
      if ((error as { code?: unknown } | null)?.code === "NOT_FOUND") return "confirmed";
      // Fixed synthetic telemetry only: never log signed URL or object key from GET.
      reportClientError(new Error("GALLERY_ALBUM_DELETE_READBACK_UNKNOWN"), {
        issueKey: "GalleryAlbumDelete",
        keys: { operation: "confirm_absence" },
      });
      return "unknown";
    }
  } catch (error) {
    if (!guard()) return "stale";
    const code = (error as { code?: unknown } | null)?.code;
    if (
      code === "VALIDATION" ||
      code === "FORBIDDEN" ||
      code === "GALLERY_DISABLED" ||
      code === "NOT_FOUND"
    )
      return "rejected";
    reportClientError(new Error("GALLERY_ALBUM_DELETE_UNKNOWN"), {
      issueKey: "GalleryAlbumDelete",
      keys: { operation: "delete_and_readback" },
    });
    return "unknown";
  }
}
