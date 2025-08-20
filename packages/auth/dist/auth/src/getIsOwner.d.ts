import type { NextApiRequest } from "next";
/**
 * Проверяет, является ли текущий пользователь владельцем профиля.
 * Совместимо с Edge Runtime.
 */
export declare function getIsOwner(profileUsername: string, req?: NextApiRequest): Promise<boolean>;
//# sourceMappingURL=getIsOwner.d.ts.map