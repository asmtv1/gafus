/** Keep short drags for native controls and horizontal swipes for media paging. */
export function shouldDismissMediaSwipe(translationY: number, velocityY: number) {
  "worklet";
  return translationY > 115 || (translationY > 50 && velocityY > 900);
}
