"use client";

import { signIn } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Обрабатывает vk_id_token из URL (callback редиректит на /courses?vk_id_token=...).
 * Вызывает signIn, очищает URL. Исключает промежуточный редирект через /.
 */
export function VkIdTokenHandler() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const vkToken = searchParams.get("vk_id_token");
    if (!vkToken || pathname !== "/courses") return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("vk_id_token");
    const cleanUrl = params.toString() ? `/courses?${params}` : "/courses";

    signIn("credentials", {
      username: "__vk_id__",
      password: vkToken,
      redirect: false,
    }).then((res) => {
      if (res?.error) {
        router.replace("/login?error=vk_id_auth_failed");
      } else {
        router.replace(cleanUrl, { scroll: false });
        router.refresh();
      }
    });
  }, [searchParams, pathname, router]);

  return null;
}
