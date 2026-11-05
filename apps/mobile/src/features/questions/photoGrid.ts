/** Keep every question/answer photo visible while using the card's full width.
 * Five photos use 3+2, four use 2+2; each row's cells grow equally. */
export function questionPhotoGridRows<T>(photos: readonly T[]): { photo: T; index: number }[][] {
  const columns = photos.length === 2 || photos.length === 4 ? 2 : 3;
  const rows: { photo: T; index: number }[][] = [];
  for (let index = 0; index < photos.length; index += columns) {
    rows.push(photos.slice(index, index + columns).map((photo, offset) => ({
      photo, index: index + offset,
    })));
  }
  return rows;
}
