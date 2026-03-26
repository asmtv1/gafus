/**
 * URL страницы профиля по логину. Маршрут /profile без ?username= отдаёт 404.
 */
export type ProfilePagePathMode = "navigate" | "revalidate";

export function profilePagePath(
  username: string | null | undefined,
  mode: ProfilePagePathMode = "navigate",
): string {
  const u = username?.trim() ?? "";
  if (!u) {
    return mode === "navigate" ? "/courses" : "/profile";
  }
  return `/profile?username=${encodeURIComponent(u)}`;
}
