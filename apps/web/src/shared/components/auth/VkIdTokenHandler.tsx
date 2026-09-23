"use client";

import { trackEvent } from "@gafus/analytics";
import { signIn } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Обрабатывает vk_id_token из URL (callback редиректит на /courses?vk_id_token=...).
 * Вызывает signIn, очищает URL. Исключает промежуточный редирект через /.
 */
export function VkIdTokenHandler() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const searchQueryKey = searchParams.toString();
  const exchange = useRef<{ token: string; promise: ReturnType<typeof signIn> } | null>(null);

  useEffect(() => {
    const vkToken = searchParams.get("vk_id_token");
    if (!vkToken || pathname !== "/courses") return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("vk_id_token");
    const cleanUrl = params.toString() ? `/courses?${params}` : "/courses";

    let active = true;
    // VK tokens are single-use. Reuse the exchange on StrictMode's effect replay
    // and query changes instead of trying to consume the same token twice.
    if (exchange.current?.token !== vkToken) {
      exchange.current = {
        token: vkToken,
        promise: signIn("credentials", {
          username: "__vk_id__",
          password: vkToken,
          redirect: false,
        }),
      };
    }
    void exchange.current.promise.then((res) => {
      if (!active) return;
      if (!res || res.error || !res.ok) {
        router.replace("/login?error=vk_id_auth_failed");
      } else {
        trackEvent({
          eventName: "login_success",
          platform: "web",
          pathOrScreen: "/courses",
          method: "vk",
        });
        router.replace(cleanUrl, { scroll: false });
        router.refresh();
      }
    }).catch(() => {
      if (active) router.replace("/login?error=vk_id_auth_failed");
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams нестабилен; смена query — searchQueryKey.
  }, [searchQueryKey, pathname, router]);

  return null;
}
