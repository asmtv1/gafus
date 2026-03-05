/**
 * Ambient declaration для динамического импорта @gafus/core/services/auth.
 * Модуль доступен в runtime (web app), но auth не может зависеть от core из-за цикла.
 */
declare module "@gafus/core/services/auth" {
  export interface VkProfile {
    id: string;
    first_name?: string;
    last_name?: string;
    avatar?: string;
  }

  export function findOrCreateVkUser(
    vkProfile: VkProfile,
    providerAccountId: string,
  ): Promise<{ user: { id: string; username: string; role: string }; needsPhone: boolean }>;
}
